-- ============================================================================
-- MIGRATION: 0449_crmonia_hierarchical_playbook_engine.sql
-- PURPOSE: Deep-Dive Hierarchical Playbook Builder, Block-Level AST Governance,
--          Deny-Wins Settings Inheritance, Dual-Brain Telemetry & Conversion Seam
-- ARCHITECTURE: CRMONIA (PII + EXPADIO Enterprise Base)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS leads;
CREATE SCHEMA IF NOT EXISTS gtm;
CREATE SCHEMA IF NOT EXISTS comms;
CREATE SCHEMA IF NOT EXISTS audit;

-- ----------------------------------------------------------------------------
-- 0. CORE ENUMS & ORGANIZATIONAL HIERARCHY
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_tier_enum') THEN
    CREATE TYPE platform.org_tier_enum AS ENUM (
      'BRAND_HQ',
      'COUNTRY',
      'REGION',
      'BRANCH',
      'UNIT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'policy_merge_strategy') THEN
    CREATE TYPE platform.policy_merge_strategy AS ENUM (
      'MIN_CEILING',      -- Downward node can only set a LOWER number (e.g. max_daily_sends <= 30)
      'MAX_FLOOR',        -- Downward node can only set a HIGHER number (e.g. min_icp_score >= 60)
      'STRICT_IMMUTABLE', -- Downward node cannot override parent value
      'ARRAY_SUBSET'      -- Downward node can only select a subset of parent's allowed list
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'block_lock_type') THEN
    CREATE TYPE gtm.block_lock_type AS ENUM (
      'IMMUTABLE_LOCKED',      -- Downline cannot edit or delete (e.g., Regulatory / CASL / FSRA Footer)
      'TOKEN_SLOTS_ONLY',      -- Downline can only populate {{tokens}} inside the block
      'EDITABLE_WITH_APPROVAL',-- Downline edits trigger Compliance Officer review gate before launch
      'FREE_LOCAL_EDIT'        -- Downline can freely customize copy or AI prompt
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'step_node_type') THEN
    CREATE TYPE gtm.step_node_type AS ENUM (
      'EMAIL_OUTBOUND',
      'AI_VOICE_CALL',
      'SMS_WHATSAPP',
      'LINKEDIN_ACTION',
      'CRM_MANUAL_CALL_TASK',
      'WAIT_DELAY',
      'CONDITION_BRANCH',
      'AUTO_CONVERT_TO_CRM'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_lock_mode_enum') THEN
    CREATE TYPE gtm.template_lock_mode_enum AS ENUM (
      'STRICT_LOCKED',
      'TOKEN_LOCALIZATION_ONLY',
      'EDITABLE_WITH_APPROVAL',
      'FLEXIBLE'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_stage_enum') THEN
    CREATE TYPE platform.crm_stage_enum AS ENUM (
      'NEW',
      'QUALIFIED',
      'PROPOSAL',
      'WON',
      'LOST'
    );
  END IF;
END $$;

-- 0.1 Org Nodes (Subtree Hierarchy using PostgreSQL ltree)
CREATE TABLE IF NOT EXISTS platform.org_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  parent_id UUID REFERENCES platform.org_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tier platform.org_tier_enum NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'CA',
  org_path ltree NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_nodes_path_gist ON platform.org_nodes USING GIST (org_path);
CREATE INDEX IF NOT EXISTS idx_org_nodes_tenant ON platform.org_nodes (tenant_id);

-- ----------------------------------------------------------------------------
-- 1. SETTINGS CORE: DENY-WINS HIERARCHICAL POLICY INHERITANCE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.governance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  org_node_id UUID NOT NULL REFERENCES platform.org_nodes(id) ON DELETE CASCADE,
  org_path ltree NOT NULL,
  policy_key TEXT NOT NULL, -- e.g. 'gtm.max_daily_sends_per_inbox', 'gtm.min_icp_fit_score'
  merge_strategy platform.policy_merge_strategy NOT NULL,
  numeric_value NUMERIC(12,4),
  json_value JSONB,
  enforced_by_tier platform.org_tier_enum NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, org_node_id, policy_key)
);

CREATE INDEX IF NOT EXISTS idx_gov_policies_path_gist ON platform.governance_policies USING GIST (org_path);

-- Function: Resolve effective policy value for any downward node using Deny-Wins
CREATE OR REPLACE FUNCTION platform.resolve_effective_numeric_policy(
  p_tenant_id UUID,
  p_target_org_path ltree,
  p_policy_key TEXT,
  p_default_val NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  v_strategy platform.policy_merge_strategy;
  v_result NUMERIC;
BEGIN
  SELECT merge_strategy INTO v_strategy
  FROM platform.governance_policies
  WHERE tenant_id = p_tenant_id
    AND org_path @> p_target_org_path
    AND policy_key = p_policy_key
  ORDER BY nlevel(org_path) ASC
  LIMIT 1;

  IF v_strategy IS NULL THEN
    RETURN p_default_val;
  ELSIF v_strategy = 'MIN_CEILING' THEN
    -- Lowest ceiling along the ancestor chain wins
    SELECT MIN(numeric_value) INTO v_result
    FROM platform.governance_policies
    WHERE tenant_id = p_tenant_id AND org_path @> p_target_org_path AND policy_key = p_policy_key;
    RETURN COALESCE(v_result, p_default_val);
  ELSIF v_strategy = 'MAX_FLOOR' THEN
    -- Highest floor along the ancestor chain wins
    SELECT MAX(numeric_value) INTO v_result
    FROM platform.governance_policies
    WHERE tenant_id = p_tenant_id AND org_path @> p_target_org_path AND policy_key = p_policy_key;
    RETURN COALESCE(v_result, p_default_val);
  ELSE
    -- Topmost ancestor (STRICT_IMMUTABLE) wins
    SELECT numeric_value INTO v_result
    FROM platform.governance_policies
    WHERE tenant_id = p_tenant_id AND org_path @> p_target_org_path AND policy_key = p_policy_key
    ORDER BY nlevel(org_path) ASC LIMIT 1;
    RETURN COALESCE(v_result, p_default_val);
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------------------
-- 2. STRUCTURED TEMPLATES & PLAYBOOKS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comms.structured_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  owner_org_node_id UUID NOT NULL REFERENCES platform.org_nodes(id),
  owner_org_path ltree NOT NULL,
  parent_template_id UUID REFERENCES comms.structured_templates(id),
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'AI_VOICE', 'SMS', 'LINKEDIN')),
  name TEXT NOT NULL,
  subject_spintax TEXT,
  content_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_ai_drafted BOOLEAN NOT NULL DEFAULT false,
  compliance_status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (compliance_status IN (
    'DRAFT_UNAPPROVED',
    'PENDING_CCO_REVIEW',
    'APPROVED',
    'REJECTED'
  )),
  approved_by_user_id UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gtm.playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  owner_org_node_id UUID NOT NULL REFERENCES platform.org_nodes(id),
  owner_org_path ltree NOT NULL,
  parent_playbook_id UUID REFERENCES gtm.playbooks(id),
  title TEXT NOT NULL,
  description TEXT,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED_DOWNLINE', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  allowed_downline_tiers platform.org_tier_enum[] NOT NULL DEFAULT ARRAY['REGION'::platform.org_tier_enum, 'BRANCH'::platform.org_tier_enum, 'UNIT'::platform.org_tier_enum],
  template_lock_mode gtm.template_lock_mode_enum NOT NULL DEFAULT 'TOKEN_LOCALIZATION_ONLY',
  max_daily_sends_per_inbox INT NOT NULL DEFAULT 30,
  bounce_circuit_breaker_pct NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  icp_rubric JSONB NOT NULL DEFAULT '{}'::jsonb,
  trigger_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  localized_tokens JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playbooks_owner_path ON gtm.playbooks USING GIST (owner_org_path);

CREATE TABLE IF NOT EXISTS gtm.playbook_token_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID NOT NULL REFERENCES gtm.playbooks(id) ON DELETE CASCADE,
  token_key TEXT NOT NULL,
  display_label TEXT NOT NULL,
  resolution_source TEXT NOT NULL CHECK (resolution_source IN (
    'ORG_NODE_METADATA',
    'ASSIGNED_REP_PROFILE',
    'PROSPECT_OBSERVATION',
    'AI_DYNAMIC_ICEBREAKER',
    'DOWNLINE_MANUAL_INPUT',
    'JURISDICTION_COMPLIANCE_ENGINE'
  )),
  is_required BOOLEAN NOT NULL DEFAULT true,
  default_fallback_value TEXT,
  validation_regex TEXT,
  UNIQUE (playbook_id, token_key)
);

CREATE TABLE IF NOT EXISTS gtm.playbook_dag_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID NOT NULL REFERENCES gtm.playbooks(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  node_type gtm.step_node_type NOT NULL,
  ui_position_x INT NOT NULL DEFAULT 0,
  ui_position_y INT NOT NULL DEFAULT 0,
  wait_duration_hours INT DEFAULT 72,
  condition_expression JSONB,
  structured_template_id UUID REFERENCES comms.structured_templates(id),
  next_node_on_true TEXT,
  next_node_on_false TEXT,
  can_downline_skip_step BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (playbook_id, node_key)
);

CREATE TABLE IF NOT EXISTS gtm.playbook_step_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  playbook_id UUID NOT NULL REFERENCES gtm.playbooks(id) ON DELETE CASCADE,
  dag_node_id UUID NOT NULL REFERENCES gtm.playbook_dag_nodes(id) ON DELETE CASCADE,
  org_node_id UUID NOT NULL REFERENCES platform.org_nodes(id),
  org_path ltree NOT NULL,
  variant_letter CHAR(1) NOT NULL CHECK (variant_letter ~ '^[A-Z]$'),
  subject_override TEXT,
  content_blocks_override JSONB,
  traffic_weight_pct INT NOT NULL DEFAULT 100 CHECK (traffic_weight_pct BETWEEN 0 AND 100),
  sends_count INT NOT NULL DEFAULT 0,
  opens_count INT NOT NULL DEFAULT 0,
  replies_count INT NOT NULL DEFAULT 0,
  positive_intent_count INT NOT NULL DEFAULT 0,
  converted_leads_count INT NOT NULL DEFAULT 0,
  promoted_to_master_at TIMESTAMPTZ,
  promoted_by_user_id UUID,
  UNIQUE (dag_node_id, org_node_id, variant_letter)
);

CREATE INDEX IF NOT EXISTS idx_step_variants_org_path ON gtm.playbook_step_variants USING GIST (org_path);

-- ----------------------------------------------------------------------------
-- 3. PROSPECTS, CANONICAL CRM LEADS & ENROLLMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gtm.prospect_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  org_node_id UUID NOT NULL REFERENCES platform.org_nodes(id),
  org_path ltree NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'CA',
  playbook_id UUID REFERENCES gtm.playbooks(id),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  job_title TEXT,
  canonical_geo_id TEXT,
  fit_score INT CHECK (fit_score BETWEEN 0 AND 100),
  fit_band TEXT CHECK (fit_band IN ('STRONG', 'GOOD', 'FAIR', 'DISQUALIFIED')),
  converted_crm_lead_id UUID,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_obs_path ON gtm.prospect_observations USING GIST (org_path);
CREATE INDEX IF NOT EXISTS idx_prospect_obs_email ON gtm.prospect_observations (email);

CREATE TABLE IF NOT EXISTS platform.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  org_node_id UUID NOT NULL REFERENCES platform.org_nodes(id),
  org_path ltree NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'CA',
  assigned_user_id UUID,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  job_title TEXT,
  canonical_geo_id TEXT,
  stage platform.crm_stage_enum NOT NULL DEFAULT 'NEW',
  estimated_value_cents BIGINT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'outbound_gtm',
  first_touch_utm JSONB NOT NULL DEFAULT '{}'::jsonb,
  gtm_prospect_id UUID REFERENCES gtm.prospect_observations(id),
  gtm_playbook_instance_id UUID REFERENCES gtm.playbooks(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_path ON platform.crm_leads USING GIST (org_path);
CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON platform.crm_leads (stage);

CREATE TABLE IF NOT EXISTS gtm.campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  playbook_id UUID NOT NULL REFERENCES gtm.playbooks(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES gtm.prospect_observations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'PAUSED', 'REPLIED_CONVERTED', 'COMPLETED', 'BOUNCED', 'OPTED_OUT')),
  crm_lead_id UUID REFERENCES platform.crm_leads(id),
  last_step_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comms.mailbox_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  org_node_id UUID NOT NULL REFERENCES platform.org_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'HEALTHY' CHECK (status IN ('HEALTHY', 'WARMING', 'PAUSED', 'CIRCUIT_BROKEN')),
  daily_limit INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comms.suppression_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  scope_org_path ltree,
  normalized_recipient TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('EMAIL', 'PHONE', 'ALL')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppression_recip ON comms.suppression_ledger (normalized_recipient);

-- ----------------------------------------------------------------------------
-- 4. DOWNLINE PLAYBOOK CLONING & CONVERSION STORED FUNCTIONS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gtm.clone_playbook_for_downline(
  p_master_playbook_id UUID,
  p_target_org_node_id UUID,
  p_actor_user_id UUID,
  p_localized_tokens JSONB,
  p_requested_daily_inbox_cap INT
) RETURNS UUID AS $$
DECLARE
  v_master gtm.playbooks%ROWTYPE;
  v_target_node platform.org_nodes%ROWTYPE;
  v_effective_max_sends INT;
  v_new_playbook_id UUID;
BEGIN
  -- 1. Fetch Master Playbook & Target Org Node
  SELECT * INTO v_master FROM gtm.playbooks WHERE id = p_master_playbook_id;
  IF NOT FOUND OR v_master.status != 'PUBLISHED_DOWNLINE' THEN
    RAISE EXCEPTION 'Master Playbook % is not available for downline activation.', p_master_playbook_id;
  END IF;

  SELECT * INTO v_target_node FROM platform.org_nodes WHERE id = p_target_org_node_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target Organization Node % not found.', p_target_org_node_id;
  END IF;

  -- 2. Verify Hierarchy Lineage: Target node MUST be a strict descendant of Master owner
  IF NOT (v_target_node.org_path <@ v_master.owner_org_path) THEN
    RAISE EXCEPTION 'Hierarchy Violation: Node % is not a downward entity of %.',
      v_target_node.org_path, v_master.owner_org_path;
  END IF;

  -- 3. Verify Tier Eligibility
  IF NOT (v_target_node.tier = ANY(v_master.allowed_downline_tiers)) THEN
    RAISE EXCEPTION 'Tier Violation: Tier % is not permitted to activate this playbook.', v_target_node.tier;
  END IF;

  -- 4. Enforce Deny-Wins Ceiling on Daily Inbox Cap
  v_effective_max_sends := LEAST(
    v_master.max_daily_sends_per_inbox,
    COALESCE(p_requested_daily_inbox_cap, v_master.max_daily_sends_per_inbox),
    platform.resolve_effective_numeric_policy(
      v_master.tenant_id, v_target_node.org_path, 'gtm.max_daily_sends_per_inbox', 30
    )::INT
  );

  -- 5. Create Cloned Downline Playbook Instance
  INSERT INTO gtm.playbooks (
    tenant_id, owner_org_node_id, owner_org_path, parent_playbook_id,
    title, description, version, status,
    allowed_downline_tiers, template_lock_mode,
    max_daily_sends_per_inbox, bounce_circuit_breaker_pct,
    icp_rubric, trigger_signals, localized_tokens, created_by
  ) VALUES (
    v_master.tenant_id, v_target_node.id, v_target_node.org_path, v_master.id,
    v_master.title || ' [' || v_target_node.name || ']',
    v_master.description, v_master.version, 'ACTIVE',
    v_master.allowed_downline_tiers, v_master.template_lock_mode,
    v_effective_max_sends, v_master.bounce_circuit_breaker_pct,
    v_master.icp_rubric, v_master.trigger_signals,
    v_master.localized_tokens || COALESCE(p_localized_tokens, '{}'::jsonb),
    p_actor_user_id
  ) RETURNING id INTO v_new_playbook_id;

  -- 6. Clone DAG Sequence Nodes
  INSERT INTO gtm.playbook_dag_nodes (
    playbook_id, node_key, node_type, ui_position_x, ui_position_y,
    wait_duration_hours, condition_expression, structured_template_id,
    next_node_on_true, next_node_on_false, can_downline_skip_step
  )
  SELECT
    v_new_playbook_id, node_key, node_type, ui_position_x, ui_position_y,
    wait_duration_hours, condition_expression, structured_template_id,
    next_node_on_true, next_node_on_false, can_downline_skip_step
  FROM gtm.playbook_dag_nodes
  WHERE playbook_id = v_master.id;

  RETURN v_new_playbook_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION gtm.convert_prospect_to_crm_lead(
  p_prospect_id UUID,
  p_assigned_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_prospect gtm.prospect_observations%ROWTYPE;
  v_crm_lead_id UUID;
BEGIN
  SELECT * INTO v_prospect FROM gtm.prospect_observations WHERE id = p_prospect_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospect % not found.', p_prospect_id;
  END IF;

  IF v_prospect.converted_crm_lead_id IS NOT NULL THEN
    RETURN v_prospect.converted_crm_lead_id; -- Idempotent return
  END IF;

  INSERT INTO platform.crm_leads (
    tenant_id, org_node_id, org_path, country_code, assigned_user_id,
    full_name, email, company_name, job_title, canonical_geo_id,
    stage, source, first_touch_utm, gtm_prospect_id, gtm_playbook_instance_id
  ) VALUES (
    v_prospect.tenant_id, v_prospect.org_node_id, v_prospect.org_path, v_prospect.country_code, p_assigned_user_id,
    v_prospect.full_name, v_prospect.email, v_prospect.company_name, v_prospect.job_title, v_prospect.canonical_geo_id,
    'NEW', 'outbound_gtm',
    jsonb_build_object(
      'channel', 'outbound_gtm',
      'fit_score', v_prospect.fit_score,
      'fit_band', v_prospect.fit_band,
      'playbook_id', v_prospect.playbook_id
    ),
    v_prospect.id, v_prospect.playbook_id
  ) RETURNING id INTO v_crm_lead_id;

  UPDATE gtm.prospect_observations
  SET converted_crm_lead_id = v_crm_lead_id, converted_at = now()
  WHERE id = p_prospect_id;

  RETURN v_crm_lead_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 5. ANALYTICAL ROLL-UP VIEW FOR HIERARCHICAL COCKPIT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gtm.v_hierarchical_playbook_rollup AS
SELECT
  parent_node.tenant_id,
  parent_node.id AS viewing_org_node_id,
  parent_node.name AS viewing_org_name,
  parent_node.tier AS viewing_org_tier,
  parent_node.org_path AS viewing_org_path,
  COALESCE(pb.parent_playbook_id, pb.id) AS master_playbook_id,
  COUNT(DISTINCT pb.id) AS active_downline_instances,
  COUNT(DISTINCT enr.id) AS total_enrolled_prospects,
  COUNT(DISTINCT enr.id) FILTER (WHERE enr.status = 'REPLIED_CONVERTED') AS total_replied_converted,
  COUNT(DISTINCT l.id) AS total_crm_leads_generated,
  COUNT(DISTINCT l.id) FILTER (WHERE l.stage = 'WON') AS total_crm_deals_won,
  COALESCE(SUM(l.estimated_value_cents) FILTER (WHERE l.stage = 'WON'), 0) AS total_won_revenue_cents
FROM platform.org_nodes parent_node
JOIN gtm.playbooks pb
  ON pb.tenant_id = parent_node.tenant_id
  AND pb.owner_org_path <@ parent_node.org_path
LEFT JOIN gtm.campaign_enrollments enr
  ON enr.playbook_id = pb.id
LEFT JOIN platform.crm_leads l
  ON l.gtm_playbook_instance_id = pb.id
GROUP BY
  parent_node.tenant_id,
  parent_node.id,
  parent_node.name,
  parent_node.tier,
  parent_node.org_path,
  COALESCE(pb.parent_playbook_id, pb.id);

COMMIT;

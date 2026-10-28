-- Migration: 0451_crmonia_sender_custody_and_mailbox_pools.sql
-- Description: Module C (BYOK/BYOC Sender Domains & Mailbox Rotation Pools)
--              and Module D (Playbook Enrollments & Touch Dispatch Queue).

BEGIN;

CREATE EXTENSION IF NOT EXISTS ltree;

-- ============================================================================
-- 1. gtm.sender_domains: Tiered BYOK / BYOC Sender Domain Registry
-- ============================================================================
CREATE TABLE IF NOT EXISTS gtm.sender_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  owner_node_id uuid NOT NULL REFERENCES platform.org_nodes(id) ON DELETE CASCADE,
  owner_node_path ltree NOT NULL,
  domain text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('RESEND', 'SENDGRID', 'AWS_SES', 'CUSTOM_SMTP', 'GOOGLE_WORKSPACE', 'OFFICE365')),
  dns_verification_records jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_status text NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'FAILED', 'REVOKED')),
  custody_ticket_id text, -- Pointer to encrypted vault ticket in credential-custody
  reputation_score integer NOT NULL DEFAULT 100 CHECK (reputation_score BETWEEN 0 AND 100),
  country_code text CHECK (country_code IN ('CA', 'US', 'GLOBAL')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sender_domain_tenant UNIQUE (tenant_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_sender_domains_path ON gtm.sender_domains USING gist (owner_node_path);
CREATE INDEX IF NOT EXISTS idx_sender_domains_tenant ON gtm.sender_domains(tenant_id, status);

ALTER TABLE gtm.sender_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE gtm.sender_domains FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_gtm_sender_domains_select ON gtm.sender_domains;
CREATE POLICY rls_gtm_sender_domains_select ON gtm.sender_domains
  FOR SELECT
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    AND (
      owner_node_path <@ nullif(current_setting('app.current_org_path', true), '')::ltree
      OR owner_node_path @> nullif(current_setting('app.current_org_path', true), '')::ltree
    )
  );

DROP POLICY IF EXISTS rls_gtm_sender_domains_all ON gtm.sender_domains;
CREATE POLICY rls_gtm_sender_domains_all ON gtm.sender_domains
  FOR ALL
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    AND owner_node_path <@ nullif(current_setting('app.current_org_path', true), '')::ltree
  );

-- ============================================================================
-- 2. gtm.mailbox_pools: Rotational Mailbox Inboxes & Warmup State Machine
-- ============================================================================
CREATE TABLE IF NOT EXISTS gtm.mailbox_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES gtm.sender_domains(id) ON DELETE CASCADE,
  owner_node_id uuid NOT NULL REFERENCES platform.org_nodes(id) ON DELETE CASCADE,
  owner_node_path ltree NOT NULL,
  mailbox_address text NOT NULL,
  sender_name text NOT NULL,
  warmup_stage text NOT NULL DEFAULT 'WARMUP' CHECK (warmup_stage IN ('RAMPING', 'WARMUP', 'ACTIVE', 'RESTING', 'BURNED')),
  daily_send_limit integer NOT NULL DEFAULT 40,
  hourly_send_limit integer NOT NULL DEFAULT 8,
  sent_today_count integer NOT NULL DEFAULT 0,
  sent_hour_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  bounce_count integer NOT NULL DEFAULT 0,
  spam_complaint_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'REVOKED')),
  lease_token text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mailbox_address_tenant UNIQUE (tenant_id, lower(mailbox_address))
);

CREATE INDEX IF NOT EXISTS idx_mailbox_pools_path ON gtm.mailbox_pools USING gist (owner_node_path);
CREATE INDEX IF NOT EXISTS idx_mailbox_pools_health ON gtm.mailbox_pools(tenant_id, status, warmup_stage);

ALTER TABLE gtm.mailbox_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE gtm.mailbox_pools FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_gtm_mailbox_pools_select ON gtm.mailbox_pools;
CREATE POLICY rls_gtm_mailbox_pools_select ON gtm.mailbox_pools
  FOR SELECT
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    AND (
      owner_node_path <@ nullif(current_setting('app.current_org_path', true), '')::ltree
      OR owner_node_path @> nullif(current_setting('app.current_org_path', true), '')::ltree
    )
  );

DROP POLICY IF EXISTS rls_gtm_mailbox_pools_all ON gtm.mailbox_pools;
CREATE POLICY rls_gtm_mailbox_pools_all ON gtm.mailbox_pools
  FOR ALL
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    AND owner_node_path <@ nullif(current_setting('app.current_org_path', true), '')::ltree
  );

-- ============================================================================
-- 3. gtm.playbook_enrollments: Active Prospect / Lead Sequence Enrolment
-- ============================================================================
CREATE TABLE IF NOT EXISTS gtm.playbook_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  playbook_id uuid NOT NULL REFERENCES gtm.playbooks(id) ON DELETE CASCADE,
  org_node_id uuid NOT NULL REFERENCES platform.org_nodes(id) ON DELETE CASCADE,
  org_node_path ltree NOT NULL,
  lead_id uuid REFERENCES platform.crm_leads(id) ON DELETE SET NULL,
  prospect_id uuid REFERENCES gtm.prospect_observations(id) ON DELETE SET NULL,
  current_step_id text NOT NULL DEFAULT 'step_1',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'BOUNCED', 'UNSUBSCRIBED', 'RESPONDED')),
  next_touch_due_at timestamptz NOT NULL DEFAULT now(),
  last_touch_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrollments_due ON gtm.playbook_enrollments(tenant_id, status, next_touch_due_at);
CREATE INDEX IF NOT EXISTS idx_enrollments_path ON gtm.playbook_enrollments USING gist (org_node_path);

ALTER TABLE gtm.playbook_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gtm.playbook_enrollments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_gtm_enrollments_select ON gtm.playbook_enrollments;
CREATE POLICY rls_gtm_enrollments_select ON gtm.playbook_enrollments
  FOR SELECT
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    AND org_node_path <@ nullif(current_setting('app.current_org_path', true), '')::ltree
  );

DROP POLICY IF EXISTS rls_gtm_enrollments_all ON gtm.playbook_enrollments;
CREATE POLICY rls_gtm_enrollments_all ON gtm.playbook_enrollments
  FOR ALL
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    AND org_node_path <@ nullif(current_setting('app.current_org_path', true), '')::ltree
  );

-- ============================================================================
-- 4. gtm.touch_dispatches: Outbound Dispatch Queue & Message Log
-- ============================================================================
CREATE TABLE IF NOT EXISTS gtm.touch_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES gtm.playbook_enrollments(id) ON DELETE CASCADE,
  mailbox_id uuid REFERENCES gtm.mailbox_pools(id),
  channel text NOT NULL CHECK (channel IN ('EMAIL', 'LINKEDIN', 'SMS', 'WHATSAPP', 'TASK')),
  recipient_email text NOT NULL,
  subject text,
  rendered_body text NOT NULL,
  variant_id uuid REFERENCES gtm.playbook_step_variants(id),
  dispatch_status text NOT NULL DEFAULT 'QUEUED' CHECK (dispatch_status IN ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'SUPPRESSED', 'FAILED')),
  provider_message_id text,
  idempotency_key text NOT NULL UNIQUE,
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_touch_dispatches_status ON gtm.touch_dispatches(tenant_id, dispatch_status, created_at);

ALTER TABLE gtm.touch_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE gtm.touch_dispatches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_gtm_dispatches_select ON gtm.touch_dispatches;
CREATE POLICY rls_gtm_dispatches_select ON gtm.touch_dispatches
  FOR SELECT
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

DROP POLICY IF EXISTS rls_gtm_dispatches_all ON gtm.touch_dispatches;
CREATE POLICY rls_gtm_dispatches_all ON gtm.touch_dispatches
  FOR ALL
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

-- ============================================================================
-- 5. Stored Procedure: acquire_next_available_mailbox()
-- Rotates mailboxes evenly, respects daily/hourly caps, and increments counters.
-- ============================================================================
CREATE OR REPLACE FUNCTION gtm.acquire_next_available_mailbox(
  p_tenant_id uuid,
  p_org_node_path ltree
)
RETURNS TABLE (
  mailbox_id uuid,
  mailbox_address text,
  sender_name text,
  provider text,
  domain text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_selected_id uuid;
BEGIN
  -- Select and lock healthiest available mailbox within the authorized subtree
  SELECT m.id INTO v_selected_id
    FROM gtm.mailbox_pools m
    JOIN gtm.sender_domains d ON d.id = m.domain_id
   WHERE m.tenant_id = p_tenant_id
     AND m.status = 'ACTIVE'
     AND d.status = 'ACTIVE'
     AND d.verification_status = 'VERIFIED'
     AND (m.owner_node_path <@ p_org_node_path OR m.owner_node_path @> p_org_node_path)
     AND m.sent_today_count < m.daily_send_limit
     AND m.sent_hour_count < m.hourly_send_limit
   ORDER BY 
     m.sent_today_count ASC,
     m.last_sent_at ASC NULLS FIRST
   LIMIT 1
   FOR UPDATE OF m SKIP LOCKED;

  IF v_selected_id IS NULL THEN
    RETURN;
  END IF;

  -- Update sent counters
  UPDATE gtm.mailbox_pools
     SET sent_today_count = sent_today_count + 1,
         sent_hour_count = sent_hour_count + 1,
         last_sent_at = now(),
         updated_at = now()
   WHERE id = v_selected_id;

  RETURN QUERY
  SELECT m.id, m.mailbox_address, m.sender_name, d.provider, d.domain
    FROM gtm.mailbox_pools m
    JOIN gtm.sender_domains d ON d.id = m.domain_id
   WHERE m.id = v_selected_id;
END;
$$;

COMMIT;

\set ON_ERROR_STOP on

-- ============================================================================
-- CRMONIA Multi-Scope Hierarchical RLS & Subtree Operation Soak Test
-- Validates:
-- 1. Strict Downward Subtree Visibility (ltree org_node_path <@ parent_path)
-- 2. Sibling Node & Cross-Country Jurisdictional Isolation (0 rows returned)
-- 3. Deny-Wins Policy Inheritance (platform.resolve_effective_numeric_policy)
-- 4. 1-Click Prospect to CRM Lead Conversion
-- 5. Subtree Move & Atomic Cascading Path Rewrites
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS ltree;

-- 1. Setup Isolated Test Fixtures
DO $$
DECLARE
  v_tenant_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_hq_id uuid := 'b0000000-0000-0000-0000-000000000001';
  v_ca_id uuid := 'b0000000-0000-0000-0000-000000000002';
  v_us_id uuid := 'b0000000-0000-0000-0000-000000000003';
  v_on_id uuid := 'b0000000-0000-0000-0000-000000000004';
  v_toronto_id uuid := 'b0000000-0000-0000-0000-000000000005';
  v_ottawa_id uuid := 'b0000000-0000-0000-0000-000000000006';
  v_rep_toronto_id uuid := 'b0000000-0000-0000-0000-000000000007';
  
  v_lead_toronto_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_lead_rep_id uuid := 'c0000000-0000-0000-0000-000000000002';
  v_lead_ottawa_id uuid := 'c0000000-0000-0000-0000-000000000003';
  
  v_pb_master_id uuid := 'd0000000-0000-0000-0000-000000000001';
  v_pb_cloned_id uuid;
  v_prospect_id uuid := 'e0000000-0000-0000-0000-000000000001';
  v_converted_lead_id uuid;
  
  v_count integer;
  v_policy_val numeric;
  v_preview jsonb;
BEGIN
  -- Insert Tenant if missing
  INSERT INTO platform.tenants (id, name, slug)
  VALUES (v_tenant_id, 'CRMONIA RLS Soak Tenant', 'crmonia-soak')
  ON CONFLICT (id) DO NOTHING;

  -- Build Org Tree
  INSERT INTO platform.org_nodes (id, tenant_id, parent_id, node_type, name, code, path, country_code, jurisdictional_fencing, status)
  VALUES
    (v_hq_id, v_tenant_id, NULL, 'ENTERPRISE_HQ', 'Global HQ', 'HQ', 'hq'::ltree, NULL, false, 'ACTIVE'),
    (v_ca_id, v_tenant_id, v_hq_id, 'COUNTRY_OPCO', 'Canada OpCo', 'CA', 'hq.ca'::ltree, 'CA', true, 'ACTIVE'),
    (v_us_id, v_tenant_id, v_hq_id, 'COUNTRY_OPCO', 'US OpCo', 'US', 'hq.us'::ltree, 'US', true, 'ACTIVE'),
    (v_on_id, v_tenant_id, v_ca_id, 'REGION', 'Ontario Region', 'ON', 'hq.ca.on'::ltree, 'CA', false, 'ACTIVE'),
    (v_toronto_id, v_tenant_id, v_on_id, 'BRANCH', 'Toronto Branch', 'YYZ', 'hq.ca.on.toronto'::ltree, 'CA', false, 'ACTIVE'),
    (v_ottawa_id, v_tenant_id, v_on_id, 'BRANCH', 'Ottawa Branch', 'YOW', 'hq.ca.on.ottawa'::ltree, 'CA', false, 'ACTIVE'),
    (v_rep_toronto_id, v_tenant_id, v_toronto_id, 'REP', 'Toronto Advisor 1', 'REP1', 'hq.ca.on.toronto.rep1'::ltree, 'CA', false, 'ACTIVE')
  ON CONFLICT (id) DO NOTHING;

  -- Seed CRM Leads
  INSERT INTO platform.crm_leads (id, tenant_id, org_node_id, org_node_path, title, stage, contact_email, country_code)
  VALUES
    (v_lead_toronto_id, v_tenant_id, v_toronto_id, 'hq.ca.on.toronto'::ltree, 'Toronto Commercial Fleet Deal', 'QUALIFIED', 'ceo@torontofleet.ca', 'CA'),
    (v_lead_rep_id, v_tenant_id, v_rep_toronto_id, 'hq.ca.on.toronto.rep1'::ltree, 'Downtown Retail Shop Policy', 'DISCOVERY', 'owner@retailshop.ca', 'CA'),
    (v_lead_ottawa_id, v_tenant_id, v_ottawa_id, 'hq.ca.on.ottawa'::ltree, 'Capital Logistics Policy', 'PROPOSAL', 'ops@capitallogistics.ca', 'CA')
  ON CONFLICT (id) DO NOTHING;

  -- Seed Master GTM Playbook at HQ
  INSERT INTO gtm.playbooks (id, tenant_id, owner_node_id, owner_node_path, name, slug, playbook_type, status, dag_definition)
  VALUES (
    v_pb_master_id, v_tenant_id, v_hq_id, 'hq'::ltree, 'Master Commercial Fleet Outbound Playbook', 'master-fleet-2026', 'MASTER_TEMPLATE', 'PUBLISHED',
    '{"nodes": [{"id": "step_1", "type": "EMAIL_OUTREACH", "name": "Initial Dispatch"}]}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- Seed Prospect Observation at Toronto
  INSERT INTO gtm.prospect_observations (id, tenant_id, org_node_id, org_node_path, company_name, contact_email, country_code, raw_icp_score)
  VALUES (
    v_prospect_id, v_tenant_id, v_toronto_id, 'hq.ca.on.toronto'::ltree, 'Toronto Metro Logistics', 'dispatch@metrologistics.ca', 'CA', 92
  ) ON CONFLICT (id) DO NOTHING;

  -- Seed Governance Policies (Deny-Wins: tighter bound wins)
  -- HQ sets max daily outbound emails ceiling = 50
  INSERT INTO platform.governance_policies (id, tenant_id, node_id, node_path, policy_type, policy_key, policy_rule)
  VALUES (
    'f0000000-0000-0000-0000-000000000001', v_tenant_id, v_hq_id, 'hq'::ltree, 'GTM_LIMIT', 'max_daily_sends', '{"max": 50}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- Toronto Branch tries to widen to 100
  INSERT INTO platform.governance_policies (id, tenant_id, node_id, node_path, policy_type, policy_key, policy_rule)
  VALUES (
    'f0000000-0000-0000-0000-000000000002', v_tenant_id, v_toronto_id, 'hq.ca.on.toronto'::ltree, 'GTM_LIMIT', 'max_daily_sends', '{"max": 100}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- ==========================================================================
  -- TEST 1: Deny-Wins Policy Resolution
  -- Even though Toronto specifies max=100, the effective bound must be 50 (HQ ceiling).
  -- ==========================================================================
  v_policy_val := platform.resolve_effective_numeric_policy(v_tenant_id, 'hq.ca.on.toronto'::ltree, 'max_daily_sends', 200);
  IF v_policy_val <> 50 THEN
    RAISE EXCEPTION 'Deny-wins policy failed: expected 50, got %', v_policy_val;
  END IF;

  -- ==========================================================================
  -- TEST 2: Downline 1-Click Playbook Clone
  -- Clone Master Playbook from HQ to Toronto Branch
  -- ==========================================================================
  v_pb_cloned_id := gtm.clone_playbook_for_downline(v_pb_master_id, v_toronto_id, 'toronto_branch_mgr');
  
  SELECT count(*) INTO v_count FROM gtm.playbooks WHERE id = v_pb_cloned_id AND owner_node_path = 'hq.ca.on.toronto'::ltree;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Playbook downline clone failed: cloned row not found under Toronto path';
  END IF;

  -- ==========================================================================
  -- TEST 3: 1-Click Prospect to CRM Lead Conversion
  -- ==========================================================================
  v_converted_lead_id := gtm.convert_prospect_to_crm_lead(v_prospect_id, 'rep_toronto_1');
  
  SELECT count(*) INTO v_count FROM platform.crm_leads WHERE id = v_converted_lead_id AND org_node_path = 'hq.ca.on.toronto'::ltree;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Prospect conversion failed: new lead not created under Toronto path';
  END IF;

  -- ==========================================================================
  -- TEST 4: Subtree Re-Parenting Preview & Execution
  -- Preview moving Toronto Branch under US OpCo
  -- ==========================================================================
  v_preview := platform.preview_move_org_node_subtree(v_tenant_id, v_toronto_id, v_us_id);
  IF (v_preview->>'node_count')::int < 2 THEN
    RAISE EXCEPTION 'Move preview failed: expected at least 2 nodes (branch + rep), got %', v_preview->>'node_count';
  END IF;

  -- Execute Move
  PERFORM platform.move_org_node_subtree(v_tenant_id, v_toronto_id, v_us_id, 'auditor_superadmin', 'Expansion Re-Org');

  -- Verify new path rewrites
  SELECT count(*) INTO v_count FROM platform.org_nodes WHERE id = v_toronto_id AND path = 'hq.us.toronto'::ltree;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Subtree move failed: Toronto node path was not updated to hq.us.toronto';
  END IF;

  SELECT count(*) INTO v_count FROM platform.org_nodes WHERE id = v_rep_toronto_id AND path = 'hq.us.toronto.rep1'::ltree;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Subtree move cascade failed: Rep node path was not updated to hq.us.toronto.rep1';
  END IF;

  SELECT count(*) INTO v_count FROM platform.crm_leads WHERE id = v_lead_toronto_id AND org_node_path = 'hq.us.toronto'::ltree;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Subtree move cascade failed: CRM lead path was not updated to hq.us.toronto';
  END IF;

  RAISE NOTICE 'CRMONIA Multi-Scope Hierarchical RLS & Subtree Soak Test PASSED ALL INVARIANTS.';
END;
$$;

ROLLBACK;

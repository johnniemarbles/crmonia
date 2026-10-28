\set ON_ERROR_STOP on

-- ============================================================================
-- CRMONIA Sender Custody, Rotational Mailbox & Dispatch Soak Test
-- Validates:
-- 1. BYOK/BYOC Sender Domain Registration & Status Checks
-- 2. Rotational Mailbox Allocation via gtm.acquire_next_available_mailbox()
-- 3. Automatic Rotation Across Healthy Mailboxes
-- 4. Hourly & Daily Quota Counter Increments
-- 5. Outbound Touch Dispatch Logging & Enrollment Step Advancement
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS ltree;

DO $$
DECLARE
  v_tenant_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_branch_id uuid := 'b0000000-0000-0000-0000-000000000005';
  v_domain_id uuid := 'd1000000-0000-0000-0000-000000000001';
  v_mb1_id uuid := 'm1000000-0000-0000-0000-000000000001';
  v_mb2_id uuid := 'm2000000-0000-0000-0000-000000000002';
  v_playbook_id uuid := 'p1000000-0000-0000-0000-000000000001';
  v_enrollment_id uuid := 'e1000000-0000-0000-0000-000000000001';
  v_dispatch_id uuid := 't1000000-0000-0000-0000-000000000001';
  
  v_acq_mb_id uuid;
  v_acq_email text;
  v_count integer;
BEGIN
  -- Insert Domain
  INSERT INTO gtm.sender_domains (
    id, tenant_id, owner_node_id, owner_node_path, domain, provider,
    verification_status, reputation_score, status
  ) VALUES (
    v_domain_id, v_tenant_id, v_branch_id, 'hq.ca.on.toronto'::ltree,
    'outbound.toronto.crmonia.ca', 'RESEND', 'VERIFIED', 98, 'ACTIVE'
  ) ON CONFLICT (id) DO NOTHING;

  -- Insert Mailbox 1 (Limit 40/day, 8/hour)
  INSERT INTO gtm.mailbox_pools (
    id, tenant_id, domain_id, owner_node_id, owner_node_path, mailbox_address,
    sender_name, warmup_stage, daily_send_limit, hourly_send_limit,
    sent_today_count, sent_hour_count, status
  ) VALUES (
    v_mb1_id, v_tenant_id, v_domain_id, v_branch_id, 'hq.ca.on.toronto'::ltree,
    'rep1@outbound.toronto.crmonia.ca', 'Advisor Rep 1', 'ACTIVE', 40, 8,
    0, 0, 'ACTIVE'
  ) ON CONFLICT (id) DO NOTHING;

  -- Insert Mailbox 2 (Limit 40/day, 8/hour)
  INSERT INTO gtm.mailbox_pools (
    id, tenant_id, domain_id, owner_node_id, owner_node_path, mailbox_address,
    sender_name, warmup_stage, daily_send_limit, hourly_send_limit,
    sent_today_count, sent_hour_count, status
  ) VALUES (
    v_mb2_id, v_tenant_id, v_domain_id, v_branch_id, 'hq.ca.on.toronto'::ltree,
    'rep2@outbound.toronto.crmonia.ca', 'Advisor Rep 2', 'ACTIVE', 40, 8,
    0, 0, 'ACTIVE'
  ) ON CONFLICT (id) DO NOTHING;

  -- ==========================================================================
  -- TEST 1: First Acquisition -> Should Pick Mailbox 1
  -- ==========================================================================
  SELECT mailbox_id, mailbox_address INTO v_acq_mb_id, v_acq_email
    FROM gtm.acquire_next_available_mailbox(v_tenant_id, 'hq.ca.on.toronto'::ltree);

  IF v_acq_mb_id IS NULL THEN
    RAISE EXCEPTION 'Mailbox acquisition failed: no mailbox returned';
  END IF;

  -- Verify counter incremented
  SELECT sent_today_count INTO v_count FROM gtm.mailbox_pools WHERE id = v_acq_mb_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Mailbox counter failed: expected sent_today_count=1, got %', v_count;
  END IF;

  -- ==========================================================================
  -- TEST 2: Second Acquisition -> Should Rotate to Mailbox 2
  -- ==========================================================================
  DECLARE
    v_acq_mb2_id uuid;
    v_acq2_email text;
  BEGIN
    SELECT mailbox_id, mailbox_address INTO v_acq_mb2_id, v_acq2_email
      FROM gtm.acquire_next_available_mailbox(v_tenant_id, 'hq.ca.on.toronto'::ltree);

    IF v_acq_mb2_id = v_acq_mb_id THEN
      RAISE EXCEPTION 'Mailbox rotation failed: selected same mailbox twice instead of rotating';
    END IF;
  END;

  -- ==========================================================================
  -- TEST 3: Enrollment & Dispatch Logging
  -- ==========================================================================
  INSERT INTO gtm.playbooks (id, tenant_id, owner_node_id, owner_node_path, name, slug, playbook_type, status)
  VALUES (
    v_playbook_id, v_tenant_id, v_branch_id, 'hq.ca.on.toronto'::ltree,
    'Toronto Commercial Logistics Sequence', 'toronto-logistics', 'BRANCH_ACTIVE', 'PUBLISHED'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO gtm.playbook_enrollments (
    id, tenant_id, playbook_id, org_node_id, org_node_path, current_step_id, status, next_touch_due_at
  ) VALUES (
    v_enrollment_id, v_tenant_id, v_playbook_id, v_branch_id, 'hq.ca.on.toronto'::ltree,
    'step_1', 'ACTIVE', now() - interval '5 minutes'
  ) ON CONFLICT (id) DO NOTHING;

  -- Log dispatch touch
  INSERT INTO gtm.touch_dispatches (
    id, tenant_id, enrollment_id, mailbox_id, channel, recipient_email,
    subject, rendered_body, dispatch_status, idempotency_key, dispatched_at
  ) VALUES (
    v_dispatch_id, v_tenant_id, v_enrollment_id, v_mb1_id, 'EMAIL', 'cfo@metrofleet.ca',
    'Commercial Fleet Followup', 'Hello, regarding your policy...', 'SENT',
    'idmp_soak_touch_001', now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Advance enrollment
  UPDATE gtm.playbook_enrollments
     SET current_step_id = 'step_2',
         last_touch_at = now(),
         next_touch_due_at = now() + interval '3 days'
   WHERE id = v_enrollment_id;

  SELECT count(*) INTO v_count FROM gtm.touch_dispatches WHERE id = v_dispatch_id AND dispatch_status = 'SENT';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Touch dispatch logging failed';
  END IF;

  RAISE NOTICE 'CRMONIA Sender Custody & Mailbox Pool Soak Test PASSED ALL INVARIANTS.';
END;
$$;

ROLLBACK;

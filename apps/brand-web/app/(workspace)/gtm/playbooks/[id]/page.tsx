import React from 'react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { withRlsTransaction } from '@crmonia/db/rls-session';
import { getServerHierarchySession } from '@/lib/auth/server-session';
import { PlaybookBuilderClient } from './PlaybookBuilderClient';
import { MasterPlaybookInitialData } from './types';

export default async function PlaybookBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: playbookId } = await params;
  const cookieStore = await cookies();
  const session = await getServerHierarchySession(cookieStore);

  const initialData = await withRlsTransaction<MasterPlaybookInitialData | null>(
    session,
    async (client) => {
      // 1. Fetch Playbook + Owner Org Node + Effective Deny-Wins Policy Ceiling
      const { rows: pbRows } = await client.query(
        `SELECT
           pb.id,
           pb.title,
           pb.description,
           pb.version,
           pb.status,
           pb.owner_org_node_id AS "ownerOrgNodeId",
           o.name AS "ownerOrgName",
           pb.owner_org_path::TEXT AS "ownerOrgPath",
           o.tier AS "ownerTier",
           o.country_code AS "countryCode",
           pb.allowed_downline_tiers AS "allowedDownlineTiers",
           pb.template_lock_mode AS "templateLockMode",
           pb.max_daily_sends_per_inbox AS "maxDailySendsPerInbox",
           platform.resolve_effective_numeric_policy(
             pb.tenant_id,
             pb.owner_org_path,
             'gtm.max_daily_sends_per_inbox',
             30
           )::INT AS "parentHardCeilingDailySends",
           pb.bounce_circuit_breaker_pct::FLOAT AS "bounceCircuitBreakerPct",
           pb.icp_rubric AS "icpRubric",
           pb.trigger_signals AS "triggerSignals"
         FROM gtm.playbooks pb
         JOIN platform.org_nodes o ON o.id = pb.owner_org_node_id
         WHERE pb.id = $1`,
        [playbookId]
      );

      if (pbRows.length === 0) {
        // Fallback demo/initial fixture if DB is pristine
        return {
          id: playbookId,
          title: 'Commercial Fleet & Key-Person Protection v2.4',
          description: 'High-intent outbound playbook targeting commercial trucking, freight logistics, and cold storage carriers.',
          version: 1,
          status: 'DRAFT',
          ownerOrgNodeId: session.orgNodeId,
          ownerOrgName: 'Canada OpCo (Tier 2)',
          ownerOrgPath: session.orgPath,
          ownerTier: 'COUNTRY',
          countryCode: 'CA',
          allowedDownlineTiers: ['REGION', 'BRANCH', 'UNIT'],
          templateLockMode: 'TOKEN_LOCALIZATION_ONLY',
          maxDailySendsPerInbox: 30,
          parentHardCeilingDailySends: 30,
          bounceCircuitBreakerPct: 3.0,
          icpRubric: {
            targetIndustries: ['Logistics & Trucking (NAICS 484)', 'Cold Chain Warehousing', 'Construction Fleets'],
            targetJobTitles: ['Owner', 'President', 'CFO', 'VP Operations', 'Fleet Director'],
            minHeadcount: 25,
            maxHeadcount: 500,
            requireValidatedEmail: true,
            requireCommercialDomain: true,
            minFitScoreFloor: 60,
            waterfallProviders: [
              { providerName: 'CLEARBIT', credentialRef: 'vault://ca-opco/clearbit', priorityOrder: 1 },
              { providerName: 'DROPCONTACT', credentialRef: 'kms://platform/dropcnt', priorityOrder: 2 },
              { providerName: 'PROSPEO', credentialRef: 'secret://platform/prospeo', priorityOrder: 3 },
            ],
          },
          triggerSignals: [
            'Commercial Auto / Fleet Policy Renewal < 90 Days',
            'FMCSA / CVOR New Carrier Authority Registered in Geo',
            'Company expanded fleet size > 15% in last 6 months',
          ],
          tokenDefinitions: [
            {
              tokenKey: 'branch_city',
              displayLabel: 'Branch City Name',
              resolutionSource: 'ORG_NODE_METADATA',
              isRequired: true,
              defaultFallbackValue: 'your region',
            },
            {
              tokenKey: 'local_phone_did',
              displayLabel: 'Local Twilio DID Phone',
              resolutionSource: 'ORG_NODE_METADATA',
              isRequired: true,
              defaultFallbackValue: '+1-800-555-0199',
            },
            {
              tokenKey: 'advisor_calendar_link',
              displayLabel: 'Advisor Booking URL',
              resolutionSource: 'ASSIGNED_REP_PROFILE',
              isRequired: true,
              defaultFallbackValue: 'https://cal.punjabinsurance.ca/round-robin',
            },
            {
              tokenKey: 'local_case_study',
              displayLabel: 'Localized Customer Case Study',
              resolutionSource: 'DOWNLINE_MANUAL_INPUT',
              isRequired: false,
              defaultFallbackValue: 'a 32-truck refrigerated carrier off Hwy 410',
            },
          ],
          dagNodes: [
            {
              nodeKey: 'step_1_email',
              nodeType: 'EMAIL_OUTBOUND',
              uiPositionX: 100,
              uiPositionY: 50,
              waitDurationHours: 72,
              canDownlineSkipStep: false,
              structuredTemplate: {
                id: '00000000-0000-4000-8000-000000000201',
                channel: 'EMAIL',
                name: 'Initial Fleet Review Hook (ESP-Matched)',
                subjectSpintax: '{Quick question|Note} for {{company_name}} in {{branch_city}}',
                isAiDrafted: false,
                complianceStatus: 'APPROVED',
                contentBlocks: [
                  {
                    blockId: 'b1',
                    type: 'ICEBREAKER',
                    lock: 'FREE_LOCAL_EDIT',
                    content: 'Congrats on {{company_name}} expanding operations near {{branch_city}} recently.',
                  },
                  {
                    blockId: 'b2',
                    type: 'BODY_VALUE_PROP',
                    lock: 'TOKEN_SLOTS_ONLY',
                    content: 'Most {{industry}} fleets in {{branch_city}} overpay by 18% on commercial liability and key-person coverage—we recently helped {{local_case_study}} restructure their rate caps.',
                  },
                  {
                    blockId: 'b3',
                    type: 'CTA_CALENDAR',
                    lock: 'EDITABLE_WITH_APPROVAL',
                    content: 'Grab 15 mins on my local calendar: {{advisor_calendar_link}} or call our {{branch_city}} desk at {{local_phone_did}}.',
                  },
                  {
                    blockId: 'b4',
                    type: 'COMPLIANCE_FOOTER',
                    lock: 'IMMUTABLE_LOCKED',
                    content: 'Punjab Insurance Agency Inc. • Licensed by FSRA / Regulatory Authority. To unsubscribe: {{unsub_link}}',
                  },
                ],
              },
            },
            {
              nodeKey: 'step_2_voice',
              nodeType: 'AI_VOICE_CALL',
              uiPositionX: 100,
              uiPositionY: 180,
              waitDurationHours: 48,
              canDownlineSkipStep: false,
              structuredTemplate: {
                id: '00000000-0000-4000-8000-000000000202',
                channel: 'AI_VOICE',
                name: 'Conversational Voice Discovery & Booking',
                isAiDrafted: false,
                complianceStatus: 'APPROVED',
                contentBlocks: [
                  {
                    blockId: 'vb1',
                    type: 'BODY_VALUE_PROP',
                    lock: 'TOKEN_SLOTS_ONLY',
                    content: 'Hi, this is Alex calling on behalf of Punjab Insurance in {{branch_city}}. We are reaching out regarding commercial fleet rate renewals.',
                  },
                ],
              },
            },
            {
              nodeKey: 'step_3_rep_task',
              nodeType: 'CRM_MANUAL_CALL_TASK',
              uiPositionX: 100,
              uiPositionY: 310,
              waitDurationHours: 0,
              canDownlineSkipStep: false,
            },
          ],
          challengerVariants: [
            {
              variantId: '00000000-0000-4000-8000-000000000301',
              dagNodeId: '00000000-0000-4000-8000-000000000201',
              nodeKey: 'step_1_email',
              sourceOrgName: 'Mississauga Branch',
              sourceOrgPath: 'root.hq_1.ca_opco.on_reg.mississauga_br',
              variantLetter: 'C',
              sendsCount: 1420,
              openRatePct: 64.8,
              replyRatePct: 11.9,
              masterBaselineReplyPct: 8.4,
              subjectOverride: "{{company_name}}'s CVOR & fleet renewal in {{branch_city}}",
              contentBlocksOverride: [],
            },
          ],
        };
      }

      const pb = pbRows[0];

      // 2. Fetch Token Definitions
      const { rows: tokenRows } = await client.query(
        `SELECT
           token_key AS "tokenKey",
           display_label AS "displayLabel",
           resolution_source AS "resolutionSource",
           is_required AS "isRequired",
           default_fallback_value AS "defaultFallbackValue",
           validation_regex AS "validationRegex"
         FROM gtm.playbook_token_definitions
         WHERE playbook_id = $1
         ORDER BY token_key ASC`,
        [playbookId]
      );

      // 3. Fetch DAG Nodes + Templates
      const { rows: dagRows } = await client.query(
        `SELECT
           dn.node_key AS "nodeKey",
           dn.node_type AS "nodeType",
           dn.ui_position_x AS "uiPositionX",
           dn.ui_position_y AS "uiPositionY",
           dn.wait_duration_hours AS "waitDurationHours",
           dn.condition_expression AS "conditionExpression",
           dn.next_node_on_true AS "nextNodeOnTrue",
           dn.next_node_on_false AS "nextNodeOnFalse",
           dn.can_downline_skip_step AS "canDownlineSkipStep",
           st.id AS "tplId",
           st.channel AS "tplChannel",
           st.name AS "tplName",
           st.subject_spintax AS "tplSubjectSpintax",
           st.content_blocks AS "tplContentBlocks",
           st.is_ai_drafted AS "tplIsAiDrafted",
           st.compliance_status AS "tplComplianceStatus",
           st.approved_by_user_id AS "tplApprovedByUserId"
         FROM gtm.playbook_dag_nodes dn
         LEFT JOIN comms.structured_templates st ON st.id = dn.structured_template_id
         WHERE dn.playbook_id = $1
         ORDER BY dn.ui_position_y ASC, dn.node_key ASC`,
        [playbookId]
      );

      // 4. Fetch Variants
      const { rows: variantRows } = await client.query(
        `SELECT
           v.id AS "variantId",
           v.dag_node_id AS "dagNodeId",
           dn.node_key AS "nodeKey",
           o.name AS "sourceOrgName",
           v.org_path::TEXT AS "sourceOrgPath",
           v.variant_letter AS "variantLetter",
           v.sends_count AS "sendsCount",
           ROUND((v.opens_count::NUMERIC / NULLIF(v.sends_count, 0)) * 100, 1)::FLOAT AS "openRatePct",
           ROUND((v.replies_count::NUMERIC / NULLIF(v.sends_count, 0)) * 100, 1)::FLOAT AS "replyRatePct",
           8.4::FLOAT AS "masterBaselineReplyPct",
           COALESCE(v.subject_override, '') AS "subjectOverride",
           COALESCE(v.content_blocks_override, '[]'::jsonb) AS "contentBlocksOverride"
         FROM gtm.playbook_step_variants v
         JOIN gtm.playbook_dag_nodes dn ON dn.id = v.dag_node_id
         JOIN platform.org_nodes o ON o.id = v.org_node_id
         WHERE v.sends_count >= 100
           AND v.promoted_to_master_at IS NULL
         ORDER BY (v.replies_count::NUMERIC / NULLIF(v.sends_count, 0)) DESC
         LIMIT 5`
      );

      return {
        ...pb,
        tokenDefinitions: tokenRows,
        dagNodes: dagRows.map((r) => ({
          nodeKey: r.nodeKey,
          nodeType: r.nodeType,
          uiPositionX: r.uiPositionX,
          uiPositionY: r.uiPositionY,
          waitDurationHours: r.waitDurationHours,
          conditionExpression: r.conditionExpression ?? undefined,
          nextNodeOnTrue: r.nextNodeOnTrue,
          nextNodeOnFalse: r.nextNodeOnFalse,
          canDownlineSkipStep: r.canDownlineSkipStep,
          structuredTemplate: r.tplId
            ? {
                id: r.tplId,
                channel: r.tplChannel,
                name: r.tplName,
                subjectSpintax: r.tplSubjectSpintax ?? undefined,
                contentBlocks: r.tplContentBlocks ?? [],
                isAiDrafted: r.tplIsAiDrafted,
                complianceStatus: r.tplComplianceStatus,
                approvedByUserId: r.tplApprovedByUserId ?? undefined,
              }
            : undefined,
        })),
        challengerVariants: variantRows,
      };
    }
  );

  if (!initialData) {
    notFound();
  }

  return (
    <PlaybookBuilderClient
      initialData={initialData}
      currentUserId={session.userId}
      currentUserRole={session.role}
    />
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { UpsertMasterPlaybookRequestSchema } from '@crmonia/gtm/contracts/playbook';
import { withRlsTransaction } from '@crmonia/db/rls-session';
import { getAuthenticatedHierarchyContext } from '@/lib/auth/session-context';
import { sanitizeAstBlocks } from '@/lib/security/sanitize-ast';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: playbookId } = await context.params;
    const session = await getAuthenticatedHierarchyContext(req);

    // 1. Validate Role Authority (Only HQ, Country Admin, or Compliance Officer can author Master Playbooks)
    if (!['MAIN_ADMIN', 'COUNTRY_ADMIN', 'COMPLIANCE_OFFICER'].includes(session.role)) {
      return NextResponse.json(
        { error: 'FORBIDDEN_TIER_ROLE', message: 'Your role cannot author Master GTM Playbooks.' },
        { status: 403 }
      );
    }

    // 2. Parse & Validate Payload against Zod Contract
    const rawBody = await req.json();
    const parsed = UpsertMasterPlaybookRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
        { status: 422 }
      );
    }
    const payload = parsed.data;

    // 3. Execute inside RLS-enforced Transaction
    const updatedPlaybook = await withRlsTransaction(session, async (client) => {
      // 3a. Enforce Deny-Wins Ceiling from platform.governance_policies
      const { rows: policyRows } = await client.query<{ effective_max_sends: number }>(
        `SELECT platform.resolve_effective_numeric_policy($1, $2::ltree, 'gtm.max_daily_sends_per_inbox', 30)::INT AS effective_max_sends`,
        [session.tenantId, session.orgPath]
      );
      const effectiveDailyCap = Math.min(
        payload.maxDailySendsPerInbox,
        policyRows[0]?.effective_max_sends ?? 30
      );

      // 3b. Upsert Master Playbook Header
      const { rows: pbRows } = await client.query(
        `UPDATE gtm.playbooks
         SET title = $1,
             description = $2,
             status = $3,
             allowed_downline_tiers = $4::platform.org_tier_enum[],
             template_lock_mode = $5::gtm.template_lock_mode_enum,
             max_daily_sends_per_inbox = $6,
             bounce_circuit_breaker_pct = $7,
             icp_rubric = $8::jsonb,
             trigger_signals = $9::jsonb,
             version = version + 1,
             updated_at = now()
         WHERE id = $10 AND owner_org_node_id = $11
         RETURNING id, version, status, max_daily_sends_per_inbox`,
        [
          payload.title,
          payload.description ?? null,
          payload.status,
          payload.allowedDownlineTiers,
          payload.templateLockMode,
          effectiveDailyCap,
          payload.bounceCircuitBreakerPct,
          JSON.stringify(payload.icpRubric),
          JSON.stringify(payload.triggerSignals),
          playbookId,
          session.orgNodeId,
        ]
      );

      if (pbRows.length === 0) {
        throw new Error('PLAYBOOK_NOT_FOUND_OR_UNAUTHORIZED');
      }

      // 3c. Replace Token Definitions Contract
      await client.query(`DELETE FROM gtm.playbook_token_definitions WHERE playbook_id = $1`, [
        playbookId,
      ]);
      for (const token of payload.tokenDefinitions) {
        await client.query(
          `INSERT INTO gtm.playbook_token_definitions (
             playbook_id, token_key, display_label, resolution_source,
             is_required, default_fallback_value, validation_regex
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            playbookId,
            token.tokenKey,
            token.displayLabel,
            token.resolutionSource,
            token.isRequired,
            token.defaultFallbackValue ?? null,
            token.validationRegex ?? null,
          ]
        );
      }

      // 3d. Upsert Structured Templates (Prohibition C3: Sanitize on save) & DAG Nodes
      await client.query(`DELETE FROM gtm.playbook_dag_nodes WHERE playbook_id = $1`, [playbookId]);

      for (const node of payload.dagNodes) {
        let templateId: string | null = null;

        if (node.structuredTemplate) {
          const tpl = node.structuredTemplate;
          const sanitizedBlocks = sanitizeAstBlocks(tpl.contentBlocks);

          const { rows: tplRows } = await client.query<{ id: string }>(
            `INSERT INTO comms.structured_templates (
               tenant_id, owner_org_node_id, owner_org_path, channel, name,
               subject_spintax, content_blocks, is_ai_drafted, compliance_status,
               approved_by_user_id, approved_at
             ) VALUES ($1, $2, $3::ltree, $4, $5, $6, $7::jsonb, $8, $9, $10, CASE WHEN $9 = 'APPROVED' THEN now() ELSE NULL END)
             RETURNING id`,
            [
              session.tenantId,
              session.orgNodeId,
              session.orgPath,
              tpl.channel,
              tpl.name,
              tpl.subjectSpintax ?? null,
              JSON.stringify(sanitizedBlocks),
              tpl.isAiDrafted,
              tpl.complianceStatus,
              tpl.approvedByUserId ?? null,
            ]
          );
          templateId = tplRows[0].id;
        }

        await client.query(
          `INSERT INTO gtm.playbook_dag_nodes (
             playbook_id, node_key, node_type, ui_position_x, ui_position_y,
             wait_duration_hours, condition_expression, structured_template_id,
             next_node_on_true, next_node_on_false, can_downline_skip_step
           ) VALUES ($1, $2, $3::gtm.step_node_type, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
          [
            playbookId,
            node.nodeKey,
            node.nodeType,
            node.uiPositionX,
            node.uiPositionY,
            node.waitDurationHours,
            node.conditionExpression ? JSON.stringify(node.conditionExpression) : null,
            templateId,
            node.nextNodeOnTrue ?? null,
            node.nextNodeOnFalse ?? null,
            node.canDownlineSkipStep,
          ]
        );
      }

      return pbRows[0];
    });

    return NextResponse.json({
      status: 'UPDATED',
      playbook: updatedPlaybook,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: 'PLAYBOOK_SAVE_FAILED', message }, { status: 400 });
  }
}

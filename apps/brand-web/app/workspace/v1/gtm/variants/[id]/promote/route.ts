import { NextRequest, NextResponse } from 'next/server';
import { PromoteVariantRequestSchema } from '@crmonia/gtm/contracts/playbook';
import { withRlsTransaction } from '@crmonia/db/rls-session';
import { getAuthenticatedHierarchyContext } from '@/lib/auth/session-context';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: variantId } = await context.params;
    const session = await getAuthenticatedHierarchyContext(req);

    if (!['MAIN_ADMIN', 'COUNTRY_ADMIN'].includes(session.role)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Only HQ or Country Admins can promote variants to Master.' },
        { status: 403 }
      );
    }

    const rawBody = await req.json();
    const parsed = PromoteVariantRequestSchema.safeParse({
      ...rawBody,
      challengerVariantId: variantId,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_PROMOTION_REQUEST', details: parsed.error.flatten() },
        { status: 422 }
      );
    }
    const { masterPlaybookId, dagNodeId, challengerVariantId, promotionReason } = parsed.data;

    const promotionResult = await withRlsTransaction(session, async (client) => {
      // 1. Fetch winning downward variant
      const { rows: variantRows } = await client.query<{
        subject_override: string | null;
        content_blocks_override: unknown;
        org_path: string;
        sends_count: number;
        replies_count: number;
      }>(
        `SELECT subject_override, content_blocks_override, org_path::TEXT, sends_count, replies_count
         FROM gtm.playbook_step_variants
         WHERE id = $1 AND tenant_id = $2`,
        [challengerVariantId, session.tenantId]
      );

      if (variantRows.length === 0) {
        throw new Error('Challenger variant not found in your downward subtree.');
      }
      const winner = variantRows[0];

      // 2. Update the Master Playbook's Structured Template with the winning Branch copy
      const { rows: updatedTpl } = await client.query<{ id: string }>(
        `UPDATE comms.structured_templates st
         SET subject_spintax = COALESCE($1, st.subject_spintax),
             content_blocks = COALESCE($2::jsonb, st.content_blocks),
             updated_at = now()
         FROM gtm.playbook_dag_nodes dn
         WHERE dn.id = $3
           AND dn.playbook_id = $4
           AND st.id = dn.structured_template_id
         RETURNING st.id`,
        [
          winner.subject_override,
          winner.content_blocks_override ? JSON.stringify(winner.content_blocks_override) : null,
          dagNodeId,
          masterPlaybookId,
        ]
      );

      if (updatedTpl.length === 0) {
        throw new Error('Target DAG Node or Master Structured Template not found.');
      }

      // 3. Increment Master Playbook Version & Stamp Promotion Audit Trail
      const { rows: masterRows } = await client.query<{ version: number }>(
        `UPDATE gtm.playbooks
         SET version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING version`,
        [masterPlaybookId]
      );

      await client.query(
        `UPDATE gtm.playbook_step_variants
         SET promoted_to_master_at = now(), promoted_by_user_id = $1
         WHERE id = $2`,
        [session.userId, challengerVariantId]
      );

      return {
        masterPlaybookId,
        newMasterVersion: masterRows[0].version,
        sourceBranchPath: winner.org_path,
        promotionReason,
      };
    });

    return NextResponse.json({
      status: 'VARIANT_PROMOTED_TO_MASTER',
      ...promotionResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Promotion Failed';
    return NextResponse.json({ error: 'PROMOTION_FAILED', message }, { status: 400 });
  }
}

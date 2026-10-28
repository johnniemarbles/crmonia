import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRlsTransaction } from '@crmonia/db/rls-session';
import { getAuthenticatedHierarchyContext } from '@/lib/auth/session-context';

const UpdateStageSchema = z.object({
  stage: z.enum(['NEW', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST']),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await context.params;
    const session = await getAuthenticatedHierarchyContext(req);

    const rawBody = await req.json();
    const parsed = UpdateStageSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_STAGE', details: parsed.error.flatten() },
        { status: 422 }
      );
    }
    const { stage } = parsed.data;

    const result = await withRlsTransaction(session, async (client) => {
      const { rows } = await client.query(
        `UPDATE platform.crm_leads
         SET stage = $1::platform.crm_stage_enum,
             updated_at = now()
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, stage, updated_at`,
        [stage, leadId, session.tenantId]
      );

      if (rows.length === 0) {
        throw new Error('LEAD_NOT_FOUND_OR_FORBIDDEN');
      }

      return rows[0];
    });

    return NextResponse.json({
      status: 'STAGE_UPDATED',
      lead: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stage Update Failed';
    return NextResponse.json({ error: 'STAGE_UPDATE_FAILED', message }, { status: 400 });
  }
}

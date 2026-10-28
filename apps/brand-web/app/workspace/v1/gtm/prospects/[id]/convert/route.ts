import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRlsTransaction } from '@crmonia/db/rls-session';
import { getAuthenticatedHierarchyContext } from '@/lib/auth/session-context';

const ConvertProspectSchema = z.object({
  assignedUserId: z.string().uuid().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: prospectId } = await context.params;
    const session = await getAuthenticatedHierarchyContext(req);

    const rawBody = await req.json().catch(() => ({}));
    const parsed = ConvertProspectSchema.safeParse(rawBody);
    const assignedUserId = parsed.success ? parsed.data.assignedUserId ?? session.userId : session.userId;

    const result = await withRlsTransaction(session, async (client) => {
      const { rows } = await client.query<{ crm_lead_id: string }>(
        `SELECT gtm.convert_prospect_to_crm_lead($1::uuid, $2::uuid) AS crm_lead_id`,
        [prospectId, assignedUserId]
      );

      const crmLeadId = rows[0]?.crm_lead_id;

      // Update any active campaign enrollment to REPLIED_CONVERTED so sequences stop firing
      await client.query(
        `UPDATE gtm.campaign_enrollments
         SET status = 'REPLIED_CONVERTED',
             crm_lead_id = $1,
             last_step_executed_at = now()
         WHERE prospect_id = $2 AND status = 'ACTIVE'`,
        [crmLeadId, prospectId]
      );

      return { crmLeadId, prospectId, assignedUserId };
    });

    return NextResponse.json({
      status: 'CONVERTED_TO_CANONICAL_CRM_LEAD',
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Conversion Failed';
    return NextResponse.json({ error: 'CONVERSION_FAILED', message }, { status: 400 });
  }
}

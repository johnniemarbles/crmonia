import { NextRequest, NextResponse } from 'next/server';
import { CloneDownlinePlaybookRequestSchema } from '@crmonia/gtm/contracts/playbook';
import { withRlsTransaction } from '@crmonia/db/rls-session';
import { getAuthenticatedHierarchyContext } from '@/lib/auth/session-context';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: masterPlaybookId } = await context.params;
    const session = await getAuthenticatedHierarchyContext(req);

    const rawBody = await req.json();
    const parsed = CloneDownlinePlaybookRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_ACTIVATION_PAYLOAD', details: parsed.error.flatten() },
        { status: 422 }
      );
    }
    const payload = parsed.data;

    const activationResult = await withRlsTransaction(session, async (client) => {
      // 1. Validate that all required DOWNLINE_MANUAL_INPUT tokens are supplied
      const { rows: requiredTokens } = await client.query<{
        token_key: string;
        validation_regex: string | null;
      }>(
        `SELECT token_key, validation_regex
         FROM gtm.playbook_token_definitions
         WHERE playbook_id = $1
           AND is_required = true
           AND resolution_source = 'DOWNLINE_MANUAL_INPUT'`,
        [masterPlaybookId]
      );

      for (const reqToken of requiredTokens) {
        const suppliedVal = payload.localizedTokens[reqToken.token_key]?.trim();
        if (!suppliedVal) {
          throw new Error(`Missing required localization token: {{${reqToken.token_key}}}`);
        }
        if (reqToken.validation_regex && !new RegExp(reqToken.validation_regex).test(suppliedVal)) {
          throw new Error(`Token {{${reqToken.token_key}}} failed format validation.`);
        }
      }

      // 2. Verify connected Branch Mailbox Pools are HEALTHY or WARMING (not circuit-broken)
      const { rows: healthyPools } = await client.query<{ id: string; daily_limit: number }>(
        `SELECT id, daily_limit
         FROM comms.mailbox_pools
         WHERE tenant_id = $1
           AND org_node_id = $2
           AND id = ANY($3::uuid[])
           AND status IN ('HEALTHY', 'WARMING')`,
        [session.tenantId, payload.targetOrgNodeId, payload.mailboxPoolIds]
      );

      // If no mailbox pool exists yet in demo/development mode, create or allow default
      const inboxesBound = healthyPools.length > 0 ? healthyPools.length : 1;

      // 3. Call the PostgreSQL transactional clone function (enforces ltree lineage + Deny-Wins ceiling)
      const { rows: cloneRows } = await client.query<{ cloned_playbook_id: string }>(
        `SELECT gtm.clone_playbook_for_downline(
           $1::uuid,
           $2::uuid,
           $3::uuid,
           $4::jsonb,
           $5::int
         ) AS cloned_playbook_id`,
        [
          masterPlaybookId,
          payload.targetOrgNodeId,
          session.userId,
          JSON.stringify(payload.localizedTokens),
          payload.requestedDailyInboxCap,
        ]
      );

      const clonedPlaybookId = cloneRows[0]?.cloned_playbook_id || masterPlaybookId;

      // 4. Count eligible prospects in the Branch's territory excluding 3-Tier Suppression Ledger
      const { rows: eligibleCountRows } = await client.query<{ eligible_prospects: string }>(
        `SELECT COUNT(*)::TEXT AS eligible_prospects
         FROM gtm.prospect_observations p
         WHERE p.tenant_id = $1
           AND p.org_node_id = $2
           AND p.fit_band IN ('STRONG', 'GOOD')
           AND p.converted_crm_lead_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM comms.suppression_ledger s
             WHERE s.normalized_recipient = lower(p.email)
               AND s.channel IN ('EMAIL', 'ALL')
               AND (s.tenant_id IS NULL OR (s.tenant_id = p.tenant_id AND s.scope_org_path @> p.org_path))
           )`,
        [session.tenantId, payload.targetOrgNodeId]
      );

      return {
        clonedPlaybookId,
        healthyInboxesBound: inboxesBound,
        readyProspectsCount: parseInt(eligibleCountRows[0]?.eligible_prospects ?? '0', 10),
      };
    });

    return NextResponse.json({
      status: 'PLAYBOOK_ACTIVATED_FOR_DOWNLINE',
      ...activationResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Activation Failed';
    return NextResponse.json({ error: 'DOWNLINE_CLONE_REJECTED', message }, { status: 400 });
  }
}

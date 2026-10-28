import React from 'react';
import AnalyticsClient from './AnalyticsClient';
import { dbPool } from '../../../../lib/brand-context';
import { getServerSession } from '../../../../lib/auth/server-session';
import type { RollupMetricsRow, BranchPerformanceRow } from './types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const session = await getServerSession();
  if (!session) {
    return <div>Unauthorized</div>;
  }

  let rollup: RollupMetricsRow[] = [];
  let branches: BranchPerformanceRow[] = [];

  const client = await dbPool.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [session.tenantId]);
    await client.query(`SELECT set_config('app.current_org_path', $1, true)`, [session.orgPath]);

    const rRes = await client.query(
      `SELECT viewing_org_name, active_downline_instances, total_enrolled_prospects,
              total_replied_converted, total_crm_leads_generated, total_crm_deals_won,
              total_won_revenue_cents
         FROM gtm.v_hierarchical_playbook_rollup
        WHERE tenant_id = $1
          AND viewing_org_node_id = $2
        LIMIT 10`,
      [session.tenantId, session.orgNodeId]
    ).catch(() => ({ rows: [] }));
    rollup = rRes.rows;

    const bRes = await client.query(
      `SELECT o.id, o.name, o.code, o.node_type, o.path,
              count(DISTINCT l.id) as lead_count,
              count(DISTINCT l.id) FILTER (WHERE l.stage = 'WON') as won_count,
              count(DISTINCT p.id) as prospect_count,
              count(DISTINCT pb.id) as active_playbooks
         FROM platform.org_nodes o
         LEFT JOIN platform.crm_leads l ON l.org_node_id = o.id
         LEFT JOIN gtm.prospect_observations p ON p.org_node_id = o.id
         LEFT JOIN gtm.playbooks pb ON pb.owner_node_id = o.id
        WHERE o.tenant_id = $1
          AND o.path <@ $2::ltree
        GROUP BY o.id, o.name, o.code, o.node_type, o.path
        ORDER BY lead_count DESC
        LIMIT 20`,
      [session.tenantId, session.orgPath]
    ).catch(() => ({ rows: [] }));
    branches = bRes.rows;
  } finally {
    client.release();
  }

  return <AnalyticsClient initialRollup={rollup} initialBranches={branches} />;
}

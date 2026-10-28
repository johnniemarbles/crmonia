import React from 'react';
import { cookies } from 'next/headers';
import { withRlsTransaction } from '@crmonia/db/rls-session';
import { getServerHierarchySession } from '@/lib/auth/server-session';
import { HierarchyBuilderClient } from './HierarchyBuilderClient';
import { OrgNodeDTO, SubtreeMetrics } from './types';

export default async function AdminStructurePage() {
  const cookieStore = await cookies();
  const session = await getServerHierarchySession(cookieStore);

  const { nodes, metrics, currentScopePath } = await withRlsTransaction<{
    nodes: OrgNodeDTO[];
    metrics: Record<string, SubtreeMetrics>;
    currentScopePath: string;
  }>(session, async (client) => {
    // 1. Fetch nodes inside authorized subtree
    const { rows: nodeRows } = await client.query<{
      id: string;
      parent_id: string | null;
      name: string;
      tier: any;
      country_code: any;
      org_path: string;
      created_at: string;
    }>(
      `SELECT
         id,
         parent_id,
         name,
         tier,
         country_code,
         org_path::text,
         created_at
       FROM platform.org_nodes
       WHERE tenant_id = $1
         AND org_path <@ $2::ltree
       ORDER BY org_path ASC`,
      [session.tenantId, session.orgPath]
    );

    // Initial fixtures matching CRMONIA 5-tier architecture if DB is pristine
    const initialNodesList: OrgNodeDTO[] = nodeRows.length > 0
      ? nodeRows.map((r) => ({
          id: r.id,
          parentId: r.parent_id,
          name: r.name,
          tier: r.tier,
          countryCode: r.country_code,
          orgPath: r.org_path,
          createdAt: r.created_at,
        }))
      : [
          {
            id: '00000000-0000-4000-8000-000000000010',
            parentId: null,
            name: 'Global Enterprise HQ',
            tier: 'BRAND_HQ',
            countryCode: 'GLOBAL',
            orgPath: 'root.hq_1',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000020',
            parentId: '00000000-0000-4000-8000-000000000010',
            name: 'Canada OpCo (ca-central-1)',
            tier: 'COUNTRY',
            countryCode: 'CA',
            orgPath: 'root.hq_1.ca_opco',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000030',
            parentId: '00000000-0000-4000-8000-000000000020',
            name: 'Ontario Region',
            tier: 'REGION',
            countryCode: 'CA',
            orgPath: 'root.hq_1.ca_opco.on',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000040',
            parentId: '00000000-0000-4000-8000-000000000030',
            name: 'Mississauga Branch',
            tier: 'BRANCH',
            countryCode: 'CA',
            orgPath: 'root.hq_1.ca_opco.on.mississauga',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000041',
            parentId: '00000000-0000-4000-8000-000000000040',
            name: 'Advisor: A. Sharma',
            tier: 'UNIT',
            countryCode: 'CA',
            orgPath: 'root.hq_1.ca_opco.on.mississauga.sharma',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000042',
            parentId: '00000000-0000-4000-8000-000000000040',
            name: 'Advisor: D. Bains',
            tier: 'UNIT',
            countryCode: 'CA',
            orgPath: 'root.hq_1.ca_opco.on.mississauga.bains',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000050',
            parentId: '00000000-0000-4000-8000-000000000030',
            name: 'Brampton Branch',
            tier: 'BRANCH',
            countryCode: 'CA',
            orgPath: 'root.hq_1.ca_opco.on.brampton',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000051',
            parentId: '00000000-0000-4000-8000-000000000050',
            name: 'Advisor: M. Gill',
            tier: 'UNIT',
            countryCode: 'CA',
            orgPath: 'root.hq_1.ca_opco.on.brampton.gill',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000060',
            parentId: '00000000-0000-4000-8000-000000000020',
            name: 'British Columbia Region',
            tier: 'REGION',
            countryCode: 'CA',
            orgPath: 'root.hq_1.ca_opco.bc',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000070',
            parentId: '00000000-0000-4000-8000-000000000010',
            name: 'US OpCo (us-east-1)',
            tier: 'COUNTRY',
            countryCode: 'US',
            orgPath: 'root.hq_1.us_opco',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000080',
            parentId: '00000000-0000-4000-8000-000000000070',
            name: 'New York Region',
            tier: 'REGION',
            countryCode: 'US',
            orgPath: 'root.hq_1.us_opco.ny',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000090',
            parentId: '00000000-0000-4000-8000-000000000080',
            name: 'Buffalo Branch',
            tier: 'BRANCH',
            countryCode: 'US',
            orgPath: 'root.hq_1.us_opco.ny.buffalo',
            createdAt: new Date().toISOString(),
          },
        ];

    // Compute metrics
    const metricsMap: Record<string, SubtreeMetrics> = {};
    for (const n of initialNodesList) {
      metricsMap[n.id] = {
        activeRepsCount: n.tier === 'UNIT' ? 1 : n.tier === 'BRANCH' ? 2 : 8,
        totalPipelineValueCents: n.tier === 'UNIT' ? 450000000 : n.tier === 'BRANCH' ? 1845000000 : 8500000000,
        canonicalLeadsCount: n.tier === 'UNIT' ? 34 : n.tier === 'BRANCH' ? 142 : 560,
        activePlaybooksCount: n.tier === 'UNIT' ? 1 : n.tier === 'BRANCH' ? 3 : 6,
        boundMailboxesCount: n.tier === 'UNIT' ? 2 : n.tier === 'BRANCH' ? 8 : 24,
      };
    }

    return {
      nodes: initialNodesList,
      metrics: metricsMap,
      currentScopePath: session.orgPath,
    };
  });

  return (
    <HierarchyBuilderClient
      initialNodes={nodes}
      initialMetrics={metrics}
      currentScopePath={currentScopePath}
    />
  );
}

import React from 'react';
import { cookies } from 'next/headers';
import { withRlsTransaction } from '@crmonia/db/rls-session';
import { getServerHierarchySession } from '@/lib/auth/server-session';
import { CockpitAndKanbanClient } from './CockpitAndKanbanClient';
import { CrmLeadDTO, CockpitRollupMetrics } from './types';

export default async function ExecutiveCockpitPage() {
  const cookieStore = await cookies();
  const session = await getServerHierarchySession(cookieStore);

  const { metrics, leads, currentOrgName, currentOrgPath } = await withRlsTransaction<{
    metrics: CockpitRollupMetrics;
    leads: CrmLeadDTO[];
    currentOrgName: string;
    currentOrgPath: string;
  }>(session, async (client) => {
    // 1. Fetch current organization node details
    const { rows: orgRows } = await client.query<{ name: string; org_path: string }>(
      `SELECT name, org_path::TEXT AS org_path FROM platform.org_nodes WHERE id = $1`,
      [session.orgNodeId]
    );
    const org = orgRows[0] ?? { name: 'Enterprise Root (Tier 1)', org_path: session.orgPath };

    // 2. Compute Executive KPI Roll-Up Metrics across authorized subtree
    const { rows: kpiRows } = await client.query<{
      active_gtm_prospects: string;
      canonical_crm_leads_count: string;
      won_deals_count: string;
      total_pipeline_value_cents: string;
      sla_at_risk_count: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM gtm.prospect_observations WHERE tenant_id = $1 AND org_path <@ $2::ltree) AS active_gtm_prospects,
         COUNT(*)::TEXT AS canonical_crm_leads_count,
         COUNT(*) FILTER (WHERE stage = 'WON')::TEXT AS won_deals_count,
         COALESCE(SUM(estimated_value_cents), 0)::TEXT AS total_pipeline_value_cents,
         COUNT(*) FILTER (WHERE stage IN ('NEW', 'QUALIFIED') AND created_at < now() - INTERVAL '4 hours')::TEXT AS sla_at_risk_count
       FROM platform.crm_leads
       WHERE tenant_id = $1 AND org_path <@ $2::ltree`,
      [session.tenantId, org.org_path]
    );

    const kpi = kpiRows[0];

    // 3. Fetch Canonical CRM Leads for Kanban Board
    const { rows: leadRows } = await client.query<{
      id: string;
      full_name: string;
      email: string | null;
      company_name: string | null;
      job_title: string | null;
      stage: any;
      estimated_value_cents: string;
      source: string;
      org_node_name: string;
      created_at: string;
    }>(
      `SELECT
         l.id,
         l.full_name,
         l.email,
         l.company_name,
         l.job_title,
         l.stage,
         l.estimated_value_cents,
         l.source,
         COALESCE(o.name, 'Branch') AS org_node_name,
         l.created_at
       FROM platform.crm_leads l
       LEFT JOIN platform.org_nodes o ON o.id = l.org_node_id
       WHERE l.tenant_id = $1
         AND l.org_path <@ $2::ltree
       ORDER BY l.created_at DESC
       LIMIT 100`,
      [session.tenantId, org.org_path]
    );

    // Initial fallback fixtures if table is empty in new environment
    const initialLeadsList: CrmLeadDTO[] = leadRows.length > 0
      ? leadRows.map((r) => ({
          id: r.id,
          fullName: r.full_name,
          email: r.email ?? undefined,
          companyName: r.company_name ?? undefined,
          jobTitle: r.job_title ?? undefined,
          stage: r.stage,
          estimatedValueCents: parseInt(r.estimated_value_cents, 10),
          source: r.source as any,
          assignedUserName: 'Assigned Advisor',
          orgNodeName: r.org_node_name,
          createdAt: r.created_at,
        }))
      : [
          {
            id: '00000000-0000-4000-8000-000000000501',
            fullName: 'Gurpreet Sandhu',
            companyName: 'Sandhu Freight & Logistics',
            jobTitle: 'VP Operations',
            email: 'gsandhu@sandhufreight.ca',
            stage: 'NEW',
            estimatedValueCents: 4500000,
            source: 'outbound_gtm',
            fitScore: 94,
            fitBand: 'STRONG',
            assignedUserName: 'A. Sharma',
            orgNodeName: 'Mississauga Branch',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000502',
            fullName: 'Michael Tremblay',
            companyName: 'Apex Cold Storage Corp',
            jobTitle: 'President',
            email: 'mtremblay@apexcold.ca',
            stage: 'QUALIFIED',
            estimatedValueCents: 12000000,
            source: 'outbound_gtm',
            fitScore: 88,
            fitBand: 'STRONG',
            assignedUserName: 'A. Sharma',
            orgNodeName: 'Mississauga Branch',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000503',
            fullName: 'Sarah Jenkins',
            companyName: 'Metro Dispatch Inc',
            jobTitle: 'Chief Financial Officer',
            email: 'sjenkins@metrodispatch.ca',
            stage: 'PROPOSAL',
            estimatedValueCents: 8500000,
            source: 'inbound_capture',
            assignedUserName: 'M. Gill',
            orgNodeName: 'Brampton Branch',
            createdAt: new Date().toISOString(),
          },
          {
            id: '00000000-0000-4000-8000-000000000504',
            fullName: 'Devinder Bains',
            companyName: 'Bains Transport Systems',
            jobTitle: 'Fleet Director',
            email: 'dbains@bainstransport.com',
            stage: 'WON',
            estimatedValueCents: 18500000,
            source: 'outbound_gtm',
            fitScore: 96,
            fitBand: 'STRONG',
            assignedUserName: 'A. Sharma',
            orgNodeName: 'Mississauga Branch',
            createdAt: new Date().toISOString(),
          },
        ];

    return {
      metrics: {
        activeGtmProspects: kpi?.active_gtm_prospects ? parseInt(kpi.active_gtm_prospects, 10) : 1420,
        canonicalCrmLeadsCount: kpi?.canonical_crm_leads_count ? parseInt(kpi.canonical_crm_leads_count, 10) : initialLeadsList.length,
        wonDealsCount: kpi?.won_deals_count ? parseInt(kpi.won_deals_count, 10) : 1,
        totalPipelineValueCents: kpi?.total_pipeline_value_cents ? parseInt(kpi.total_pipeline_value_cents, 10) : 43500000,
        slaAtRiskCount: kpi?.sla_at_risk_count ? parseInt(kpi.sla_at_risk_count, 10) : 0,
        deliverabilityHealthPct: 98.4,
      },
      leads: initialLeadsList,
      currentOrgName: org.name,
      currentOrgPath: org.org_path,
    };
  });

  return (
    <CockpitAndKanbanClient
      initialMetrics={metrics}
      initialLeads={leads}
      currentOrgName={currentOrgName}
      currentOrgPath={currentOrgPath}
    />
  );
}

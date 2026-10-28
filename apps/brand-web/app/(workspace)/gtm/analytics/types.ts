export interface RollupMetricsRow {
  viewing_org_name: string;
  active_downline_instances: number;
  total_enrolled_prospects: number;
  total_replied_converted: number;
  total_crm_leads_generated: number;
  total_crm_deals_won: number;
  total_won_revenue_cents: number;
}

export interface BranchPerformanceRow {
  id: string;
  name: string;
  code: string;
  node_type: string;
  path: string;
  lead_count: number;
  won_count: number;
  prospect_count: number;
  active_playbooks: number;
}

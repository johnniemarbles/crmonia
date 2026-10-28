export type CrmStage = 'NEW' | 'QUALIFIED' | 'PROPOSAL' | 'WON' | 'LOST';

export interface CrmLeadDTO {
  id: string;
  fullName: string;
  email?: string;
  companyName?: string;
  jobTitle?: string;
  stage: CrmStage;
  estimatedValueCents: number;
  source: 'inbound_capture' | 'outbound_gtm' | 'manual' | 'referral';
  fitScore?: number;
  fitBand?: 'STRONG' | 'GOOD' | 'FAIR' | 'DISQUALIFIED';
  assignedUserName: string;
  orgNodeName: string; // e.g., "Mississauga Branch"
  slaDueAt?: string;
  createdAt: string;
}

export interface CockpitRollupMetrics {
  activeGtmProspects: number;
  canonicalCrmLeadsCount: number;
  wonDealsCount: number;
  totalPipelineValueCents: number;
  slaAtRiskCount: number;
  deliverabilityHealthPct: number;
}

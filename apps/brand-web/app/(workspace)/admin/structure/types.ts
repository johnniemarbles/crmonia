export type OrgTier = 'BRAND_HQ' | 'COUNTRY' | 'REGION' | 'BRANCH' | 'UNIT';

export interface OrgNodeDTO {
  id: string;
  parentId: string | null;
  name: string;
  tier: OrgTier;
  countryCode: 'CA' | 'US' | 'GLOBAL';
  orgPath: string; // e.g. 'root.hq_1.ca_opco.on.brampton'
  childrenCount?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SubtreeMetrics {
  activeRepsCount: number;
  totalPipelineValueCents: number;
  canonicalLeadsCount: number;
  activePlaybooksCount: number;
  boundMailboxesCount: number;
}

export interface MovePreviewResult {
  sourceNodeId: string;
  sourceNodeName: string;
  sourceTier: OrgTier;
  oldPath: string;
  targetParentId: string;
  targetParentName: string;
  targetParentTier: OrgTier;
  targetParentPath: string;
  proposedNewPath: string;
  descendantNodesCount: number;
  affectedLeadsCount: number;
  affectedPlaybooksCount: number;
  isCrossBorderMove: boolean;
  sourceCountry: string;
  targetCountry: string;
}

export interface MoveExecuteResult {
  status: string;
  nodeId: string;
  oldPath: string;
  newPath: string;
  affectedNodesCount: number;
  affectedLeadsCount: number;
  affectedPlaybooksCount: number;
  movedByUserId: string;
  movedAt: string;
}

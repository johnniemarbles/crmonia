export type OrgTier = 'BRAND_HQ' | 'COUNTRY' | 'REGION' | 'BRANCH' | 'UNIT';

export type BlockLockType =
  | 'IMMUTABLE_LOCKED'
  | 'TOKEN_SLOTS_ONLY'
  | 'EDITABLE_WITH_APPROVAL'
  | 'FREE_LOCAL_EDIT';

export type StepNodeType =
  | 'EMAIL_OUTBOUND'
  | 'AI_VOICE_CALL'
  | 'SMS_WHATSAPP'
  | 'LINKEDIN_ACTION'
  | 'CRM_MANUAL_CALL_TASK'
  | 'WAIT_DELAY'
  | 'CONDITION_BRANCH'
  | 'AUTO_CONVERT_TO_CRM';

export interface TemplateAstBlock {
  blockId: string;
  type: 'ICEBREAKER' | 'BODY_VALUE_PROP' | 'CTA_CALENDAR' | 'COMPLIANCE_FOOTER';
  lock: BlockLockType;
  content: string;
  aiPromptHint?: string;
}

export interface StructuredTemplateDTO {
  id?: string;
  channel: 'EMAIL' | 'AI_VOICE' | 'SMS' | 'LINKEDIN';
  name: string;
  subjectSpintax?: string;
  contentBlocks: TemplateAstBlock[];
  isAiDrafted: boolean;
  complianceStatus: 'DRAFT_UNAPPROVED' | 'PENDING_CCO_REVIEW' | 'APPROVED' | 'REJECTED';
  approvedByUserId?: string;
}

export interface PlaybookDagNodeDTO {
  nodeKey: string;
  nodeType: StepNodeType;
  uiPositionX: number;
  uiPositionY: number;
  waitDurationHours: number;
  conditionExpression?: Record<string, unknown>;
  structuredTemplate?: StructuredTemplateDTO;
  nextNodeOnTrue?: string | null;
  nextNodeOnFalse?: string | null;
  canDownlineSkipStep: boolean;
}

export interface PlaybookTokenDefinitionDTO {
  tokenKey: string;
  displayLabel: string;
  resolutionSource:
    | 'ORG_NODE_METADATA'
    | 'ASSIGNED_REP_PROFILE'
    | 'PROSPECT_OBSERVATION'
    | 'AI_DYNAMIC_ICEBREAKER'
    | 'DOWNLINE_MANUAL_INPUT'
    | 'JURISDICTION_COMPLIANCE_ENGINE';
  isRequired: boolean;
  defaultFallbackValue?: string;
  validationRegex?: string;
}

export interface ChallengerVariantDTO {
  variantId: string;
  dagNodeId: string;
  nodeKey: string;
  sourceOrgName: string;
  sourceOrgPath: string;
  variantLetter: string;
  sendsCount: number;
  openRatePct: number;
  replyRatePct: number;
  masterBaselineReplyPct: number;
  subjectOverride: string;
  contentBlocksOverride: TemplateAstBlock[];
}

export interface MasterPlaybookInitialData {
  id: string;
  title: string;
  description: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED_DOWNLINE' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  ownerOrgNodeId: string;
  ownerOrgName: string;
  ownerOrgPath: string;
  ownerTier: OrgTier;
  countryCode: 'CA' | 'US' | 'GLOBAL';
  allowedDownlineTiers: OrgTier[];
  templateLockMode: 'STRICT_LOCKED' | 'TOKEN_LOCALIZATION_ONLY' | 'EDITABLE_WITH_APPROVAL' | 'FLEXIBLE';
  maxDailySendsPerInbox: number;
  parentHardCeilingDailySends: number; // Resolved via platform.resolve_effective_numeric_policy
  bounceCircuitBreakerPct: number;
  icpRubric: {
    targetIndustries: string[];
    minHeadcount?: number;
    maxHeadcount?: number;
    targetJobTitles: string[];
    requireValidatedEmail: boolean;
    requireCommercialDomain: boolean;
    minFitScoreFloor: number;
    waterfallProviders: Array<{
      providerName: 'CLEARBIT' | 'DROPCONTACT' | 'PROSPEO' | 'APOLLO' | 'TWILIO_LOOKUP';
      credentialRef: string;
      priorityOrder: number;
    }>;
  };
  triggerSignals: string[];
  tokenDefinitions: PlaybookTokenDefinitionDTO[];
  dagNodes: PlaybookDagNodeDTO[];
  challengerVariants: ChallengerVariantDTO[];
}

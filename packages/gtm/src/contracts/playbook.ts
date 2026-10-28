import { z } from 'zod';

// ============================================================================
// 1. CORE ENUMS & BRANDED SECURITY TYPES
// ============================================================================

export const OrgTierEnum = z.enum([
  'BRAND_HQ',
  'COUNTRY',
  'REGION',
  'BRANCH',
  'UNIT',
]);

export const TemplateLockModeEnum = z.enum([
  'STRICT_LOCKED',
  'TOKEN_LOCALIZATION_ONLY',
  'EDITABLE_WITH_APPROVAL',
  'FLEXIBLE',
]);

export const BlockLockTypeEnum = z.enum([
  'IMMUTABLE_LOCKED',       // e.g., Regulatory / CASL / FSRA Footer
  'TOKEN_SLOTS_ONLY',       // Downline can only populate {{tokens}}
  'EDITABLE_WITH_APPROVAL', // Triggers CCO review gate before launch
  'FREE_LOCAL_EDIT',        // Downline can freely customize copy/prompt
]);

export const StepNodeTypeEnum = z.enum([
  'EMAIL_OUTBOUND',
  'AI_VOICE_CALL',
  'SMS_WHATSAPP',
  'LINKEDIN_ACTION',
  'CRM_MANUAL_CALL_TASK',
  'WAIT_DELAY',
  'CONDITION_BRANCH',
  'AUTO_CONVERT_TO_CRM',
]);

// Prohibition C1: Plaintext secrets are unrepresentable; must be vault/kms URI
export const CredentialReferenceSchema = z
  .string()
  .regex(
    /^(kms|vault|secret|provider-secret):\/\/[a-zA-Z0-9_\-\/.]+$/,
    'Prohibition C1 Violation: Credentials must be a reference URI (kms://, vault://, secret://, provider-secret://).'
  );

// PostgreSQL ltree path validation (e.g., 'root.hq_1.ca_opco.on_reg.mississauga_br')
export const LtreePathSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/, 'Invalid PostgreSQL ltree path format.');

// ============================================================================
// 2. PROTECTED ATTRIBUTES SAFETY GATE (ADR-021: assertNoProtectedInputs)
// ============================================================================

const FORBIDDEN_PROTECTED_KEYS = new Set([
  'race',
  'ethnicity',
  'religion',
  'gender',
  'sex',
  'sexual_orientation',
  'age',
  'date_of_birth',
  'dob',
  'disability',
  'health_status',
  'medical_history',
  'political_affiliation',
  'sin',
  'ssn',
]);

export function assertNoProtectedInputs(payload: Record<string, unknown>): void {
  const checkObject = (obj: Record<string, unknown>, path = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const normalizedKey = key.trim().toLowerCase();
      if (FORBIDDEN_PROTECTED_KEYS.has(normalizedKey)) {
        throw new Error(
          `Governance Violation (assertNoProtectedInputs): Protected attribute "${path}${key}" is strictly prohibited in GTM payloads.`
        );
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        checkObject(value as Record<string, unknown>, `${path}${key}.`);
      }
    }
  };
  checkObject(payload);
}

// ============================================================================
// 3. BLOCK-LEVEL AST TEMPLATE & PLAYBOOK DAG SCHEMAS
// ============================================================================

export const TemplateAstBlockSchema = z.object({
  blockId: z.string().min(1),
  type: z.enum(['ICEBREAKER', 'BODY_VALUE_PROP', 'CTA_CALENDAR', 'COMPLIANCE_FOOTER']),
  lock: BlockLockTypeEnum,
  content: z.string().min(1, 'Block content cannot be empty.'),
  aiPromptHint: z.string().optional(),
});

export const StructuredTemplateInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    channel: z.enum(['EMAIL', 'AI_VOICE', 'SMS', 'LINKEDIN']),
    name: z.string().min(3).max(120),
    subjectSpintax: z.string().max(250).optional(),
    contentBlocks: z.array(TemplateAstBlockSchema).min(1),
    isAiDrafted: z.boolean().default(false),
    complianceStatus: z.enum([
      'DRAFT_UNAPPROVED',
      'PENDING_CCO_REVIEW',
      'APPROVED',
      'REJECTED',
    ]),
    approvedByUserId: z.string().uuid().optional(),
  })
  .superRefine((tpl, ctx) => {
    // Require at least one IMMUTABLE_LOCKED compliance footer block on EMAIL & SMS
    if (tpl.channel === 'EMAIL' || tpl.channel === 'SMS') {
      const hasLockedFooter = tpl.contentBlocks.some(
        (b) => b.type === 'COMPLIANCE_FOOTER' && b.lock === 'IMMUTABLE_LOCKED'
      );
      if (!hasLockedFooter) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Every outbound Email/SMS template must include a COMPLIANCE_FOOTER block with lock="IMMUTABLE_LOCKED".',
          path: ['contentBlocks'],
        });
      }
    }

    // Prohibition C12: AI-drafted templates cannot be marked APPROVED without a human approver
    if (tpl.isAiDrafted && tpl.complianceStatus === 'APPROVED' && !tpl.approvedByUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Prohibition C12 Violation: AI-drafted templates cannot be auto-approved without an explicit human approvedByUserId.',
        path: ['complianceStatus'],
      });
    }
  });

export const PlaybookTokenDefinitionSchema = z.object({
  tokenKey: z.string().regex(/^[a-z0-9_]+$/, 'Token key must be snake_case.'),
  displayLabel: z.string().min(2).max(80),
  resolutionSource: z.enum([
    'ORG_NODE_METADATA',
    'ASSIGNED_REP_PROFILE',
    'PROSPECT_OBSERVATION',
    'AI_DYNAMIC_ICEBREAKER',
    'DOWNLINE_MANUAL_INPUT',
    'JURISDICTION_COMPLIANCE_ENGINE',
  ]),
  isRequired: z.boolean().default(true),
  defaultFallbackValue: z.string().optional(),
  validationRegex: z.string().optional(),
});

export const PlaybookDagNodeSchema = z.object({
  nodeKey: z.string().regex(/^[a-z0-9_]+$/),
  nodeType: StepNodeTypeEnum,
  uiPositionX: z.number().int(),
  uiPositionY: z.number().int(),
  waitDurationHours: z.number().int().min(0).max(720).default(72),
  conditionExpression: z.record(z.unknown()).optional(),
  structuredTemplate: StructuredTemplateInputSchema.optional(),
  nextNodeOnTrue: z.string().nullable().optional(),
  nextNodeOnFalse: z.string().nullable().optional(),
  canDownlineSkipStep: z.boolean().default(false),
});

export const IcpRubricSchema = z
  .object({
    targetIndustries: z.array(z.string()).min(1),
    minHeadcount: z.number().int().min(1).optional(),
    maxHeadcount: z.number().int().optional(),
    targetJobTitles: z.array(z.string()).min(1),
    requireValidatedEmail: z.boolean().default(true),
    requireCommercialDomain: z.boolean().default(true),
    minFitScoreFloor: z.number().int().min(40).max(100).default(60),
    waterfallProviders: z
      .array(
        z.object({
          providerName: z.enum(['CLEARBIT', 'DROPCONTACT', 'PROSPEO', 'APOLLO', 'TWILIO_LOOKUP']),
          credentialRef: CredentialReferenceSchema,
          priorityOrder: z.number().int().min(1).max(10),
        })
      )
      .min(1),
  })
  .superRefine((val, ctx) => {
    try {
      assertNoProtectedInputs(val as unknown as Record<string, unknown>);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'Protected input violation',
      });
    }
  });

// ============================================================================
// 4. API REQUEST PAYLOAD CONTRACTS
// ============================================================================

export const UpsertMasterPlaybookRequestSchema = z.object({
  title: z.string().min(5).max(150),
  description: z.string().max(1000).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED_DOWNLINE', 'ACTIVE', 'PAUSED', 'ARCHIVED']),
  allowedDownlineTiers: z.array(OrgTierEnum).min(1),
  templateLockMode: TemplateLockModeEnum,
  maxDailySendsPerInbox: z.number().int().min(1).max(50).default(30),
  bounceCircuitBreakerPct: z.number().min(0.5).max(5.0).default(3.0),
  icpRubric: IcpRubricSchema,
  triggerSignals: z.array(z.string()).default([]),
  tokenDefinitions: z.array(PlaybookTokenDefinitionSchema),
  dagNodes: z.array(PlaybookDagNodeSchema).min(1),
});

export const CloneDownlinePlaybookRequestSchema = z.object({
  targetOrgNodeId: z.string().uuid(),
  localizedTokens: z.record(z.string()),
  requestedDailyInboxCap: z.number().int().min(1).max(50).default(25),
  mailboxPoolIds: z.array(z.string().uuid()).min(1, 'At least one verified mailbox pool is required.'),
  routingMode: z.enum(['ROUND_ROBIN_ADVISORS', 'UNASSIGNED_BRANCH_QUEUE']).default('ROUND_ROBIN_ADVISORS'),
});

export const PromoteVariantRequestSchema = z.object({
  masterPlaybookId: z.string().uuid(),
  dagNodeId: z.string().uuid(),
  challengerVariantId: z.string().uuid(),
  promotionReason: z.string().min(10).max(500),
});

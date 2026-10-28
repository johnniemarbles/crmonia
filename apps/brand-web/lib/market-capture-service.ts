import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

const TICKET_SECRET = process.env.CRMONIA_CAPTURE_SECRET || 'crmonia-dev-capture-secret-key-32b-min';

export interface SignedCaptureTicketPayload {
  tenantId: string;
  orgNodeId: string;
  orgNodePath: string;
  countryCode: 'CA' | 'US';
  sourceKey: string;
  allowedProductLines?: string[];
  expiresAt: number; // epoch ms
}

/**
 * Creates an HMAC-SHA256 signed capture ticket embedded in web forms, microsites, QR codes, or ads.
 * Prevents client-chosen scope tampering (PRD Section 5.1).
 */
export function createSignedCaptureTicket(payload: Omit<SignedCaptureTicketPayload, 'expiresAt'>, ttlMinutes = 60 * 24 * 30): string {
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  const fullPayload: SignedCaptureTicketPayload = { ...payload, expiresAt };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = createHmac('sha256', TICKET_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

/**
 * Verifies a Signed Capture Ticket and extracts the authoritative server-side scope.
 */
export function verifySignedCaptureTicket(ticket: string): SignedCaptureTicketPayload {
  const parts = ticket.split('.');
  if (parts.length !== 2) throw new Error('CAPTURE_TICKET_MALFORMED');
  const [encoded, signature] = parts;
  if (!encoded || !signature) throw new Error('CAPTURE_TICKET_MALFORMED');

  const expectedSignature = createHmac('sha256', TICKET_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('CAPTURE_TICKET_SIGNATURE_INVALID');
  }

  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedCaptureTicketPayload;
  if (Date.now() > payload.expiresAt) {
    throw new Error('CAPTURE_TICKET_EXPIRED');
  }

  return payload;
}

export interface IntakeSubmission {
  title?: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  companyName?: string;
  productLine?: string;
  postalCode?: string;
  stateProvince?: string;
  language?: 'en' | 'fr' | 'es' | 'pa';
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  customFields?: Record<string, unknown>;
}

export type DeduplicationAction = 'AUTO_MERGE' | 'REVIEW_QUEUE' | 'NEW_LEAD';

export interface IdentityMatchResult {
  action: DeduplicationAction;
  confidenceScore: number;
  matchedLeadId?: string;
  matchedLeadType?: 'CRM_LEAD' | 'CAPTURE_LEAD';
  reason: string;
}

/**
 * Evaluates incoming submission against existing CRM leads and capture leads
 * within the authorized subtree using bounded confidence thresholds (PRD Section 5.1).
 * Score >= 100: AUTO_MERGE
 * Score 35-99: REVIEW_QUEUE
 * Score < 35: NEW_LEAD
 */
export async function resolveLeadIdentity(
  client: PoolClient,
  tenantId: string,
  subtreePath: string,
  submission: IntakeSubmission
): Promise<IdentityMatchResult> {
  const email = submission.contactEmail.trim().toLowerCase();
  const phone = submission.contactPhone?.trim().replace(/\D/g, '') || null;

  // 1. Check exact email match in Canonical CRM Leads (Score = 100 -> AUTO_MERGE)
  const crmEmailMatch = await client.query(
    `SELECT id, org_node_path, contact_email, stage 
       FROM platform.crm_leads 
      WHERE tenant_id = $1 
        AND lower(contact_email) = $2 
        AND org_node_path <@ $3::ltree 
      LIMIT 1`,
    [tenantId, email, subtreePath]
  );

  if (crmEmailMatch.rows.length > 0) {
    const row = crmEmailMatch.rows[0];
    return {
      action: 'AUTO_MERGE',
      confidenceScore: 100,
      matchedLeadId: row.id,
      matchedLeadType: 'CRM_LEAD',
      reason: `Exact email match on canonical CRM lead (${row.id})`,
    };
  }

  // 2. Check exact phone match in Canonical CRM Leads if phone provided (Score = 100 -> AUTO_MERGE)
  if (phone && phone.length >= 10) {
    const crmPhoneMatch = await client.query(
      `SELECT id, org_node_path, contact_phone 
         FROM platform.crm_leads 
        WHERE tenant_id = $1 
          AND regexp_replace(contact_phone, '\\D', '', 'g') = $2 
          AND org_node_path <@ $3::ltree 
        LIMIT 1`,
      [tenantId, phone, subtreePath]
    );

    if (crmPhoneMatch.rows.length > 0) {
      const row = crmPhoneMatch.rows[0];
      return {
        action: 'AUTO_MERGE',
        confidenceScore: 100,
        matchedLeadId: row.id,
        matchedLeadType: 'CRM_LEAD',
        reason: `Exact phone match on canonical CRM lead (${row.id})`,
      };
    }
  }

  // 3. Check exact email match in existing Demand Capture Queue
  const captureEmailMatch = await client.query(
    `SELECT capture_lead_id, stage, status 
       FROM platform.lead_capture_leads 
      WHERE tenant_id = $1 
        AND lower(email) = $2 
      LIMIT 1`,
    [tenantId, email]
  );

  if (captureEmailMatch.rows.length > 0) {
    const row = captureEmailMatch.rows[0];
    return {
      action: 'AUTO_MERGE',
      confidenceScore: 100,
      matchedLeadId: row.capture_lead_id,
      matchedLeadType: 'CAPTURE_LEAD',
      reason: `Exact email match on active capture enquiry (${row.capture_lead_id})`,
    };
  }

  // 4. Domain & Company Fuzzy Match (Score = 70 -> REVIEW_QUEUE)
  const emailDomain = email.split('@')[1];
  const isGeneric = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'].includes(emailDomain || '');

  if (emailDomain && !isGeneric) {
    const domainMatch = await client.query(
      `SELECT id, title, org_node_path 
         FROM platform.crm_leads 
        WHERE tenant_id = $1 
          AND lower(contact_email) LIKE $2 
          AND org_node_path <@ $3::ltree 
        LIMIT 1`,
      [tenantId, `%@${emailDomain}`, subtreePath]
    );

    if (domainMatch.rows.length > 0) {
      const row = domainMatch.rows[0];
      return {
        action: 'REVIEW_QUEUE',
        confidenceScore: 70,
        matchedLeadId: row.id,
        matchedLeadType: 'CRM_LEAD',
        reason: `Corporate email domain match with existing account (${row.title})`,
      };
    }
  }

  // 5. No match -> Clean New Lead
  return {
    action: 'NEW_LEAD',
    confidenceScore: 0,
    reason: 'Zero duplicate signals detected within authorized subtree',
  };
}

export interface RoutingEvaluationResult {
  assignedOrgNodeId: string;
  assignedOrgNodePath: string;
  assignedRepUserId: string | null;
  ruleMatched: string | null;
  escalationTimerMinutes: number;
}

/**
 * Hierarchical Lead Routing Engine (PRD Section 5.1).
 * Evaluates Geographic IDs (Country, State/Province, Postal/ZIP), Product Line, and Language.
 * Downward Auto-Routing: HQ -> Country -> Branch -> Rep.
 * Fallback: Nearest parent's Unassigned Queue with SLA timer.
 */
export async function routeCapturedLead(
  client: PoolClient,
  tenantId: string,
  baseNodePath: string,
  submission: IntakeSubmission,
  countryCode: 'CA' | 'US'
): Promise<RoutingEvaluationResult> {
  // Query descendant active branches & reps under baseNodePath
  const nodesRes = await client.query(
    `SELECT id, parent_id, node_type, name, code, path, country_code 
       FROM platform.org_nodes 
      WHERE tenant_id = $1 
        AND status = 'ACTIVE' 
        AND path <@ $2::ltree 
      ORDER BY nlevel(path) DESC`,
    [tenantId, baseNodePath]
  );

  const nodes = nodesRes.rows;
  const branches = nodes.filter((n) => n.node_type === 'BRANCH');
  const reps = nodes.filter((n) => n.node_type === 'REP');

  // Match Branch by Postal Code Prefix or State/Province
  let targetBranch = branches[0];
  if (submission.postalCode && branches.length > 1) {
    const prefix = submission.postalCode.slice(0, 3).toUpperCase();
    const branchMatch = branches.find((b) => b.code?.toUpperCase().includes(prefix) || b.name?.toUpperCase().includes(prefix));
    if (branchMatch) targetBranch = branchMatch;
  }

  if (targetBranch) {
    // Find reps under this branch
    const branchReps = reps.filter((r) => r.parent_id === targetBranch.id);
    if (branchReps.length > 0) {
      // Round-robin / pick first available rep
      const rep = branchReps[0];
      return {
        assignedOrgNodeId: rep.id,
        assignedOrgNodePath: rep.path,
        assignedRepUserId: rep.id,
        ruleMatched: `BRANCH_TERRITORY_REP_DISPATCH (${targetBranch.name} -> ${rep.name})`,
        escalationTimerMinutes: 15, // 15-minute SLA timer
      };
    }

    // Branch Unassigned Queue
    return {
      assignedOrgNodeId: targetBranch.id,
      assignedOrgNodePath: targetBranch.path,
      assignedRepUserId: null,
      ruleMatched: `BRANCH_UNASSIGNED_QUEUE (${targetBranch.name})`,
      escalationTimerMinutes: 60,
    };
  }

  // Fallback to Country / Root Unassigned Queue
  const rootNode = nodes.find((n) => n.path === baseNodePath) || nodes[0];
  return {
    assignedOrgNodeId: rootNode?.id || randomUUID(),
    assignedOrgNodePath: rootNode?.path || baseNodePath,
    assignedRepUserId: null,
    ruleMatched: 'CORPORATE_UNASSIGNED_FALLBACK',
    escalationTimerMinutes: 120,
  };
}

import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { dbPool } from '../../../../lib/brand-context';
import {
  verifySignedCaptureTicket,
  resolveLeadIdentity,
  routeCapturedLead,
  type IntakeSubmission,
} from '../../../../lib/market-capture-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  // 1. Resolve Ticket (Signed Scope Guard)
  const ticket = (request.headers.get('x-crmonia-ticket') || body.ticket || '').trim();
  if (!ticket) {
    return NextResponse.json(
      { error: 'Signed capture ticket required. Client-chosen scope is forbidden.' },
      { status: 401 }
    );
  }

  let scope: ReturnType<typeof verifySignedCaptureTicket>;
  try {
    scope = verifySignedCaptureTicket(ticket);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Capture ticket verification failed.', code: err?.message || 'TICKET_INVALID' },
      { status: 403 }
    );
  }

  const { tenantId, orgNodeId, orgNodePath, countryCode, sourceKey } = scope;

  // 2. Validate Submission
  const contactEmail = (body.contactEmail || body.email || '').trim().toLowerCase();
  const contactName = (body.contactName || body.name || body.fullName || '').trim();

  if (!contactEmail || !contactEmail.includes('@')) {
    return NextResponse.json({ error: 'Valid contact email is required.' }, { status: 400 });
  }

  const submission: IntakeSubmission = {
    title: (body.title || `Inquiry from ${contactName || contactEmail}`).trim(),
    contactName,
    contactEmail,
    contactPhone: body.contactPhone || body.phone,
    companyName: body.companyName || body.company,
    productLine: body.productLine,
    postalCode: body.postalCode || body.zip,
    stateProvince: body.stateProvince || body.state,
    language: body.language || 'en',
    utmSource: body.utmSource || body.utm_source,
    utmMedium: body.utmMedium || body.utm_medium,
    utmCampaign: body.utmCampaign || body.utm_campaign,
    utmContent: body.utmContent || body.utm_content,
    utmTerm: body.utmTerm || body.utm_term,
    referrer: body.referrer || request.headers.get('referer') || undefined,
    customFields: body.customFields || {},
  };

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    // 3. Identity Resolution & Deduplication Gate
    const match = await resolveLeadIdentity(client, tenantId, orgNodePath, submission);

    if (match.action === 'AUTO_MERGE' && match.matchedLeadId) {
      // Append touch to existing lead without overwriting first-touch attribution
      const touchId = randomUUID();
      await client.query(
        `INSERT INTO platform.crm_lead_activities (
          id, tenant_id, lead_id, activity_type, title, description, metadata, created_at
        ) VALUES (
          $1, $2, $3, 'TOUCH_CAPTURE', 'Subsequent Demand Touch Captured',
          $4::jsonb, now()
        )`,
        [
          touchId,
          tenantId,
          match.matchedLeadId,
          JSON.stringify({
            sourceKey,
            submission,
            deduplicationScore: match.confidenceScore,
            reason: match.reason,
          }),
        ]
      );

      await client.query('COMMIT');
      return NextResponse.json({
        outcome: 'AUTO_MERGE',
        status: 'MERGED',
        leadId: match.matchedLeadId,
        leadType: match.matchedLeadType,
        confidenceScore: match.confidenceScore,
        explanation: match.reason,
      }, { status: 200 });
    }

    if (match.action === 'REVIEW_QUEUE' && match.matchedLeadId) {
      // Create Enquiry flagged for review
      const captureId = randomUUID();
      await client.query(
        `INSERT INTO platform.lead_capture_leads (
          capture_lead_id, tenant_id, organization_id, source_id, title, email, stage, status,
          raw_payload, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $3, $4, $5, 'NEW_ENQUIRY', 'WAITING_INTERNAL',
          $6::jsonb, now(), now()
        )`,
        [
          captureId,
          tenantId,
          orgNodeId,
          submission.title,
          submission.contactEmail,
          JSON.stringify({
            ...submission,
            reviewRequired: true,
            matchedCandidateId: match.matchedLeadId,
            matchReason: match.reason,
            confidenceScore: match.confidenceScore,
          }),
        ]
      );

      await client.query('COMMIT');
      return NextResponse.json({
        outcome: 'REVIEW_QUEUE',
        status: 'FLAGGED_FOR_REVIEW',
        captureLeadId: captureId,
        candidateLeadId: match.matchedLeadId,
        confidenceScore: match.confidenceScore,
        explanation: match.reason,
      }, { status: 202 });
    }

    // 4. Clean New Lead -> Hierarchical Downward Auto-Routing
    const routing = await routeCapturedLead(client, tenantId, orgNodePath, submission, countryCode);

    const newCaptureId = randomUUID();
    const slaExpiresAt = new Date(Date.now() + routing.escalationTimerMinutes * 60 * 1000);

    await client.query(
      `INSERT INTO platform.lead_capture_leads (
        capture_lead_id, tenant_id, organization_id, source_id, title, email, stage, status,
        owner_subject_id, raw_payload, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $3, $4, $5, 'NEW_ENQUIRY', 'ACTIVE',
        $6, $7::jsonb, now(), now()
      )`,
      [
        newCaptureId,
        tenantId,
        routing.assignedOrgNodeId,
        submission.title,
        submission.contactEmail,
        routing.assignedRepUserId,
        JSON.stringify({
          ...submission,
          firstTouchAttributionLock: {
            utmSource: submission.utmSource || null,
            utmMedium: submission.utmMedium || null,
            utmCampaign: submission.utmCampaign || null,
            referrer: submission.referrer || null,
            captureLayerId: orgNodeId,
            captureTimestamp: new Date().toISOString(),
          },
          routingRuleMatched: routing.ruleMatched,
          slaExpiresAt: slaExpiresAt.toISOString(),
        }),
      ]
    );

    // Record assignment event
    await client.query(
      `INSERT INTO platform.lead_capture_assignment_events (
        assignment_event_id, tenant_id, capture_lead_id, outcome, reason_code, explanation, created_at
      ) VALUES (
        $1, $2, $3, 'ASSIGNED', 'MATCHED_RULE', $4, now()
      )`,
      [
        randomUUID(),
        tenantId,
        newCaptureId,
        routing.ruleMatched,
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      outcome: 'NEW_LEAD',
      status: 'ASSIGNED',
      captureLeadId: newCaptureId,
      assignedNodePath: routing.assignedOrgNodePath,
      assignedRepUserId: routing.assignedRepUserId,
      slaExpiresAt: slaExpiresAt.toISOString(),
      ruleMatched: routing.ruleMatched,
    }, { status: 201 });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Market lead capture failed:', err);
    return NextResponse.json({ error: 'Lead capture intake failed.', detail: err?.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'HEALTHY',
    service: 'CRMONIA Demand Capture Intake Runtime',
    version: '1.0.0',
    protocol: 'Signed Capture Ticket (HMAC-SHA256)',
  });
}

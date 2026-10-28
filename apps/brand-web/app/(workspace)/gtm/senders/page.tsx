import React from 'react';
import SendersClient from './SendersClient';
import { dbPool } from '../../../../lib/brand-context';
import { getServerSession } from '../../../../lib/auth/server-session';
import type {
  SenderDomainRow,
  MailboxPoolRow,
  DispatchQueueStats,
  RecentDispatchRow,
} from './types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SendersPage() {
  const session = await getServerSession();
  if (!session) {
    return <div>Unauthorized</div>;
  }

  let domains: SenderDomainRow[] = [];
  let mailboxes: MailboxPoolRow[] = [];
  let stats: DispatchQueueStats = {
    due_now: 0,
    scheduled_future: 0,
    completed_count: 0,
    bounced_count: 0,
    responded_count: 0,
  };
  let dispatches: RecentDispatchRow[] = [];

  const client = await dbPool.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [session.tenantId]);
    await client.query(`SELECT set_config('app.current_org_path', $1, true)`, [session.orgPath]);

    const dRes = await client.query(
      `SELECT d.id, d.domain, d.provider, d.dns_verification_records, d.verification_status,
              d.reputation_score, d.status, d.created_at,
              o.name as owner_node_name, o.code as owner_node_code,
              (SELECT count(*) FROM gtm.mailbox_pools m WHERE m.domain_id = d.id) as mailbox_count
         FROM gtm.sender_domains d
         JOIN platform.org_nodes o ON o.id = d.owner_node_id
        ORDER BY d.created_at DESC`
    ).catch(() => ({ rows: [] }));
    domains = dRes.rows;

    const mRes = await client.query(
      `SELECT m.id, m.domain_id, m.mailbox_address, m.sender_name, m.warmup_stage,
              m.daily_send_limit, m.hourly_send_limit, m.sent_today_count, m.sent_hour_count,
              m.last_sent_at, m.bounce_count, m.spam_complaint_count, m.status,
              d.domain, d.provider,
              o.name as owner_node_name, o.code as owner_node_code
         FROM gtm.mailbox_pools m
         JOIN gtm.sender_domains d ON d.id = m.domain_id
         JOIN platform.org_nodes o ON o.id = m.owner_node_id
        ORDER BY m.sent_today_count ASC, m.created_at DESC`
    ).catch(() => ({ rows: [] }));
    mailboxes = mRes.rows;

    const sRes = await client.query(
      `SELECT count(*) FILTER (WHERE status = 'ACTIVE' AND next_touch_due_at <= now()) as due_now,
              count(*) FILTER (WHERE status = 'ACTIVE' AND next_touch_due_at > now()) as scheduled_future,
              count(*) FILTER (WHERE status = 'COMPLETED') as completed_count,
              count(*) FILTER (WHERE status = 'BOUNCED') as bounced_count,
              count(*) FILTER (WHERE status = 'RESPONDED') as responded_count
         FROM gtm.playbook_enrollments
        WHERE tenant_id = $1
          AND org_node_path <@ $2::ltree`,
      [session.tenantId, session.orgPath]
    ).catch(() => ({ rows: [{ due_now: 0, scheduled_future: 0, completed_count: 0, bounced_count: 0, responded_count: 0 }] }));
    stats = sRes.rows[0];

    const dispRes = await client.query(
      `SELECT d.id, d.recipient_email, d.subject, d.channel, d.dispatch_status,
              d.dispatched_at, m.mailbox_address, m.sender_name
         FROM gtm.touch_dispatches d
         LEFT JOIN gtm.mailbox_pools m ON m.id = d.mailbox_id
        WHERE d.tenant_id = $1
        ORDER BY d.created_at DESC
        LIMIT 50`,
      [session.tenantId]
    ).catch(() => ({ rows: [] }));
    dispatches = dispRes.rows;
  } finally {
    client.release();
  }

  return (
    <SendersClient
      initialDomains={domains}
      initialMailboxes={mailboxes}
      initialStats={stats}
      initialDispatches={dispatches}
    />
  );
}

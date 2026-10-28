import { NextResponse } from 'next/server';
import { dbPool } from '../../../../lib/brand-context';
import { getServerSession } from '../../../../lib/auth/server-session';
import { addMailboxToPool } from '../../../../lib/sender-custody-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = await dbPool.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [session.tenantId]);
    await client.query(`SELECT set_config('app.current_org_path', $1, true)`, [session.orgPath]);

    const mailboxes = await client.query(
      `SELECT m.id, m.domain_id, m.mailbox_address, m.sender_name, m.warmup_stage,
              m.daily_send_limit, m.hourly_send_limit, m.sent_today_count, m.sent_hour_count,
              m.last_sent_at, m.bounce_count, m.spam_complaint_count, m.status,
              m.lease_expires_at,
              d.domain, d.provider,
              o.name as owner_node_name, o.code as owner_node_code
         FROM gtm.mailbox_pools m
         JOIN gtm.sender_domains d ON d.id = m.domain_id
         JOIN platform.org_nodes o ON o.id = m.owner_node_id
        ORDER BY m.sent_today_count ASC, m.created_at DESC`
    );

    return NextResponse.json({ mailboxes: mailboxes.rows });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to load mailboxes', detail: err?.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!body.domainId || !body.mailboxAddress || !body.senderName) {
    return NextResponse.json({ error: 'domainId, mailboxAddress, and senderName are required' }, { status: 400 });
  }

  try {
    const mailbox = await addMailboxToPool(
      session,
      body.domainId,
      body.mailboxAddress,
      body.senderName,
      body.dailySendLimit || 40,
      body.hourlySendLimit || 8
    );
    return NextResponse.json({ mailbox }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to add mailbox to pool', detail: err?.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { dbPool } from '../../../../lib/brand-context';
import { getServerSession } from '../../../../lib/auth/server-session';
import { processDueTouches } from '../../../../lib/outbound-dispatcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = await dbPool.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [session.tenantId]);
    await client.query(`SELECT set_config('app.current_org_path', $1, true)`, [session.orgPath]);

    const queueStats = await client.query(
      `SELECT count(*) FILTER (WHERE status = 'ACTIVE' AND next_touch_due_at <= now()) as due_now,
              count(*) FILTER (WHERE status = 'ACTIVE' AND next_touch_due_at > now()) as scheduled_future,
              count(*) FILTER (WHERE status = 'COMPLETED') as completed_count,
              count(*) FILTER (WHERE status = 'BOUNCED') as bounced_count,
              count(*) FILTER (WHERE status = 'RESPONDED') as responded_count
         FROM gtm.playbook_enrollments
        WHERE tenant_id = $1
          AND org_node_path <@ $2::ltree`,
      [session.tenantId, session.orgPath]
    );

    const recentDispatches = await client.query(
      `SELECT d.id, d.recipient_email, d.subject, d.channel, d.dispatch_status,
              d.dispatched_at, m.mailbox_address, m.sender_name
         FROM gtm.touch_dispatches d
         LEFT JOIN gtm.mailbox_pools m ON m.id = d.mailbox_id
        WHERE d.tenant_id = $1
        ORDER BY d.created_at DESC
        LIMIT 50`,
      [session.tenantId]
    );

    return NextResponse.json({
      stats: queueStats.rows[0],
      recentDispatches: recentDispatches.rows,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to load dispatch telemetry', detail: err?.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const results = await processDueTouches(session.tenantId, 25);
    return NextResponse.json({
      processedCount: results.length,
      sentCount: results.filter((r) => r.status === 'SENT').length,
      throttledCount: results.filter((r) => r.status === 'THROTTLED').length,
      suppressedCount: results.filter((r) => r.status === 'SUPPRESSED').length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Outbound dispatch execution failed', detail: err?.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { dbPool } from '../../../../lib/brand-context';
import { getServerSession } from '../../../../lib/auth/server-session';
import { registerSenderDomain } from '../../../../lib/sender-custody-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = await dbPool.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [session.tenantId]);
    await client.query(`SELECT set_config('app.current_org_path', $1, true)`, [session.orgPath]);

    const domains = await client.query(
      `SELECT d.id, d.domain, d.provider, d.dns_verification_records, d.verification_status,
              d.reputation_score, d.status, d.created_at,
              o.name as owner_node_name, o.code as owner_node_code,
              (SELECT count(*) FROM gtm.mailbox_pools m WHERE m.domain_id = d.id) as mailbox_count
         FROM gtm.sender_domains d
         JOIN platform.org_nodes o ON o.id = d.owner_node_id
        ORDER BY d.created_at DESC`
    );

    return NextResponse.json({ domains: domains.rows });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to load domains', detail: err?.message }, { status: 500 });
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

  if (!body.domain || !body.provider) {
    return NextResponse.json({ error: 'domain and provider are required' }, { status: 400 });
  }

  try {
    const domain = await registerSenderDomain(session, {
      domain: body.domain,
      provider: body.provider,
      countryCode: body.countryCode,
      apiKey: body.apiKey,
    });
    return NextResponse.json({ domain }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to register domain', detail: err?.message }, { status: 500 });
  }
}

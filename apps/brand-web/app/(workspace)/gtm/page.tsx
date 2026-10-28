import Link from 'next/link';
import React from 'react';
import { dbPool } from '../../../lib/brand-context';
import { getServerSession } from '../../../lib/auth/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PlaybookRow {
  id: string;
  name: string;
  slug: string;
  playbook_type: string;
  status: string;
  owner_node_name: string;
  owner_node_code: string;
  owner_node_path: string;
  variant_count: number;
  enrollment_count: number;
  created_at: string;
}

export default async function GtmPage() {
  const session = await getServerSession();
  if (!session) {
    return <div>Unauthorized</div>;
  }

  let masterTemplates: PlaybookRow[] = [];
  let downlineInstances: PlaybookRow[] = [];

  const client = await dbPool.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [session.tenantId]);
    await client.query(`SELECT set_config('app.current_org_path', $1, true)`, [session.orgPath]);

    const res = await client.query(
      `SELECT p.id, p.name, p.slug, p.playbook_type, p.status, p.created_at,
              o.name as owner_node_name, o.code as owner_node_code, p.owner_node_path::text,
              (SELECT count(*) FROM gtm.playbook_step_variants v WHERE v.playbook_id = p.id) as variant_count,
              (SELECT count(*) FROM gtm.playbook_enrollments e WHERE e.playbook_id = p.id) as enrollment_count
         FROM gtm.playbooks p
         JOIN platform.org_nodes o ON o.id = p.owner_node_id
        WHERE p.tenant_id = $1
          AND (p.owner_node_path <@ $2::ltree OR p.owner_node_path @> $2::ltree)
        ORDER BY p.created_at DESC`
    ).catch(() => ({ rows: [] }));

    const rows: PlaybookRow[] = res.rows;
    masterTemplates = rows.filter((r) => r.playbook_type === 'MASTER_TEMPLATE');
    downlineInstances = rows.filter((r) => r.playbook_type !== 'MASTER_TEMPLATE');
  } finally {
    client.release();
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header with Quick CTAs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            Hierarchical GTM Playbooks
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4, margin: '4px 0 0' }}>
            Federated outbound campaigns, autonomous dual-brain copywriting, and downline subtree execution.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href="/gtm/senders"
            style={{
              padding: '8px 14px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: '#334155',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            📬 Senders & Mailboxes
          </Link>
          <Link
            href="/gtm/analytics"
            style={{
              padding: '8px 14px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: '#334155',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            📊 Executive Cockpit
          </Link>
          <Link
            href="/gtm/playbooks/new"
            style={{
              padding: '8px 16px',
              background: '#4f46e5',
              color: '#ffffff',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            + New Master Playbook
          </Link>
        </div>
      </div>

      {/* Section 1: Master Corporate Templates */}
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
          Master Corporate Templates ({masterTemplates.length})
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {masterTemplates.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#64748b' }}>
              No master playbook templates defined yet. Click &quot;+ New Master Playbook&quot; to author your enterprise&apos;s first governed outbound campaign.
            </div>
          ) : (
            masterTemplates.map((pb) => (
              <div
                key={pb.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 20,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{pb.name}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600, background: '#e0e7ff', color: '#4338ca' }}>
                    {pb.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Owner: <strong>{pb.owner_node_name} ({pb.owner_node_code})</strong> • Path: <code>{pb.owner_node_path}</code>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#475569', borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                  <span>🔀 {pb.variant_count} A/B Variants</span>
                  <span>👥 {pb.enrollment_count} Prospects Enrolled</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <Link
                    href={`/gtm/playbooks/${pb.id}`}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '8px 12px',
                      background: '#4f46e5',
                      color: '#fff',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Open DAG Builder
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Section 2: Activated Downline Playbooks */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
          Downline Activated Instances ({downlineInstances.length})
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {downlineInstances.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#64748b' }}>
              No downline entities have activated playbooks yet. Downline branches can 1-click clone and localize master templates.
            </div>
          ) : (
            downlineInstances.map((pb) => (
              <div
                key={pb.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 20,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{pb.name}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#334155' }}>
                    {pb.playbook_type}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Branch: <strong>{pb.owner_node_name} ({pb.owner_node_code})</strong>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#475569', borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                  <span>👥 {pb.enrollment_count} Active Enrollments</span>
                  <span>⚡ 15m Rep SLA</span>
                </div>
                <Link
                  href={`/gtm/playbooks/${pb.id}`}
                  style={{
                    textAlign: 'center',
                    padding: '8px 12px',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    color: '#1e293b',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Inspect Branch DAG
                </Link>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

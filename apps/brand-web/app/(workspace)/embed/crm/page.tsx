'use client';

import { useState, useEffect } from 'react';
import type { BrandLeadSummary } from '../../../../lib/brand-leads';
import type { CrmStageRow } from '@expadio/crm';

export default function EmbeddedCrmExtensionPage() {
  const [threadEmail, setThreadEmail] = useState<string>('');
  const [threadSubject, setThreadSubject] = useState<string>('');
  const [deal, setDeal] = useState<BrandLeadSummary | null>(null);
  const [stages, setStages] = useState<CrmStageRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Notify host extension that frame is ready
    window.parent.postMessage({ crmonia: 'ready', expadio: 'ready', pii: 'ready' }, '*');

    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return;
      const msgType = e.data.crmonia || e.data.expadio || e.data.pii;
      if (msgType === 'init' || msgType === 'threadContext') {
        const email = typeof e.data.email === 'string' ? e.data.email.trim() : '';
        const subject = typeof e.data.subject === 'string' ? e.data.subject.trim() : '';
        if (email) {
          setThreadEmail(email);
          setThreadSubject(subject);
          lookupDeal(email);
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  async function lookupDeal(email: string) {
    setIsLoading(true);
    setNotice(null);
    try {
      // 1. Fetch pipelines & stages
      const pipeRes = await fetch('/api/crm/pipelines');
      if (pipeRes.ok) {
        const pipeData = await pipeRes.json();
        if (pipeData.stages) setStages(pipeData.stages);
      }

      // 2. Lookup lead/deal by contact email
      const leadsRes = await fetch(`/api/leads`);
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        const found = (leadsData.leads as BrandLeadSummary[])?.find(
          (l) => l.contactEmail?.toLowerCase() === email.toLowerCase(),
        );
        setDeal(found ?? null);
      }
    } catch (err) {
      console.warn('Failed to lookup deal:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateFromThread() {
    if (!threadEmail) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: threadSubject || `Inquiry from ${threadEmail}`,
          contactEmail: threadEmail,
          source: 'GMAIL_EXTENSION',
          stage: 'NEW',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDeal(data.lead);
        setNotice('Deal created from Gmail thread!');
      }
    } catch (err) {
      setNotice('Failed to create deal.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleStageChange(targetStageId: string) {
    if (!deal) return;
    try {
      const res = await fetch(`/api/crm/deals/${deal.leadId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error || 'Stage change blocked by required fields barrier.');
        return;
      }
      setNotice('Stage updated successfully!');
      lookupDeal(threadEmail);
    } catch (err) {
      setNotice('Failed to move stage.');
    }
  }

  return (
    <div
      style={{
        padding: 16,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#ffffff',
        minHeight: '100vh',
        boxSizing: 'border-box',
        color: '#1e293b',
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 12,
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <strong style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            EXPADIO CRM
          </strong>
        </div>
        <span
          style={{
            fontSize: 10,
            background: '#e0f2fe',
            color: '#0369a1',
            padding: '2px 6px',
            borderRadius: 10,
            fontWeight: 600,
          }}
        >
          Gmail Live
        </span>
      </div>

      {notice ? (
        <div
          style={{
            padding: '8px 10px',
            marginBottom: 12,
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 4,
            fontSize: 12,
            color: '#334155',
          }}
        >
          {notice}
        </div>
      ) : null}

      {/* Thread Context */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          padding: 12,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
          Active Thread
        </span>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
          {threadEmail || 'Waiting for active thread…'}
        </div>
        {threadSubject ? (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Subject: {threadSubject}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: '#64748b' }}>
          Searching for deal...
        </div>
      ) : deal ? (
        /* Deal Exists Card */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <strong style={{ fontSize: 14, color: '#0f172a' }}>
                {deal.contactName ?? deal.title}
              </strong>
              {deal.amountMinorUnits ? (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                  ${(deal.amountMinorUnits / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                </span>
              ) : null}
            </div>

            {deal.accountName ? (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                🏢 {deal.accountName}
              </div>
            ) : null}

            {/* Stage Selector */}
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
                PIPELINE STAGE
              </label>
              <select
                value={deal.stageId ?? ''}
                onChange={(e) => handleStageChange(e.target.value)}
                style={{
                  width: '100%',
                  height: 32,
                  padding: '0 8px',
                  borderRadius: 4,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {stages.map((stg) => (
                  <option key={stg.stage_id} value={stg.stage_id}>
                    {stg.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <a
              href={`/leads?leadId=${deal.leadId}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 32,
                borderRadius: 4,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Open in Expadio ↗
            </a>
            <button
              type="button"
              onClick={() => {
                window.parent.postMessage({
                  expadio: 'compose',
                  to: deal.contactEmail,
                  subject: `Re: ${deal.title}`,
                }, '*');
              }}
              style={{
                height: 32,
                borderRadius: 4,
                border: 'none',
                background: '#3b82f6',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reply via Gmail
            </button>
          </div>
        </div>
      ) : threadEmail ? (
        /* No Deal Found - Offer 1-click Creation */
        <div
          style={{
            textAlign: 'center',
            padding: '24px 16px',
            border: '1px dashed #cbd5e1',
            borderRadius: 6,
            background: '#f8fafc',
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>📬</div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#334155' }}>
            No deal found for {threadEmail}
          </p>
          <p style={{ margin: '4px 0 16px', fontSize: 11, color: '#64748b' }}>
            Track this thread and contact directly in your Expadio pipeline.
          </p>
          <button
            type="button"
            onClick={handleCreateFromThread}
            disabled={isCreating}
            style={{
              height: 34,
              padding: '0 16px',
              borderRadius: 4,
              border: 'none',
              background: '#3b82f6',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isCreating ? 'Creating…' : '+ Create Deal from Thread'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

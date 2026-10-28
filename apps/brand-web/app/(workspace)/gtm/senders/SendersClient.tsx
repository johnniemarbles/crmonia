'use client';

import React, { useState } from 'react';
import styles from './SendersClient.module.css';
import type {
  SenderDomainRow,
  MailboxPoolRow,
  DispatchQueueStats,
  RecentDispatchRow,
} from './types';

interface SendersClientProps {
  initialDomains: SenderDomainRow[];
  initialMailboxes: MailboxPoolRow[];
  initialStats: DispatchQueueStats;
  initialDispatches: RecentDispatchRow[];
}

export default function SendersClient({
  initialDomains,
  initialMailboxes,
  initialStats,
  initialDispatches,
}: SendersClientProps) {
  const [domains, setDomains] = useState<SenderDomainRow[]>(initialDomains);
  const [mailboxes, setMailboxes] = useState<MailboxPoolRow[]>(initialMailboxes);
  const [stats, setStats] = useState<DispatchQueueStats>(initialStats);
  const [dispatches, setDispatches] = useState<RecentDispatchRow[]>(initialDispatches);

  const [activeTab, setActiveTab] = useState<'domain' | 'mailbox' | 'dispatcher'>('domain');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // New Domain Form State
  const [domainName, setDomainName] = useState('');
  const [provider, setProvider] = useState<'RESEND' | 'SENDGRID' | 'AWS_SES' | 'CUSTOM_SMTP'>('RESEND');
  const [countryCode, setCountryCode] = useState<'CA' | 'US' | 'GLOBAL'>('CA');

  // New Mailbox Form State
  const [selectedDomainId, setSelectedDomainId] = useState(domains[0]?.id || '');
  const [mailboxAddress, setMailboxAddress] = useState('');
  const [senderName, setSenderName] = useState('');
  const [dailyLimit, setDailyLimit] = useState(40);

  async function handleRegisterDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!domainName) return;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch('/workspace/v1/gtm/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainName, provider, countryCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register domain');

      setDomains([data.domain, ...domains]);
      setFeedback({ message: `Domain ${domainName} registered. Configure the DNS records below to verify.`, type: 'success' });
      setDomainName('');
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddMailbox(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDomainId || !mailboxAddress || !senderName) return;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch('/workspace/v1/gtm/mailboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainId: selectedDomainId,
          mailboxAddress,
          senderName,
          dailySendLimit: dailyLimit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add mailbox');

      setMailboxes([data.mailbox, ...mailboxes]);
      setFeedback({ message: `Mailbox ${mailboxAddress} added to rotational pool in WARMUP mode.`, type: 'success' });
      setMailboxAddress('');
      setSenderName('');
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTriggerDispatch() {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/workspace/v1/gtm/dispatch', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Dispatch run failed');

      setFeedback({
        message: `Dispatched ${data.sentCount} touches cleanly (${data.throttledCount} throttled, ${data.suppressedCount} suppressed).`,
        type: 'success',
      });

      // Refresh telemetry
      const getRes = await fetch('/workspace/v1/gtm/dispatch');
      if (getRes.ok) {
        const getData = await getRes.json();
        setStats(getData.stats);
        setDispatches(getData.recentDispatches);
      }
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      {/* LEFT PANEL: 50% Asset / Registry View */}
      <div className={styles.leftPanel}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Sender Custody & Mailbox Pools</h1>
            <p className={styles.subtitle}>
              BYOK/BYOC sender domains, rotational mailboxes, and automated rate limit governance.
            </p>
          </div>
        </div>

        {/* Sender Domains Table */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Connected Sender Domains ({domains.length})</span>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Provider</th>
                <th>Owner Node</th>
                <th>DNS Status</th>
                <th>Reputation</th>
              </tr>
            </thead>
            <tbody>
              {domains.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '24px' }}>
                    No sender domains connected yet. Connect a domain in the panel on the right.
                  </td>
                </tr>
              ) : (
                domains.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.domain}</td>
                    <td><span className={styles.pill} style={{ background: '#f1f5f9' }}>{d.provider}</span></td>
                    <td>{d.owner_node_code || d.owner_node_name || 'HQ'}</td>
                    <td>
                      <span className={`${styles.pill} ${d.verification_status === 'VERIFIED' ? styles.pillVerified : styles.pillPending}`}>
                        {d.verification_status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: d.reputation_score > 85 ? '#059669' : '#d97706' }}>
                        {d.reputation_score}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mailbox Rotation Pools Table */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Rotational Mailbox Inboxes ({mailboxes.length})</span>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Mailbox</th>
                <th>Sender Name</th>
                <th>Warmup State</th>
                <th>Today&apos;s Quota</th>
                <th>Bounces</th>
              </tr>
            </thead>
            <tbody>
              {mailboxes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '24px' }}>
                    No rotational mailboxes configured. Add a mailbox in the panel on the right.
                  </td>
                </tr>
              ) : (
                mailboxes.map((m) => {
                  const pct = Math.min(100, Math.round((m.sent_today_count / (m.daily_send_limit || 40)) * 100));
                  return (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 500 }}>{m.mailbox_address}</td>
                      <td>{m.sender_name}</td>
                      <td>
                        <span className={styles.pill} style={{ background: '#e0e7ff', color: '#4338ca' }}>
                          {m.warmup_stage}
                        </span>
                      </td>
                      <td style={{ minWidth: 120 }}>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {m.sent_today_count} / {m.daily_send_limit} sent
                        </div>
                        <div className={styles.meterBar}>
                          <div className={styles.meterFill} style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td>
                        <span style={{ color: m.bounce_count > 0 ? '#dc2626' : '#64748b', fontWeight: m.bounce_count > 0 ? 600 : 400 }}>
                          {m.bounce_count}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT PANEL: 50% Interactive Inspector & Configuration */}
      <div className={styles.rightPanel}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'domain' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('domain')}
          >
            + Connect Domain
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'mailbox' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('mailbox')}
          >
            + Add Mailbox
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'dispatcher' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('dispatcher')}
          >
            Queue & Dispatcher
          </button>
        </div>

        {feedback && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: 12,
              borderRadius: 8,
              fontSize: 13,
              backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
              color: feedback.type === 'success' ? '#166534' : '#991b1b',
              border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            }}
          >
            {feedback.message}
          </div>
        )}

        {/* Tab 1: Connect Domain */}
        {activeTab === 'domain' && (
          <form className={styles.formBody} onSubmit={handleRegisterDomain}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Domain Name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="outbound.punjabinsurance.ca"
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Sender Provider</label>
              <select
                className={styles.select}
                value={provider}
                onChange={(e) => setProvider(e.target.value as any)}
              >
                <option value="RESEND">Resend (API Key)</option>
                <option value="AWS_SES">AWS SES (SigV4 Reference)</option>
                <option value="SENDGRID">SendGrid</option>
                <option value="CUSTOM_SMTP">Custom Dedicated SMTP</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Residency Jurisdiction</label>
              <select
                className={styles.select}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value as any)}
              >
                <option value="CA">Canada (CA OpCo)</option>
                <option value="US">United States (US OpCo)</option>
                <option value="GLOBAL">Global Enterprise</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Required DNS Records Preview</label>
              <div className={styles.dnsBox}>
                TXT @ v=spf1 include:_spf.crmonia.com ~all<br />
                TXT crmonia._domainkey v=DKIM1; k=rsa; p=MIGf...<br />
                TXT _dmarc v=DMARC1; p=quarantine
              </div>
            </div>

            <button type="submit" className={styles.primaryBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Registering Domain...' : 'Connect Domain'}
            </button>
          </form>
        )}

        {/* Tab 2: Add Mailbox */}
        {activeTab === 'mailbox' && (
          <form className={styles.formBody} onSubmit={handleAddMailbox}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Sender Domain</label>
              <select
                className={styles.select}
                value={selectedDomainId}
                onChange={(e) => setSelectedDomainId(e.target.value)}
                required
              >
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>{d.domain} ({d.provider})</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Mailbox Address</label>
              <input
                className={styles.input}
                type="email"
                placeholder="sanjeev@outbound.punjabinsurance.ca"
                value={mailboxAddress}
                onChange={(e) => setMailboxAddress(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Sender Display Name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="Sanjeev Sood"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Daily Send Limit (Warmup Cap)</label>
              <input
                className={styles.input}
                type="number"
                min="10"
                max="200"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
              />
              <span style={{ fontSize: 11, color: '#64748b' }}>
                Parent enterprise policy cap will enforce automatically via deny-wins inheritance.
              </span>
            </div>

            <button type="submit" className={styles.primaryBtn} disabled={isSubmitting || domains.length === 0}>
              {isSubmitting ? 'Adding Mailbox...' : 'Add Mailbox to Rotation Pool'}
            </button>
          </form>
        )}

        {/* Tab 3: Dispatcher Health & Queue */}
        {activeTab === 'dispatcher' && (
          <div className={styles.formBody}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Touches Due Now</span>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{stats?.due_now || 0}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Scheduled Future</span>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{stats?.scheduled_future || 0}</div>
              </div>
            </div>

            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleTriggerDispatch}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing Dispatch Queue...' : 'Run Outbound Dispatch Batch Now'}
            </button>

            <div style={{ marginTop: 12 }}>
              <span className={styles.label}>Recent Outbound Touch Dispatches</span>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {dispatches.length === 0 ? (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>No touches dispatched yet.</span>
                ) : (
                  dispatches.map((d) => (
                    <div
                      key={d.id}
                      style={{
                        padding: 10,
                        border: '1px solid #f1f5f9',
                        borderRadius: 6,
                        background: '#fafafa',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span>{d.recipient_email}</span>
                        <span style={{ color: d.dispatch_status === 'SENT' ? '#059669' : '#dc2626' }}>
                          {d.dispatch_status}
                        </span>
                      </div>
                      <div style={{ color: '#64748b', marginTop: 2 }}>{d.subject}</div>
                      <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 4 }}>
                        From {d.mailbox_address || 'Mailbox'} • {d.dispatched_at ? new Date(d.dispatched_at).toLocaleTimeString() : 'Queued'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from './CockpitAndKanban.module.css';
import { CrmLeadDTO, CrmStage, CockpitRollupMetrics } from './types';

interface Props {
  initialMetrics: CockpitRollupMetrics;
  initialLeads: CrmLeadDTO[];
  currentOrgName: string;
  currentOrgPath: string;
}

const STAGES: { key: CrmStage; label: string; color: string }[] = [
  { key: 'NEW', label: 'New / Unworked', color: '#38bdf8' },
  { key: 'QUALIFIED', label: 'Qualified', color: '#a855f7' },
  { key: 'PROPOSAL', label: 'Proposal / Quote', color: '#eab308' },
  { key: 'WON', label: 'Won / Active', color: '#34d399' },
  { key: 'LOST', label: 'Lost / Recycled', color: '#ef4444' },
];

export function CockpitAndKanbanClient({
  initialMetrics,
  initialLeads,
  currentOrgName,
  currentOrgPath,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [metrics] = useState<CockpitRollupMetrics>(initialMetrics);
  const [leads, setLeads] = useState<CrmLeadDTO[]>(initialLeads);
  const [viewMode, setViewMode] = useState<'ROLLUP_DOWNWARD' | 'DIRECT_NODE_ONLY'>(
    'ROLLUP_DOWNWARD'
  );
  const [searchFilter, setSearchFilter] = useState('');

  const handleStageChange = async (leadId: string, newStage: CrmStage) => {
    // Optimistic UI update
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l))
    );

    startTransition(async () => {
      try {
        const res = await fetch(`/workspace/v1/crm/leads/${leadId}/stage`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: newStage }),
        });

        if (!res.ok) {
          throw new Error('Failed to update lead stage in PostgreSQL.');
        }
        router.refresh();
      } catch (err) {
        console.error('Stage transition rejected:', err);
        router.refresh();
      }
    });
  };

  const filteredLeads = leads.filter(
    (l) =>
      l.fullName.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (l.companyName && l.companyName.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  return (
    <div className={styles.shell}>
      {/* 1. TOP HEADER & SCOPE SWITCHER */}
      <header className={styles.headerBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className={styles.scopeSelector}>
            <span>🌐 Active Scope: <strong>{currentOrgName}</strong></span>
            <code style={{ fontSize: '0.75rem', color: '#38bdf8' }}>{currentOrgPath}</code>
          </div>

          <div className={styles.viewToggleGroup}>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${
                viewMode === 'ROLLUP_DOWNWARD' ? styles.viewToggleButtonActive : ''
              }`}
              onClick={() => setViewMode('ROLLUP_DOWNWARD')}
            >
              📊 Roll-Up All Downward Entities
            </button>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${
                viewMode === 'DIRECT_NODE_ONLY' ? styles.viewToggleButtonActive : ''
              }`}
              onClick={() => setViewMode('DIRECT_NODE_ONLY')}
            >
              📍 Direct Node Only
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input
            type="text"
            placeholder="Search leads or companies..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              backgroundColor: '#0f172a',
              color: '#fff',
              border: '1px solid #334155',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              width: '240px',
            }}
          />
          <button
            type="button"
            style={{
              backgroundColor: '#0284c7',
              color: '#fff',
              border: 'none',
              padding: '0.45rem 0.9rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + New Canonical Lead
          </button>
        </div>
      </header>

      {/* 2. EXECUTIVE ROLL-UP KPI STRIP */}
      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Active GTM Prospects</div>
          <div className={styles.kpiValue}>{metrics.activeGtmProspects.toLocaleString()}</div>
          <div className={styles.kpiSubtext}>Waterfall Enriched & Verified</div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Canonical CRM Pipeline</div>
          <div className={styles.kpiValue}>
            ${(metrics.totalPipelineValueCents / 100).toLocaleString()}
          </div>
          <div className={styles.kpiSubtext}>
            {metrics.canonicalCrmLeadsCount} Leads ({metrics.wonDealsCount} Won Deals)
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>SLA At-Risk / Breached</div>
          <div className={styles.kpiValue} style={{ color: metrics.slaAtRiskCount > 0 ? '#f87171' : '#34d399' }}>
            {metrics.slaAtRiskCount} Leads
          </div>
          <div className={styles.kpiSubtext}>Requires immediate rep follow-up</div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Sender Deliverability Health</div>
          <div className={styles.kpiValue}>{metrics.deliverabilityHealthPct}%</div>
          <div className={styles.kpiSubtext}>0 Mailbox Pools Circuit-Broken</div>
        </div>
      </section>

      {/* 3. KANBAN BOARD WORKBENCH (5 CANONICAL CRM STAGES) */}
      <main className={styles.kanbanWorkbench}>
        {STAGES.map((stage) => {
          const columnLeads = filteredLeads.filter((l) => l.stage === stage.key);
          const columnTotalCents = columnLeads.reduce(
            (acc, l) => acc + l.estimatedValueCents,
            0
          );

          return (
            <div key={stage.key} className={styles.kanbanColumn}>
              <div className={styles.kanbanColumnHeader}>
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: stage.color,
                      marginRight: '0.5rem',
                    }}
                  />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{stage.label}</span>
                  <span
                    style={{
                      marginLeft: '0.4rem',
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                      backgroundColor: '#1e293b',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '999px',
                    }}
                  >
                    {columnLeads.length}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  ${(columnTotalCents / 100).toLocaleString()}
                </span>
              </div>

              <div className={styles.kanbanCardsContainer}>
                {columnLeads.map((lead) => (
                  <div key={lead.id} className={styles.leadCard}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '0.35rem',
                      }}
                    >
                      <strong style={{ fontSize: '0.85rem', color: '#f8fafc' }}>
                        {lead.fullName}
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600 }}>
                        ${(lead.estimatedValueCents / 100).toLocaleString()}
                      </span>
                    </div>

                    {lead.companyName && (
                      <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                        🏢 {lead.companyName}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        className={
                          lead.source === 'outbound_gtm'
                            ? styles.tagOutbound
                            : styles.tagInbound
                        }
                      >
                        {lead.source === 'outbound_gtm' ? '⚡ Outbound GTM' : '📥 Inbound Capture'}
                      </span>

                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        📍 {lead.orgNodeName}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.5rem' }}>
                      {stage.key !== 'WON' && (
                        <button
                          type="button"
                          onClick={() => handleStageChange(lead.id, 'WON')}
                          style={{
                            fontSize: '0.65rem',
                            backgroundColor: 'rgba(52, 211, 153, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(52, 211, 153, 0.3)',
                            borderRadius: '4px',
                            padding: '0.15rem 0.4rem',
                            cursor: 'pointer',
                          }}
                        >
                          Mark Won
                        </button>
                      )}
                      {stage.key === 'NEW' && (
                        <button
                          type="button"
                          onClick={() => handleStageChange(lead.id, 'QUALIFIED')}
                          style={{
                            fontSize: '0.65rem',
                            backgroundColor: 'rgba(168, 85, 247, 0.15)',
                            color: '#c084fc',
                            border: '1px solid rgba(168, 85, 247, 0.3)',
                            borderRadius: '4px',
                            padding: '0.15rem 0.4rem',
                            cursor: 'pointer',
                          }}
                        >
                          Qualify &rarr;
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {columnLeads.length === 0 && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '1.5rem 0',
                      fontSize: '0.78rem',
                      color: '#475569',
                      border: '1px dashed #1e293b',
                      borderRadius: '6px',
                    }}
                  >
                    No leads in stage
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}

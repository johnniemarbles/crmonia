'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from './PlaybookBuilder.module.css';
import {
  MasterPlaybookInitialData,
  TemplateAstBlock,
  BlockLockType,
  ChallengerVariantDTO,
} from './types';
import { DownlineActivationDrawer } from './DownlineActivationDrawer';

interface Props {
  initialData: MasterPlaybookInitialData;
  currentUserId: string;
  currentUserRole:
    | 'MAIN_ADMIN'
    | 'COUNTRY_ADMIN'
    | 'COMPLIANCE_OFFICER'
    | 'BRANCH_MANAGER'
    | 'UNIT_ADVISOR';
}

export function PlaybookBuilderClient({
  initialData,
  currentUserId,
  currentUserRole,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [playbook, setPlaybook] = useState<MasterPlaybookInitialData>(initialData);
  const [activeTab, setActiveTab] = useState<
    'ICP_SIGNALS' | 'DAG_SEQUENCE' | 'GUARDRAIL_MATRIX' | 'DUAL_BRAIN'
  >('DAG_SEQUENCE');
  const [selectedNodeKey, setSelectedNodeKey] = useState<string>(
    initialData.dagNodes[0]?.nodeKey ?? ''
  );
  const [saveBanner, setSaveBanner] = useState<{
    type: 'SUCCESS' | 'ERROR';
    message: string;
  } | null>(null);
  const [isActivationDrawerOpen, setActivationDrawerOpen] = useState(false);

  const isAuthorRole = ['MAIN_ADMIN', 'COUNTRY_ADMIN', 'COMPLIANCE_OFFICER'].includes(
    currentUserRole
  );

  const selectedNode = playbook.dagNodes.find((n) => n.nodeKey === selectedNodeKey);

  // Prohibition C12: Block publishing if any AI-drafted template is unapproved
  const hasUnapprovedAiDrafts = playbook.dagNodes.some(
    (n) =>
      n.structuredTemplate?.isAiDrafted &&
      n.structuredTemplate?.complianceStatus !== 'APPROVED'
  );

  const handleBlockUpdate = (
    nodeKey: string,
    blockId: string,
    patch: Partial<TemplateAstBlock>
  ) => {
    setPlaybook((prev) => ({
      ...prev,
      dagNodes: prev.dagNodes.map((node) => {
        if (node.nodeKey !== nodeKey || !node.structuredTemplate) return node;
        return {
          ...node,
          structuredTemplate: {
            ...node.structuredTemplate,
            contentBlocks: node.structuredTemplate.contentBlocks.map((b) =>
              b.blockId === blockId ? { ...b, ...patch } : b
            ),
          },
        };
      }),
    }));
  };

  const handleApproveAiTemplate = (nodeKey: string) => {
    setPlaybook((prev) => ({
      ...prev,
      dagNodes: prev.dagNodes.map((node) => {
        if (node.nodeKey !== nodeKey || !node.structuredTemplate) return node;
        return {
          ...node,
          structuredTemplate: {
            ...node.structuredTemplate,
            complianceStatus: 'APPROVED',
            approvedByUserId: currentUserId,
          },
        };
      }),
    }));
  };

  const handleSavePlaybook = async (
    targetStatus: MasterPlaybookInitialData['status'] = playbook.status
  ) => {
    setSaveBanner(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/workspace/v1/gtm/playbooks/${playbook.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: playbook.title,
            description: playbook.description,
            status: targetStatus,
            allowedDownlineTiers: playbook.allowedDownlineTiers,
            templateLockMode: playbook.templateLockMode,
            maxDailySendsPerInbox: playbook.maxDailySendsPerInbox,
            bounceCircuitBreakerPct: playbook.bounceCircuitBreakerPct,
            icpRubric: playbook.icpRubric,
            triggerSignals: playbook.triggerSignals,
            tokenDefinitions: playbook.tokenDefinitions,
            dagNodes: playbook.dagNodes,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Validation failed while saving playbook.');
        }

        setPlaybook((prev) => ({
          ...prev,
          version: data.playbook.version,
          status: data.playbook.status,
          maxDailySendsPerInbox: data.playbook.max_daily_sends_per_inbox,
        }));
        setSaveBanner({
          type: 'SUCCESS',
          message: `Saved Master Playbook v${data.playbook.version} (${data.playbook.status}) to PostgreSQL.`,
        });
        router.refresh();
      } catch (err) {
        setSaveBanner({
          type: 'ERROR',
          message: err instanceof Error ? err.message : 'Failed to save playbook.',
        });
      }
    });
  };

  const handlePromoteVariant = async (challenger: ChallengerVariantDTO) => {
    setSaveBanner(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/workspace/v1/gtm/variants/${challenger.variantId}/promote`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              masterPlaybookId: playbook.id,
              dagNodeId: challenger.dagNodeId,
              promotionReason: `Promoted ${challenger.sourceOrgName} Variant ${challenger.variantLetter} (+${(
                challenger.replyRatePct - challenger.masterBaselineReplyPct
              ).toFixed(1)}% reply lift).`,
            }),
          }
        );

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Failed to promote variant.');
        }

        setSaveBanner({
          type: 'SUCCESS',
          message: `Promoted ${challenger.sourceOrgName} Variant ${challenger.variantLetter} to Master Playbook v${data.newMasterVersion}!`,
        });
        router.refresh();
      } catch (err) {
        setSaveBanner({
          type: 'ERROR',
          message: err instanceof Error ? err.message : 'Variant promotion failed.',
        });
      }
    });
  };

  const getBlockLockClass = (lock: BlockLockType) => {
    switch (lock) {
      case 'IMMUTABLE_LOCKED':
        return styles.astBlockImmutable;
      case 'TOKEN_SLOTS_ONLY':
        return styles.astBlockTokenOnly;
      case 'EDITABLE_WITH_APPROVAL':
        return styles.astBlockApproval;
      case 'FREE_LOCAL_EDIT':
        return styles.astBlockFreeEdit;
    }
  };

  return (
    <div className={styles.workspaceShell}>
      {/* 1. TOP HIERARCHY & GOVERNANCE HEADER */}
      <header className={styles.topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className={styles.scopeBreadcrumb}>
            <span>🏢 {playbook.ownerOrgName}</span>
            <span style={{ color: '#64748b' }}>({playbook.ownerTier})</span>
            <span style={{ color: '#475569' }}>•</span>
            <code style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
              {playbook.ownerOrgPath}
            </code>
          </div>
          <span className={styles.residencyBadge}>
            🛡️ Residency: {playbook.countryCode === 'CA' ? '🇨🇦 ca-central-1' : '🇺🇸 us-east-1'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            v{playbook.version} • Status: <strong>{playbook.status}</strong>
          </span>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setActivationDrawerOpen(true)}
          >
            ⚡ Simulate Downline 1-Click Clone
          </button>

          {isAuthorRole && (
            <>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={isPending}
                onClick={() => handleSavePlaybook('DRAFT')}
              >
                {isPending ? 'Saving...' : 'Save Draft'}
              </button>

              <button
                type="button"
                className={styles.primaryButton}
                disabled={isPending || hasUnapprovedAiDrafts}
                title={
                  hasUnapprovedAiDrafts
                    ? 'Prohibition C12: All AI-drafted templates must be human-approved before publishing.'
                    : 'Publish Playbook to all eligible downward tiers'
                }
                onClick={() => handleSavePlaybook('PUBLISHED_DOWNLINE')}
              >
                🚀 Publish to Downward Entities
              </button>
            </>
          )}
        </div>
      </header>

      {/* STATUS FEEDBACK BANNER */}
      {saveBanner && (
        <div
          style={{
            padding: '0.65rem 1.5rem',
            backgroundColor:
              saveBanner.type === 'SUCCESS'
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(239, 68, 68, 0.2)',
            borderBottom: '1px solid #334155',
            color: saveBanner.type === 'SUCCESS' ? '#34d399' : '#f87171',
            fontSize: '0.85rem',
          }}
        >
          {saveBanner.message}
        </div>
      )}

      {/* 2. PLAYBOOK BUILDER NAVIGATION TABS */}
      <nav className={styles.tabStrip}>
        <button
          type="button"
          className={`${styles.tabButton} ${
            activeTab === 'ICP_SIGNALS' ? styles.tabButtonActive : ''
          }`}
          onClick={() => setActiveTab('ICP_SIGNALS')}
        >
          1. ICP Rubric & Waterfall Signals
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${
            activeTab === 'DAG_SEQUENCE' ? styles.tabButtonActive : ''
          }`}
          onClick={() => setActiveTab('DAG_SEQUENCE')}
        >
          2. Multi-Channel DAG & AST Block Locks ({playbook.dagNodes.length} Steps)
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${
            activeTab === 'GUARDRAIL_MATRIX' ? styles.tabButtonActive : ''
          }`}
          onClick={() => setActiveTab('GUARDRAIL_MATRIX')}
        >
          3. Downline Token Contract & Guardrails ({playbook.tokenDefinitions.length} Tokens)
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${
            activeTab === 'DUAL_BRAIN' ? styles.tabButtonActive : ''
          }`}
          onClick={() => setActiveTab('DUAL_BRAIN')}
        >
          4. Dual-Brain A/Z Telemetry ({playbook.challengerVariants.length} Branch Wins)
        </button>
      </nav>

      {/* TAB 2: DAG SEQUENCE & AST LOCK */}
      {activeTab === 'DAG_SEQUENCE' && (
        <div className={styles.workbenchSplit}>
          {/* LEFT: CANVAS */}
          <div className={styles.dagCanvasPane}>
            <div
              style={{
                fontSize: '0.78rem',
                color: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                padding: '0.45rem 0.9rem',
                borderRadius: '999px',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              ⚡ Trigger: ICP Fit Score &ge; {playbook.icpRubric.minFitScoreFloor} + Territory Match
            </div>

            {playbook.dagNodes.map((node, index) => (
              <React.Fragment key={node.nodeKey}>
                <div className={styles.dagConnectorLine} />
                <div
                  className={`${styles.dagNodeCard} ${
                    selectedNodeKey === node.nodeKey ? styles.dagNodeCardSelected : ''
                  }`}
                  onClick={() => setSelectedNodeKey(node.nodeKey)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.35rem',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      Step {index + 1}: {node.nodeType.replace(/_/g, ' ')}
                    </span>
                    <code style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      {node.nodeKey}
                    </code>
                  </div>

                  {node.structuredTemplate && (
                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                      <div>
                        Template: <strong>{node.structuredTemplate.name}</strong>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          marginTop: '0.4rem',
                          fontSize: '0.72rem',
                        }}
                      >
                        <span>
                          {node.structuredTemplate.contentBlocks.length} AST Blocks
                        </span>
                        <span>•</span>
                        <span
                          style={{
                            color:
                              node.structuredTemplate.complianceStatus === 'APPROVED'
                                ? '#34d399'
                                : '#fbbf24',
                          }}
                        >
                          {node.structuredTemplate.complianceStatus}
                        </span>
                      </div>
                    </div>
                  )}

                  {node.waitDurationHours > 0 && (
                    <div
                      style={{
                        marginTop: '0.5rem',
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                      }}
                    >
                      ⏱️ Wait {node.waitDurationHours}h before evaluating next branch
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))}

            <div className={styles.dagConnectorLine} />
            <div
              style={{
                fontSize: '0.78rem',
                color: '#34d399',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                padding: '0.45rem 0.9rem',
                borderRadius: '999px',
                border: '1px solid rgba(16, 185, 129, 0.35)',
              }}
            >
              🎯 On Positive Reply / Booking &rarr; 1-Click Convert to `platform.crm_leads` (NEW)
            </div>
          </div>

          {/* RIGHT: INSPECTOR */}
          <div className={styles.inspectorPane}>
            {selectedNode && selectedNode.structuredTemplate ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                      Inspecting: {selectedNode.structuredTemplate.name}
                    </h2>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                      Configure individual AST Block Locks for downward Countries, Regions, Branches & Units.
                    </p>
                  </div>

                  {selectedNode.structuredTemplate.isAiDrafted &&
                    selectedNode.structuredTemplate.complianceStatus !== 'APPROVED' && (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => handleApproveAiTemplate(selectedNode.nodeKey)}
                      >
                        ✅ Human-Approve AI Draft (C12 Gate)
                      </button>
                    )}
                </div>

                {selectedNode.structuredTemplate.channel === 'EMAIL' && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '0.4rem',
                      }}
                    >
                      Subject Line (Spintax & Localization Tokens Supported)
                    </label>
                    <input
                      type="text"
                      className={styles.textareaField}
                      style={{ minHeight: 'auto', height: '2.4rem' }}
                      disabled={!isAuthorRole}
                      value={selectedNode.structuredTemplate.subjectSpintax ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPlaybook((prev) => ({
                          ...prev,
                          dagNodes: prev.dagNodes.map((n) =>
                            n.nodeKey === selectedNode.nodeKey && n.structuredTemplate
                              ? {
                                  ...n,
                                  structuredTemplate: {
                                    ...n.structuredTemplate,
                                    subjectSpintax: val,
                                  },
                                }
                              : n
                          ),
                        }));
                      }}
                    />
                  </div>
                )}

                {selectedNode.structuredTemplate.contentBlocks.map((block, idx) => {
                  const isComplianceFooter = block.type === 'COMPLIANCE_FOOTER';
                  return (
                    <div
                      key={block.blockId}
                      className={`${styles.astBlockCard} ${getBlockLockClass(block.lock)}`}
                    >
                      <div className={styles.blockHeader}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            Block {idx + 1}: {block.type.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Downline Lock Policy:
                          </span>
                          <select
                            disabled={!isAuthorRole || isComplianceFooter}
                            value={block.lock}
                            onChange={(e) =>
                              handleBlockUpdate(selectedNode.nodeKey, block.blockId, {
                                lock: e.target.value as BlockLockType,
                              })
                            }
                            style={{
                              backgroundColor: '#0f172a',
                              color: '#f8fafc',
                              border: '1px solid #334155',
                              borderRadius: '4px',
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.78rem',
                            }}
                          >
                            <option value="IMMUTABLE_LOCKED">
                              🔴 IMMUTABLE_LOCKED (Cannot Edit/Delete)
                            </option>
                            <option value="TOKEN_SLOTS_ONLY">
                              🟡 TOKEN_SLOTS_ONLY (Fill {'{{tokens}}'} Only)
                            </option>
                            <option value="EDITABLE_WITH_APPROVAL">
                              🟠 EDITABLE_WITH_APPROVAL (CCO Gate)
                            </option>
                            <option value="FREE_LOCAL_EDIT">
                              🟢 FREE_LOCAL_EDIT (Branch Can Customize)
                            </option>
                          </select>
                        </div>
                      </div>

                      <textarea
                        className={styles.textareaField}
                        disabled={!isAuthorRole}
                        value={block.content}
                        onChange={(e) =>
                          handleBlockUpdate(selectedNode.nodeKey, block.blockId, {
                            content: e.target.value,
                          })
                        }
                      />
                    </div>
                  );
                })}
              </>
            ) : (
              <p style={{ color: '#94a3b8' }}>
                Select a sequence step on the left canvas to inspect its Block-Level AST & Governance locks.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DOWNLINE TOKEN CONTRACT & GUARDRAILS */}
      {activeTab === 'GUARDRAIL_MATRIX' && (
        <div style={{ padding: '2rem', maxWidth: '1100px' }}>
          <h2 style={{ marginTop: 0 }}>
            Deny-Wins Operational Guardrails (`platform.governance_policies`)
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Downward entities (Regions, Branches, Units) can narrow these limits for their local teams, but PostgreSQL triggers and RLS prevent them from exceeding parent ceilings.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1.25rem',
              marginBottom: '2rem',
            }}
          >
            <div className={styles.astBlockCard}>
              <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block' }}>
                Max Daily Outbound Sends per Connected Inbox (`MIN_CEILING`)
              </label>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Parent Hard Ceiling: <strong>{playbook.parentHardCeilingDailySends} / day</strong>
              </p>
              <input
                type="number"
                min={1}
                max={playbook.parentHardCeilingDailySends}
                value={playbook.maxDailySendsPerInbox}
                onChange={(e) =>
                  setPlaybook((prev) => ({
                    ...prev,
                    maxDailySendsPerInbox: Math.min(
                      playbook.parentHardCeilingDailySends,
                      Number(e.target.value)
                    ),
                  }))
                }
                style={{
                  backgroundColor: '#0f172a',
                  color: '#fff',
                  border: '1px solid #334155',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  width: '120px',
                }}
              />
            </div>

            <div className={styles.astBlockCard}>
              <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block' }}>
                Domain Bounce Circuit Breaker (`MIN_CEILING`)
              </label>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Auto-pauses branch mailbox pool if rolling 24h bounce rate hits threshold.
              </p>
              <input
                type="number"
                step="0.1"
                min={0.5}
                max={3.0}
                value={playbook.bounceCircuitBreakerPct}
                onChange={(e) =>
                  setPlaybook((prev) => ({
                    ...prev,
                    bounceCircuitBreakerPct: Math.min(3.0, Number(e.target.value)),
                  }))
                }
                style={{
                  backgroundColor: '#0f172a',
                  color: '#fff',
                  border: '1px solid #334155',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  width: '120px',
                }}
              />{' '}
              %
            </div>
          </div>

          <h3>Required Downline Localization Tokens (`gtm.playbook_token_definitions`)</h3>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
              backgroundColor: '#111827',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#1e293b', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Token Variable</th>
                <th style={{ padding: '0.75rem 1rem' }}>Label</th>
                <th style={{ padding: '0.75rem 1rem' }}>Resolution Source</th>
                <th style={{ padding: '0.75rem 1rem' }}>Fallback Default</th>
              </tr>
            </thead>
            <tbody>
              {playbook.tokenDefinitions.map((tok) => (
                <tr key={tok.tokenKey} style={{ borderTop: '1px solid #1e293b' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <code style={{ color: '#38bdf8' }}>{`{{${tok.tokenKey}}}`}</code>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{tok.displayLabel}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{tok.resolutionSource}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>
                    {tok.defaultFallbackValue || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: DUAL BRAIN */}
      {activeTab === 'DUAL_BRAIN' && (
        <div style={{ padding: '2rem', maxWidth: '1100px' }}>
          <h2 style={{ marginTop: 0 }}>
            Dual-Brain Bottom-Up Telemetry (`gtm.playbook_step_variants`)
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Real-time statistical lift aggregated across all downward Regions, Branches, and Units running cloned instances of this Playbook.
          </p>

          {playbook.challengerVariants.map((challenger) => {
            const lift = (
              challenger.replyRatePct - challenger.masterBaselineReplyPct
            ).toFixed(1);
            return (
              <div key={challenger.variantId} className={styles.dualBrainBanner}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#38bdf8' }}>
                    🔥 High-Converting Branch Variant Detected: {challenger.sourceOrgName} (Variant{' '}
                    {challenger.variantLetter})
                  </div>
                  <div style={{ fontSize: '0.83rem', color: '#e2e8f0', marginTop: '0.3rem' }}>
                    Step <code>{challenger.nodeKey}</code> •{' '}
                    <strong>{challenger.replyRatePct}% Reply Rate</strong> vs.{' '}
                    {challenger.masterBaselineReplyPct}% Master Baseline (
                    <span style={{ color: '#34d399' }}>+{lift}% Lift</span> across{' '}
                    {challenger.sendsCount.toLocaleString()} sends)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                    Challenger Subject: <em>&ldquo;{challenger.subjectOverride}&rdquo;</em>
                  </div>
                </div>

                {isAuthorRole && (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={isPending}
                    onClick={() => handlePromoteVariant(challenger)}
                  >
                    🚀 Promote to Master Playbook
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 1: ICP SIGNALS */}
      {activeTab === 'ICP_SIGNALS' && (
        <div style={{ padding: '2rem', maxWidth: '1000px' }}>
          <h2 style={{ marginTop: 0 }}>
            ICP Fit Scoring Rubric & Sequential Waterfall Enrichment
          </h2>
          <div className={styles.astBlockCard}>
            <h4>Target Industries</h4>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
              {playbook.icpRubric.targetIndustries.join(' • ')}
            </p>
            <h4>Target Personas</h4>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
              {playbook.icpRubric.targetJobTitles.join(' • ')}
            </p>
            <h4>Minimum Fit Score Floor (`MAX_FLOOR`)</h4>
            <p style={{ color: '#34d399', fontWeight: 600 }}>
              {playbook.icpRubric.minFitScoreFloor} / 100 (Downward entities cannot enroll prospects below this score)
            </p>
          </div>
        </div>
      )}

      {isActivationDrawerOpen && (
        <DownlineActivationDrawer
          masterPlaybook={playbook}
          targetOrgNodeId={playbook.ownerOrgNodeId}
          targetOrgName="Mississauga Branch (Tier 4)"
          onClose={() => setActivationDrawerOpen(false)}
        />
      )}
    </div>
  );
}

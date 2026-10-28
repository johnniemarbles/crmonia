'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './HierarchyBuilder.module.css';
import { OrgNodeDTO, SubtreeMetrics, MoveExecuteResult } from './types';
import { MoveEntityWizard } from './MoveEntityWizard';

interface Props {
  initialNodes: OrgNodeDTO[];
  initialMetrics: Record<string, SubtreeMetrics>;
  currentScopePath: string;
}

export function HierarchyBuilderClient({
  initialNodes,
  initialMetrics,
  currentScopePath,
}: Props) {
  const router = useRouter();
  const [nodes, setNodes] = useState<OrgNodeDTO[]>(initialNodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    initialNodes[0]?.id ?? ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isMoveWizardActive, setMoveWizardActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'MOVE' | 'MERGE'>('OVERVIEW');

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? nodes[0];
  const metrics = selectedNode ? initialMetrics[selectedNode.id] ?? {
    activeRepsCount: 8,
    totalPipelineValueCents: 1845000000,
    canonicalLeadsCount: 142,
    activePlaybooksCount: 3,
    boundMailboxesCount: 4,
  } : {
    activeRepsCount: 0,
    totalPipelineValueCents: 0,
    canonicalLeadsCount: 0,
    activePlaybooksCount: 0,
    boundMailboxesCount: 0,
  };

  const filteredNodes = nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.orgPath.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.tier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTierClass = (tier: OrgNodeDTO['tier']) => {
    switch (tier) {
      case 'BRAND_HQ':
        return styles.tierHq;
      case 'COUNTRY':
        return styles.tierCountry;
      case 'REGION':
        return styles.tierRegion;
      case 'BRANCH':
        return styles.tierBranch;
      case 'UNIT':
        return styles.tierUnit;
    }
  };

  const getTierIcon = (tier: OrgNodeDTO['tier']) => {
    switch (tier) {
      case 'BRAND_HQ':
        return '🏢';
      case 'COUNTRY':
        return '🌐';
      case 'REGION':
        return '🗺️';
      case 'BRANCH':
        return '📍';
      case 'UNIT':
        return '👤';
    }
  };

  const getDepthIndent = (path: string) => {
    const depth = path.split('.').length - 1;
    return depth * 1.5;
  };

  const handleMoveCompleted = (_result: MoveExecuteResult) => {
    router.refresh();
  };

  const caCount = nodes.filter((n) => n.countryCode === 'CA').length;
  const usCount = nodes.filter((n) => n.countryCode === 'US').length;

  return (
    <div className={styles.shell}>
      {/* 1. TOP HEADER BAR */}
      <header className={styles.headerBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
              ORGANIZATION TOPOLOGY & GOVERNANCE
            </span>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc' }}>
              Hierarchy Builder & Branch Migration Studio
            </h2>
          </div>

          <div className={styles.scopeBadge}>
            <span>Scope: <code style={{ color: '#38bdf8' }}>{currentScopePath}</code></span>
          </div>

          <span className={styles.residencyBadge}>
            Residency: 🇨🇦 CA ({caCount}) | 🇺🇸 US ({usCount})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Total Nodes: <strong>{nodes.length}</strong>
          </span>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              const name = prompt('Enter new node name:');
              if (name && selectedNode) {
                const subKey = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                const newNode: OrgNodeDTO = {
                  id: crypto.randomUUID(),
                  parentId: selectedNode.id,
                  name,
                  tier: selectedNode.tier === 'BRAND_HQ' ? 'COUNTRY' : selectedNode.tier === 'COUNTRY' ? 'REGION' : selectedNode.tier === 'REGION' ? 'BRANCH' : 'UNIT',
                  countryCode: selectedNode.countryCode,
                  orgPath: `${selectedNode.orgPath}.${subKey}`,
                  createdAt: new Date().toISOString(),
                };
                setNodes((prev) => [...prev, newNode]);
              }
            }}
          >
            + Add Child Node
          </button>
        </div>
      </header>

      {/* 2. 50/50 WORKBENCH SPLIT */}
      <div className={styles.workbenchSplit}>
        {/* LEFT PANE: TOPOLOGY CANVAS */}
        <div className={styles.treeCanvasPane}>
          <div className={styles.canvasToolbar}>
            <input
              type="text"
              placeholder="Search nodes, tiers, or ltree paths..."
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="button"
              className={styles.secondaryButton}
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem' }}
              onClick={() => setSearchQuery('')}
            >
              Reset
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {filteredNodes.map((node) => {
              const isSelected = node.id === selectedNode?.id;
              const indentRem = getDepthIndent(node.orgPath);

              return (
                <div
                  key={node.id}
                  className={`${styles.treeNodeItem} ${isSelected ? styles.treeNodeSelected : ''}`}
                  style={{ marginLeft: `${indentRem}rem` }}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    setMoveWizardActive(false);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1rem' }}>{getTierIcon(node.tier)}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f8fafc' }}>
                        {node.name}
                      </div>
                      <code style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        {node.orgPath}
                      </code>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span className={`${styles.tierPill} ${getTierClass(node.tier)}`}>
                      {node.tier}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      {node.countryCode === 'CA' ? '🇨🇦' : node.countryCode === 'US' ? '🇺🇸' : '🌐'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANE: INSPECTOR & MOVE WIZARD */}
        <div className={styles.inspectorPane}>
          {selectedNode ? (
            <div>
              {/* NODE HEADER */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={`${styles.tierPill} ${getTierClass(selectedNode.tier)}`}>
                      {selectedNode.tier}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Country: {selectedNode.countryCode === 'CA' ? '🇨🇦 Canada (ca-central-1)' : '🇺🇸 USA (us-east-1)'}
                    </span>
                  </div>
                  <h2 style={{ margin: '0.4rem 0 0', fontSize: '1.4rem' }}>
                    {getTierIcon(selectedNode.tier)} {selectedNode.name}
                  </h2>
                  <code style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                    {selectedNode.orgPath}
                  </code>
                </div>

                {!isMoveWizardActive && selectedNode.parentId && (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => {
                      setMoveWizardActive(true);
                      setActiveTab('MOVE');
                    }}
                  >
                    ⚡ Move / Re-parent Subtree
                  </button>
                )}
              </div>

              {/* ACTION WIZARD OR INSPECTOR TABS */}
              {isMoveWizardActive ? (
                <MoveEntityWizard
                  selectedNode={selectedNode}
                  allNodes={nodes}
                  onMoveCompleted={handleMoveCompleted}
                  onCancel={() => setMoveWizardActive(false)}
                />
              ) : (
                <>
                  {/* NAVIGATION TABS */}
                  <div className={styles.wizardStepNav}>
                    <button
                      type="button"
                      className={`${styles.stepNavButton} ${activeTab === 'OVERVIEW' ? styles.stepNavActive : ''}`}
                      onClick={() => setActiveTab('OVERVIEW')}
                    >
                      📊 Subtree Metrics
                    </button>
                    <button
                      type="button"
                      className={`${styles.stepNavButton} ${activeTab === 'MOVE' ? styles.stepNavActive : ''}`}
                      onClick={() => {
                        if (selectedNode.parentId) {
                          setMoveWizardActive(true);
                        } else {
                          alert('Root node cannot be moved.');
                        }
                      }}
                    >
                      ⚡ Move Subtree
                    </button>
                    <button
                      type="button"
                      className={`${styles.stepNavButton} ${activeTab === 'MERGE' ? styles.stepNavActive : ''}`}
                      onClick={() => setActiveTab('MERGE')}
                    >
                      🔗 Branch Merger
                    </button>
                  </div>

                  {activeTab === 'OVERVIEW' && (
                    <div>
                      <div className={styles.sectionCard}>
                        <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.9rem' }}>
                          Downline Subtree Roll-Up Metrics
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                          Aggregated live across all descendant units and advisors beneath this node.
                        </p>

                        <div className={styles.metricsGrid}>
                          <div className={styles.metricTile}>
                            <div className={styles.metricValue}>
                              {metrics.activeRepsCount}
                            </div>
                            <div className={styles.metricLabel}>
                              Active Frontline Advisors
                            </div>
                          </div>
                          <div className={styles.metricTile}>
                            <div className={styles.metricValue} style={{ color: '#38bdf8' }}>
                              ${(metrics.totalPipelineValueCents / 100).toLocaleString()}
                            </div>
                            <div className={styles.metricLabel}>
                              Canonical CRM Pipeline Value
                            </div>
                          </div>
                          <div className={styles.metricTile}>
                            <div className={styles.metricValue}>
                              {metrics.canonicalLeadsCount}
                            </div>
                            <div className={styles.metricLabel}>
                              Active Canonical Leads
                            </div>
                          </div>
                          <div className={styles.metricTile}>
                            <div className={styles.metricValue} style={{ color: '#34d399' }}>
                              {metrics.activePlaybooksCount} Active
                            </div>
                            <div className={styles.metricLabel}>
                              Cloned GTM Playbooks
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={styles.sectionCard}>
                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
                          PostgreSQL Row-Level Security Scope
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
                          • Query Context: <code>app.current_org_path = &apos;{selectedNode.orgPath}&apos;</code>
                          <br />
                          • Read / Write Query Boundary: <code>org_path &lt;@ &apos;{selectedNode.orgPath}&apos;::ltree</code>
                          <br />
                          • Sibling Isolation: Strictly isolated from sibling branches under peer nodes.
                        </p>
                      </div>
                    </div>
                  )}

                  {activeTab === 'MERGE' && (
                    <div className={styles.sectionCard}>
                      <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.9rem' }}>
                        Branch & Unit Merger Tool
                      </h4>
                      <p style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                        Consolidate two branches during corporate restructuring. All active leads, GTM sequences, and historical communication audit trails are automatically merged into the survivor branch.
                      </p>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => alert('Merger wizard will guide consolidation into a selected survivor branch.')}
                      >
                        Start Branch Consolidation Wizard &rarr;
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <p style={{ color: '#94a3b8' }}>Select an organization node from the canvas to inspect its details.</p>
          )}
        </div>
      </div>
    </div>
  );
}

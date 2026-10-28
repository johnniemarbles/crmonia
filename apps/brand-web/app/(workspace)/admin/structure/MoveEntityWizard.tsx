'use client';

import React, { useState, useTransition } from 'react';
import styles from './HierarchyBuilder.module.css';
import { OrgNodeDTO, MovePreviewResult, MoveExecuteResult } from './types';

interface WizardProps {
  selectedNode: OrgNodeDTO;
  allNodes: OrgNodeDTO[];
  onMoveCompleted: (result: MoveExecuteResult) => void;
  onCancel: () => void;
}

export function MoveEntityWizard({
  selectedNode,
  allNodes,
  onMoveCompleted,
  onCancel,
}: WizardProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [targetParentId, setTargetParentId] = useState<string>('');
  const [previewResult, setPreviewResult] = useState<MovePreviewResult | null>(null);
  const [executeResult, setExecuteResult] = useState<MoveExecuteResult | null>(null);
  const [allowCrossBorder, setAllowCrossBorder] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Valid candidates: cannot move under itself or any of its own descendants
  const validParentCandidates = allNodes.filter(
    (n) => n.id !== selectedNode.id && !n.orgPath.startsWith(selectedNode.orgPath + '.')
  );

  const handleFetchPreview = () => {
    if (!targetParentId) {
      setErrorMsg('Please select a valid target parent node.');
      return;
    }
    setErrorMsg(null);

    startTransition(async () => {
      try {
        const res = await fetch('/workspace/v1/admin/structure/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: selectedNode.id,
            newParentId: targetParentId,
            action: 'PREVIEW',
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Failed to simulate subtree move.');
        }

        setPreviewResult(data.data as MovePreviewResult);
        setCurrentStep(2);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Simulation failed');
      }
    });
  };

  const handleExecuteMove = () => {
    setErrorMsg(null);

    startTransition(async () => {
      try {
        const res = await fetch('/workspace/v1/admin/structure/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: selectedNode.id,
            newParentId: targetParentId,
            action: 'EXECUTE',
            allowCrossBorder,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Database transactional move failed.');
        }

        const executed = data.data as MoveExecuteResult;
        setExecuteResult(executed);
        setCurrentStep(3);
        onMoveCompleted(executed);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Execution failed');
      }
    });
  };

  return (
    <div className={styles.sectionCard} style={{ borderTop: '3px solid #0284c7' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600, letterSpacing: '0.05em' }}>
            TRANSACTIONAL RE-PARENTING ENGINE
          </span>
          <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.05rem' }}>
            Move Subtree: 📍 {selectedNode.name}
          </h3>
        </div>
        <button type="button" className={styles.secondaryButton} onClick={onCancel} style={{ padding: '0.35rem 0.75rem' }}>
          ✕ Cancel
        </button>
      </div>

      {/* STEP INDICATOR TABS */}
      <div className={styles.wizardStepNav}>
        <button
          type="button"
          className={`${styles.stepNavButton} ${currentStep === 1 ? styles.stepNavActive : ''}`}
          onClick={() => setCurrentStep(1)}
        >
          1. Target Parent
        </button>
        <button
          type="button"
          className={`${styles.stepNavButton} ${currentStep === 2 ? styles.stepNavActive : ''}`}
          onClick={() => previewResult && setCurrentStep(2)}
          disabled={!previewResult}
        >
          2. Impact Preview
        </button>
        <button
          type="button"
          className={`${styles.stepNavButton} ${currentStep === 3 ? styles.stepNavActive : ''}`}
          disabled={!executeResult}
        >
          3. Complete
        </button>
      </div>

      {/* STEP 1: SELECT NEW PARENT */}
      {currentStep === 1 && (
        <div>
          <p style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: 0 }}>
            Select the new parent organization node. The node and all its descendant units, canonical leads, and GTM playbooks will be reparented atomically.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
              Current Path
            </label>
            <code style={{ fontSize: '0.8rem', color: '#38bdf8', backgroundColor: '#0f172a', padding: '0.35rem 0.6rem', borderRadius: '4px', display: 'block' }}>
              {selectedNode.orgPath}
            </code>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
              New Parent Target Node
            </label>
            <select
              value={targetParentId}
              onChange={(e) => setTargetParentId(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#0f172a',
                color: '#fff',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.55rem 0.75rem',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            >
              <option value="">-- Choose Target Parent Node --</option>
              {validParentCandidates.map((cand) => (
                <option key={cand.id} value={cand.id}>
                  {cand.tier} • {cand.name} ({cand.countryCode}) — {cand.orgPath}
                </option>
              ))}
            </select>
          </div>

          {errorMsg && <div className={styles.dangerAlert}>⚠️ {errorMsg}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className={styles.secondaryButton} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!targetParentId || isPending}
              onClick={handleFetchPreview}
            >
              {isPending ? 'Simulating Impact...' : 'Next: Simulate Impact & Residency &rarr;'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: CASCADE IMPACT PREVIEW */}
      {currentStep === 2 && previewResult && (
        <div>
          <div className={styles.metricTile} style={{ marginBottom: '1rem', borderLeft: '4px solid #38bdf8' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Old Path &rarr; Proposed New Path</div>
            <div style={{ fontSize: '0.78rem', marginTop: '0.35rem' }}>
              <span style={{ color: '#ef4444' }}>- {previewResult.oldPath}</span>
              <br />
              <span style={{ color: '#34d399' }}>+ {previewResult.proposedNewPath}</span>
            </div>
          </div>

          <div className={styles.metricsGrid} style={{ marginBottom: '1rem' }}>
            <div className={styles.metricTile}>
              <div className={styles.metricValue}>{previewResult.descendantNodesCount}</div>
              <div className={styles.metricLabel}>Descendant Nodes Moved</div>
            </div>
            <div className={styles.metricTile}>
              <div className={styles.metricValue}>{previewResult.affectedLeadsCount}</div>
              <div className={styles.metricLabel}>Canonical Leads Re-indexed</div>
            </div>
            <div className={styles.metricTile}>
              <div className={styles.metricValue}>{previewResult.affectedPlaybooksCount}</div>
              <div className={styles.metricLabel}>Active GTM Playbooks Cascaded</div>
            </div>
            <div className={styles.metricTile}>
              <div className={styles.metricValue} style={{ color: previewResult.isCrossBorderMove ? '#f87171' : '#34d399' }}>
                {previewResult.isCrossBorderMove ? '⚠️ Cross-Border' : '✅ Compliant'}
              </div>
              <div className={styles.metricLabel}>
                {previewResult.sourceCountry} &rarr; {previewResult.targetCountry} Residency
              </div>
            </div>
          </div>

          {previewResult.isCrossBorderMove && (
            <div className={styles.dangerAlert} style={{ marginBottom: '1rem' }}>
              <strong>⚠️ JURISDICTION RESIDENCY WARNING:</strong>
              <br />
              Moving this entity crosses legal borders ({previewResult.sourceCountry} &rarr; {previewResult.targetCountry}).
              PII and lead records will be subject to target country residency fencing.
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allowCrossBorder}
                  onChange={(e) => setAllowCrossBorder(e.target.checked)}
                />
                <span>I confirm cross-border compliance authorization has been verified.</span>
              </label>
            </div>
          )}

          {errorMsg && <div className={styles.dangerAlert}>⚠️ {errorMsg}</div>}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem' }}>
            <button type="button" className={styles.secondaryButton} onClick={() => setCurrentStep(1)}>
              &larr; Back
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={(previewResult.isCrossBorderMove && !allowCrossBorder) || isPending}
              onClick={handleExecuteMove}
              style={{ backgroundColor: '#10b981' }}
            >
              {isPending ? 'Rewriting Subtree...' : '🚀 Execute Atomic Move Subtree Now'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: EXECUTION SUCCESS REPORT */}
      {currentStep === 3 && executeResult && (
        <div>
          <div className={styles.successAlert}>
            <strong style={{ fontSize: '0.9rem' }}>🎉 Subtree Re-parented Successfully!</strong>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem' }}>
              All descendant nodes, canonical leads, and GTM playbook instances have been atomically updated in PostgreSQL.
            </p>
          </div>

          <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
            <div>• New Path: <code style={{ color: '#38bdf8' }}>{executeResult.newPath}</code></div>
            <div>• Nodes Re-indexed: <strong>{executeResult.affectedNodesCount}</strong></div>
            <div>• Leads Re-indexed: <strong>{executeResult.affectedLeadsCount}</strong></div>
            <div>• Playbooks Re-indexed: <strong>{executeResult.affectedPlaybooksCount}</strong></div>
            <div>• Timestamp: {new Date(executeResult.movedAt).toLocaleString()}</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button type="button" className={styles.primaryButton} onClick={onCancel}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

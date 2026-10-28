'use client';

import React, { useState, useTransition } from 'react';
import styles from './PlaybookBuilder.module.css';
import { MasterPlaybookInitialData } from './types';

interface DrawerProps {
  masterPlaybook: MasterPlaybookInitialData;
  targetOrgNodeId: string;
  targetOrgName: string;
  onClose: () => void;
}

export function DownlineActivationDrawer({
  masterPlaybook,
  targetOrgNodeId,
  targetOrgName,
  onClose,
}: DrawerProps) {
  const [isPending, startTransition] = useTransition();

  // Pre-populate manual tokens with corporate fallback defaults
  const initialTokens: Record<string, string> = {};
  masterPlaybook.tokenDefinitions
    .filter((t) => t.resolutionSource === 'DOWNLINE_MANUAL_INPUT')
    .forEach((t) => {
      initialTokens[t.tokenKey] = t.defaultFallbackValue ?? '';
    });

  const [localizedTokens, setLocalizedTokens] =
    useState<Record<string, string>>(initialTokens);
  const [requestedDailyCap, setRequestedDailyCap] = useState<number>(
    Math.min(25, masterPlaybook.maxDailySendsPerInbox)
  );
  const [selectedPoolIds] = useState<string[]>([
    '00000000-0000-4000-8000-000000000101', // Bound from branch's healthy comms.mailbox_pools
  ]);
  const [activationResult, setActivationResult] = useState<{
    clonedPlaybookId: string;
    readyProspectsCount: number;
    healthyInboxesBound: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLaunchPlaybook = () => {
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/workspace/v1/gtm/playbooks/${masterPlaybook.id}/clone`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetOrgNodeId,
              localizedTokens,
              requestedDailyInboxCap: requestedDailyCap,
              mailboxPoolIds: selectedPoolIds,
              routingMode: 'ROUND_ROBIN_ADVISORS',
            }),
          }
        );

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Downline activation rejected by governance gate.');
        }

        setActivationResult({
          clonedPlaybookId: data.clonedPlaybookId,
          readyProspectsCount: data.readyProspectsCount,
          healthyInboxesBound: data.healthyInboxesBound,
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Activation failed');
      }
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: '640px',
          maxWidth: '95vw',
          backgroundColor: '#0f172a',
          borderLeft: '1px solid #334155',
          padding: '1.75rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #1e293b',
              paddingBottom: '1rem',
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600 }}>
                PLUG-AND-PLAY DOWNLINE LAUNCHER
              </span>
              <h3 style={{ margin: '0.25rem 0 0' }}>
                Activate for: 📍 {targetOrgName}
              </h3>
            </div>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClose}
            >
              ✕ Close
            </button>
          </div>

          {/* STEP 1: TERRITORY & SUPPRESSION SUMMARY */}
          <div className={styles.astBlockCard} style={{ marginTop: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>
              Step 1: Territory & 3-Tier Suppression Gate (Auto-Enforced)
            </h4>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1' }}>
              • Scoped strictly to your node&apos;s `org_path` subtree via PostgreSQL `FORCE RLS`.
              <br />• Platform, Country ({masterPlaybook.countryCode}), and Branch DNC lists are automatically excluded before every send.
            </p>
          </div>

          {/* STEP 2: LOCAL TOKEN INPUTS */}
          <div className={styles.astBlockCard}>
            <h4 style={{ margin: '0 0 0.75rem' }}>
              Step 2: Localize Branch Tokens (`DOWNLINE_MANUAL_INPUT`)
            </h4>

            {Object.keys(localizedTokens).length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                All tokens in this Playbook resolve automatically from your Branch & Advisor profiles.
              </p>
            ) : (
              Object.entries(localizedTokens).map(([key, val]) => (
                <div key={key} style={{ marginBottom: '0.85rem' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      marginBottom: '0.3rem',
                      color: '#e2e8f0',
                    }}
                  >
                    <code>{`{{${key}}}`}</code>
                  </label>
                  <input
                    type="text"
                    className={styles.textareaField}
                    style={{ minHeight: 'auto', height: '2.25rem' }}
                    value={val}
                    onChange={(e) =>
                      setLocalizedTokens((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))
            )}
          </div>

          {/* STEP 3: DENY-WINS DAILY SEND CAP */}
          <div className={styles.astBlockCard}>
            <h4 style={{ margin: '0 0 0.5rem' }}>
              Step 3: Mailbox Rotation Throttle (`MIN_CEILING` Enforced)
            </h4>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 0 }}>
              Corporate/Country Maximum Allowed: <strong>{masterPlaybook.maxDailySendsPerInbox} sends/day/inbox</strong>
            </p>
            <input
              type="number"
              min={5}
              max={masterPlaybook.maxDailySendsPerInbox}
              value={requestedDailyCap}
              onChange={(e) =>
                setRequestedDailyCap(
                  Math.min(masterPlaybook.maxDailySendsPerInbox, Number(e.target.value))
                )
              }
              style={{
                backgroundColor: '#0b0f17',
                color: '#fff',
                border: '1px solid #334155',
                padding: '0.45rem',
                borderRadius: '6px',
                width: '100px',
              }}
            />{' '}
            <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              emails / day / connected inbox
            </span>
          </div>

          {errorMsg && (
            <div
              style={{
                padding: '0.75rem',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                color: '#fca5a5',
                fontSize: '0.82rem',
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          {activationResult && (
            <div
              style={{
                padding: '0.9rem',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #10b981',
                borderRadius: '6px',
                color: '#6ee7b7',
                fontSize: '0.85rem',
              }}
            >
              ✅ <strong>Playbook Activated!</strong>
              <br />• Instance ID: <code>{activationResult.clonedPlaybookId}</code>
              <br />• Healthy Inboxes Bound: {activationResult.healthyInboxesBound}
              <br />• Eligible Prospects Ready in Subtree:{' '}
              {activationResult.readyProspectsCount}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            paddingTop: '1rem',
            borderTop: '1px solid #1e293b',
          }}
        >
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={isPending || Boolean(activationResult)}
            onClick={handleLaunchPlaybook}
          >
            {isPending ? 'Cloning & Verifying Guardrails...' : '🚀 Clone & Launch Playbook Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

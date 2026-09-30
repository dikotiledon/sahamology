'use client';

import { useState, useEffect, useRef } from 'react';
import type { BackgroundJobLog } from '@/lib/types';
import { classifyJobHealth, type JobHealthKind } from '@/lib/ops/classify';

type TransportState = 'idle' | 'ok' | 'unavailable';

type JobLogsPayload = {
  success?: boolean;
  data?: BackgroundJobLog[];
  checkedAt?: string;
};

type FetchResult = { ok: boolean; body: JobLogsPayload };

let inFlightFetch: Promise<FetchResult> | null = null;

function pillCopy(kind: JobHealthKind): { statusClass: string; statusLabel: string; color: string } {
  switch (kind) {
    case 'stalled':
      return { statusClass: 'error', statusLabel: 'Job Stalled', color: '#ff4d4d' };
    case 'failed':
      return { statusClass: 'error', statusLabel: 'Job Failed', color: '#ff4d4d' };
    case 'degraded':
      return { statusClass: 'warning', statusLabel: 'Job Degraded', color: 'var(--accent-orange)' };
    case 'running':
      return { statusClass: 'warning', statusLabel: 'Job Running', color: 'var(--accent-orange)' };
    case 'skipped-closed':
      return { statusClass: 'good', statusLabel: 'IDX closed', color: 'var(--accent-success)' };
    case 'idle':
    default:
      return { statusClass: 'good', statusLabel: 'Jobs Idle', color: 'var(--accent-success)' };
  }
}

export default function JobStatusIndicator() {
  const [latestLog, setLatestLog] = useState<BackgroundJobLog | null>(null);
  const [transport, setTransport] = useState<TransportState>('idle');
  const [checkedAtMs, setCheckedAtMs] = useState<number>(Number.NaN);
  const [showDetails, setShowDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const applyResult = (result: FetchResult) => {
    const data = result.body;
    if (!result.ok || !data?.success) {
      setTransport('unavailable');
      return;
    }
    const parsed = Date.parse(String(data.checkedAt ?? ''));
    if (!Number.isFinite(parsed)) {
      setTransport('unavailable');
      return;
    }
    setCheckedAtMs(parsed);
    setTransport('ok');
    if (Array.isArray(data.data) && data.data.length > 0) {
      setLatestLog(data.data[0] ?? null);
    }
  };

  const fetchStatus = async () => {
    if (inFlightFetch) {
      try {
        applyResult(await inFlightFetch);
      } catch {
        setTransport('unavailable');
      }
      return;
    }

    inFlightFetch = (async () => {
      const res = await fetch('/api/job-logs?jobName=analyze-watchlist&limit=1');
      const body = (await res.json()) as JobLogsPayload;
      return { ok: res.ok, body };
    })();

    try {
      applyResult(await inFlightFetch);
    } catch (error) {
      console.error('Failed to fetch job status', error);
      setTransport('unavailable');
    } finally {
      inFlightFetch = null;
    }
  };

  const handleRetry = async () => {
    if (latestLog === null || isRetrying) return;

    setIsRetrying(true);
    try {
      if (latestLog.job_name !== 'analyze-watchlist') {
        console.warn(`Retry not implemented for job: ${latestLog.job_name}`);
        return;
      }

      const res = await fetch('/api/job-retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobName: latestLog.job_name }),
      });
      const data = await res.json();

      if (data.success) {
        await fetchStatus();
      } else {
        alert(`Failed to retry job: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to retry job', error);
      alert('Failed to retry job. check console for details.');
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const intervalId = setInterval(fetchStatus, 30000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDetails(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (transport === 'unavailable') {
    return (
      <div style={{ position: 'relative' }} ref={containerRef}>
        <div className="token-status-pill" style={{ cursor: 'default' }}>
          <div className="token-dot" />
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Status unavailable</span>
        </div>
      </div>
    );
  }

  if (!latestLog) return null;
  if (!Number.isFinite(checkedAtMs)) {
    return (
      <div style={{ position: 'relative' }} ref={containerRef}>
        <div className="token-status-pill" style={{ cursor: 'default' }}>
          <div className="token-dot" />
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Status unavailable</span>
        </div>
      </div>
    );
  }

  const kind = classifyJobHealth(latestLog, checkedAtMs);
  const { statusClass, statusLabel, color } = pillCopy(kind);
  const isRunning = kind === 'running';
  const isFailed = kind === 'failed' || kind === 'stalled';

  return (
    <div style={{ position: 'relative' }} ref={containerRef}>
      <div
        className="token-status-pill"
        onClick={() => setShowDetails(!showDetails)}
        style={{ cursor: 'pointer' }}
      >
        <div className={`token-dot ${statusClass}`} />
        <span style={{ color, whiteSpace: 'nowrap' }}>{statusLabel}</span>
      </div>

      {showDetails && (
        <div className="token-popup" style={{ width: '320px', padding: '1rem' }}>
          <div className="token-popup-title">
            <span>Latest Job Run</span>
            <div className={`token-dot ${statusClass}`} />
          </div>

          <div className="token-info-row">
            <span>Job:</span>
            <span className="token-info-value">{latestLog.job_name}</span>
          </div>

          <div className="token-info-row">
            <span>Started:</span>
            <span className="token-info-value">
              {new Date(latestLog.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div className="token-info-row">
            <span>Stats:</span>
            <span className="token-info-value">
              <span style={{ color: 'var(--accent-success)' }}>✓{latestLog.success_count}</span>
              {latestLog.error_count > 0 && (
                <span style={{ color: '#ff4d4d', marginLeft: '8px' }}>✕{latestLog.error_count}</span>
              )}
            </span>
          </div>

          {(kind === 'failed' || kind === 'stalled' || kind === 'degraded') && latestLog.error_message && (
            <div className="job-error-banner" style={{ marginTop: '0.75rem' }}>
              <span className="error-icon">⚠</span>
              {latestLog.error_message}
            </div>
          )}

          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Recent logs
            </div>
            <div
              style={{
                maxHeight: '150px',
                overflowY: 'auto',
                fontSize: '0.65rem',
                fontFamily: 'monospace',
              }}
              className="log-entries-scroll"
            >
              {latestLog.log_entries && latestLog.log_entries.length > 0 ? (
                latestLog.log_entries.slice(-5).map((entry, idx) => (
                  <div key={idx} className={`log-entry-line level-${entry.level}`}>
                    <span>[{entry.emiten || 'SYS'}]</span>
                    <span>{entry.message}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                  No logs available
                </div>
              )}
            </div>
          </div>

          {!isRunning && (
            <button
              className="token-action-btn"
              style={{
                marginTop: '1rem',
                opacity: isRetrying ? 0.7 : 1,
                cursor: isRetrying ? 'not-allowed' : 'pointer',
              }}
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {isRetrying ? 'Triggering...' : isFailed ? 'Retry Failed Job' : 'Run Job Now'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

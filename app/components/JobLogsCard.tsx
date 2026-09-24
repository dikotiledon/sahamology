'use client';

import { useState, useEffect, useRef } from 'react';
import type { BackgroundJobLog } from '@/lib/types';

interface JobLogsCardProps {
  jobName?: string;
  showLatestOnly?: boolean;
  refreshInterval?: number; // in ms, 0 to disable
}

export default function JobLogsCard({ 
  jobName = 'analyze-watchlist',
  showLatestOnly = true,
  refreshInterval = 30000, // 30 seconds
}: JobLogsCardProps) {
  const [logs, setLogs] = useState<BackgroundJobLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (jobName) params.set('jobName', jobName);
      if (showLatestOnly && !showAll) {
        params.set('latest', 'true');
      } else {
        params.set('limit', '5');
      }

      const res = await fetch(`/api/job-logs?${params}`);
      const data = await res.json();

      if (data.success) {
        setLogs(data.data);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (_err) {
      setError('Failed to fetch job logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    if (refreshInterval > 0) {
      const interval = setInterval(fetchLogs, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [jobName, showLatestOnly, showAll, refreshInterval]);

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'completed': return 'good';
      case 'failed': return 'error';
      case 'running': return 'warning';
      default: return '';
    }
  };

  const formatDuration = (log: BackgroundJobLog) => {
    if (!log.completed_at && log.status === 'running') return 'Running...';
    if (!log.completed_at) return '-';
    const start = new Date(log.started_at).getTime();
    const end = new Date(log.completed_at).getTime();
    const seconds = Math.round((end - start) / 1000);
    return `${seconds}s`;
  };

  const formatTimeShort = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateShort = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  };

  if (loading && logs.length === 0) return null;

  return (
    <div className="job-logs-container">
      <div className="job-logs-header">
        <h3 className="sidebar-title">Background Jobs</h3>
        <button 
          className="show-all-btn"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Latest Only' : 'Show All'}
        </button>
      </div>

      <div className="job-logs-list">
        {logs.map((log) => {
          const isExpanded = expandedLogId === log.id;
          const statusClass = getStatusClass(log.status);

          return (
            <div 
              key={log.id} 
              className={`job-log-item ${isExpanded ? 'active' : ''} ${log.status === 'failed' ? 'has-error' : ''}`}
            >
              <div 
                className="job-log-summary"
                onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
              >
                <div className="job-log-left">
                  <div className={`token-dot ${statusClass}`} />
                  <div className="job-log-info">
                    <span className="job-name">{log.job_name}</span>
                    <div className="job-meta">
                      <span className="job-date">{formatDateShort(log.started_at)}</span>
                      <span className="dot-separator">•</span>
                      <span className="job-time">{formatTimeShort(log.started_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="job-log-right">
                  <div className="job-stats">
                    <span className="stat success">✓ {log.success_count}</span>
                    {log.error_count > 0 && (
                      <span className="stat error">✕ {log.error_count}</span>
                    )}
                  </div>
                  <div className="job-duration">{formatDuration(log)}</div>
                </div>
              </div>

              {isExpanded && (
                <div className="job-log-details">
                  {log.status === 'failed' && log.error_message && (
                    <div className="job-error-banner">
                      <span className="error-icon">⚠</span>
                      {log.error_message}
                    </div>
                  )}
                  
                  <div className="log-entries-scroll" ref={scrollRef}>
                    {log.log_entries && log.log_entries.length > 0 ? (
                      log.log_entries.map((entry, idx) => (
                        <div key={idx} className={`log-entry-line level-${entry.level}`}>
                          <span className="entry-time">{new Date(entry.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          {entry.emiten && <span className="entry-ticker">[{entry.emiten}]</span>}
                          <span className="entry-msg">{entry.message}</span>
                        </div>
                      ))
                    ) : (
                      <div className="no-entries">No detail logs available</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import InputForm from './InputForm';
import CompactResultCard from './CompactResultCard';
import BrokerSummaryCard from './BrokerSummaryCard';
import KeyStatsCard from './KeyStatsCard';
import AgentStoryCard from './AgentStoryCard';
import PriceGraph from './PriceGraph';
import BrokerFlowCard from './BrokerFlowCard';
import EmitenHistoryCard from './EmitenHistoryCard';
import DecisionCard from './DecisionCard';
import InsiderRadarCard from './InsiderRadarCard';

import * as htmlToImage from 'html-to-image';
import type { StockInput, StockAnalysisResult, KeyStatsData, AgentStoryResult } from '@/lib/types';
import type { RadarAssessment } from '@/lib/radar/types';
import { getDefaultDate } from '@/lib/utils';

interface CalculatorProps {
  selectedStock?: string | null;
}

// Helper function to format the result data for copying
function formatResultForCopy(result: StockAnalysisResult): string {
  const { input, stockbitData, marketData, calculated } = result;

  const formatNumber = (num: number | null | undefined) => num?.toLocaleString() ?? '-';

  const calculateGain = (target: number) => {
    const gain = ((target - marketData.harga) / marketData.harga) * 100;
    return `${gain >= 0 ? '+' : ''}${gain.toFixed(2)}`;
  };

  const lines = [
    `ADIMOLGY: ${input.emiten.toUpperCase()}`,
    `${input.fromDate} s/d ${input.toDate}`,
    ``,
    `TOP BROKER`,
    `Broker: ${stockbitData.bandar}`,
    `∑ Brg: ${formatNumber(stockbitData.barangBandar)} lot`,
    `Avg Harga: Rp ${formatNumber(stockbitData.rataRataBandar)}`,
    ``,
    `MARKET DATA`,
    `Harga: Rp ${formatNumber(marketData.harga)}`,
    `Offer Max: Rp ${formatNumber(marketData.ara)}`,
    `Bid Min: Rp ${formatNumber(marketData.arb)}`,
    `Fraksi: ${formatNumber(marketData.fraksi)}`,
    `∑ Bid: ${formatNumber(marketData.totalBid / 100)}`,
    `∑ Offer: ${formatNumber(marketData.totalOffer / 100)}`,
    ``,
    `CALCULATIONS`,
    `∑ Papan: ${formatNumber(calculated.totalPapan)}`,
    `Avg Bid-Offer: ${formatNumber(calculated.rataRataBidOfer)}`,
    `a (5% avg bandar): ${formatNumber(calculated.a)}`,
    `p (Brg/Avg Bid-Offer): ${formatNumber(calculated.p)}`,
    ``,
    `Target 1: ${calculated.targetRealistis1} (${calculateGain(calculated.targetRealistis1)}%)`,
    `Target 2: ${calculated.targetMax} (${calculateGain(calculated.targetMax)}%)`,
  ];

  return lines.join('\n');
}

export default function Calculator({ selectedStock }: CalculatorProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StockAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [keyStats, setKeyStats] = useState<KeyStatsData | null>(null);

  // Insider Radar State (Phase 7 Integration)
  const [radarData, setRadarData] = useState<RadarAssessment | null>(null);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [activeWatchlistId, setActiveWatchlistId] = useState<number | null>(null);

  const checkWatchlistStatus = useCallback(async (emitenToCheck: string) => {
    try {
      const res = await fetch('/api/watchlist');
      const json = await res.json();
      if (json.success) {
        const rawItems = json.data?.data?.result || json.data?.result || json.data || [];
        const match = rawItems.some(
          (item: any) => (item.symbol || item.company_code || '').toUpperCase() === emitenToCheck.toUpperCase()
        );
        setIsInWatchlist(match);
        const wId = json.data?.data?.watchlist_id || json.data?.watchlist_id;
        if (wId) setActiveWatchlistId(Number(wId));
      }
    } catch (err) {
      console.warn('[Calculator] Failed to check watchlist status:', err);
    }
  }, []);

  const handleToggleWatchlist = async () => {
    const currentEmiten = result?.input?.emiten;
    if (!currentEmiten) return;
    const clean = currentEmiten.toUpperCase();

    if (isInWatchlist) {
      if (!confirm(`Hapus ${clean} dari watchlist?`)) return;
      try {
        const params = new URLSearchParams({ symbol: clean });
        if (activeWatchlistId) params.set('watchlistId', String(activeWatchlistId));
        const res = await fetch(`/api/watchlist?${params.toString()}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to delete');
        setIsInWatchlist(false);
        window.dispatchEvent(new CustomEvent('watchlist-updated', { detail: { action: 'delete', symbol: clean } }));
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Gagal menghapus dari watchlist');
      }
    } else {
      try {
        const res = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: clean, watchlistId: activeWatchlistId || undefined }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to add');
        setIsInWatchlist(true);
        window.dispatchEvent(
          new CustomEvent('watchlist-updated', { detail: { action: 'add', symbol: clean, item: json.data } })
        );
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Gagal menambahkan ke watchlist');
      }
    }
  };

  useEffect(() => {
    const handleWatchlistUpdated = (e: any) => {
      const sym = e.detail?.symbol;
      if (result?.input?.emiten && sym && sym.toUpperCase() === result.input.emiten.toUpperCase()) {
        if (e.detail?.action === 'add') setIsInWatchlist(true);
        if (e.detail?.action === 'delete') setIsInWatchlist(false);
      }
    };
    window.addEventListener('watchlist-updated', handleWatchlistUpdated);
    return () => window.removeEventListener('watchlist-updated', handleWatchlistUpdated);
  }, [result]);

  // Agent Story state
  const [agentStories, setAgentStories] = useState<AgentStoryResult[]>([]);
  const [storyStatus, setStoryStatus] = useState<'idle' | 'pending' | 'processing' | 'completed' | 'error'>('idle');
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollAttemptsRef = useRef(0);

  // Date state lifted from InputForm
  const [fromDate, setFromDate] = useState(getDefaultDate());
  const [toDate, setToDate] = useState(getDefaultDate());

  // Reset result and error when a new stock is selected from sidebar
  useEffect(() => {
    if (selectedStock) {
      setResult(null);
      setError(null);
      setJournalError(null);
      setAgentStories([]);
      setStoryStatus('idle');
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      // Auto-analyze with current selected dates
      // This allows clicking watchlist items to RESPECT the date range selected by user
      handleSubmit({
        emiten: selectedStock,
        fromDate,
        toDate
      });
    }
  }, [selectedStock]);

  const handleSubmit = async (data: StockInput) => {
    window.dispatchEvent(new CustomEvent('stockbit-fetch-start'));
    setLoading(true);
    setError(null);
    setResult(null);
    setAgentStories([]);
    setStoryStatus('idle');
    setKeyStats(null);
    setRadarData(null);
    setRadarLoading(true);
    setRadarError(null);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    void checkWatchlistStatus(data.emiten);

    try {
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const json = await response.json();

      if (!json.success) {
        throw new Error(json.error || 'Failed to analyze stock');
      }

      setResult(json.data);

      // Journal the shown card. Analysis success ≠ journal success.
      if (json.data?.playbook) {
        setJournalError(null);
        try {
          const journalRes = await fetch('/api/decision-journal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              emiten: json.data.input.emiten,
              asOf: json.data.input.toDate,
              card: json.data.playbook,
            }),
          });
          const journalJson = await journalRes.json().catch(() => null);
          if (!journalRes.ok || !journalJson?.success) {
            const message =
              (journalJson && typeof journalJson.error === 'string' && journalJson.error) ||
              `Gagal menyimpan jurnal (${journalRes.status})`;
            setJournalError(message);
          }
        } catch (journalErr) {
          setJournalError(journalErr instanceof Error ? journalErr.message : 'Gagal menyimpan jurnal');
        }
      }

      // Fetch KeyStats after getting result
      try {
        const keyStatsRes = await fetch(`/api/keystats?emiten=${data.emiten}`);
        const keyStatsJson = await keyStatsRes.json();
        if (keyStatsJson.success) {
          setKeyStats(keyStatsJson.data);
        }
      } catch (keyStatsErr) {
        console.error('Failed to fetch key stats:', keyStatsErr);
      }

      // Fetch existing Agent Story if available
      try {
        const storyRes = await fetch(`/api/analyze-story?emiten=${data.emiten}`);
        const storyJson = await storyRes.json();
        if (storyJson.success && storyJson.data && Array.isArray(storyJson.data)) {
          setAgentStories(storyJson.data);
          const latestStory = storyJson.data[0];
          if (latestStory.status === 'completed') {
            setStoryStatus('completed');
          } else if (latestStory.status === 'processing' || latestStory.status === 'pending') {
            // Resume polling only (GET) — do NOT create a new analysis via POST
            resumeStoryPolling(data.emiten);
          }
        }
      } catch (storyErr) {
        console.error('Failed to fetch existing agent story:', storyErr);
      }

      // Fetch Brosum Insider Trade Radar in parallel
      try {
        const radarRes = await fetch(
          `/api/radar?emiten=${encodeURIComponent(data.emiten)}&date=${encodeURIComponent(data.toDate)}`
        );
        const radarJson = await radarRes.json();
        if (radarJson.success && radarJson.data) {
          setRadarData(radarJson.data);
        } else {
          setRadarError(radarJson.error || 'Data radar tidak tersedia untuk tanggal ini');
        }
      } catch (radarErr) {
        console.warn('Failed to fetch radar for emiten:', radarErr);
        setRadarError(radarErr instanceof Error ? radarErr.message : 'Gagal memuat radar');
      } finally {
        setRadarLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      window.dispatchEvent(new CustomEvent('stockbit-fetch-end'));
    }
  };

  const handleDateChange = (newFrom: string, newTo: string) => {
    setFromDate(newFrom);
    setToDate(newTo);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Handle token refresh to auto-retry failed analysis
  useEffect(() => {
    const handleTokenRefresh = () => {
      console.log('Token refreshed event received in Calculator');
      // If there's an error that looks like a token issue, retry the last analysis
      if (error && (error.toLowerCase().includes('token') || error.toLowerCase().includes('401'))) {
        const emitenToRetry = selectedStock || result?.input.emiten;
        if (emitenToRetry) {
          console.log(`Retrying analysis for ${emitenToRetry}`);
          handleSubmit({
            emiten: emitenToRetry,
            fromDate,
            toDate
          });
        }
      }
    };

    window.addEventListener('token-refreshed', handleTokenRefresh);
    return () => window.removeEventListener('token-refreshed', handleTokenRefresh);
  }, [error, selectedStock, result, fromDate, toDate]);

  // Resume polling only (GET) for an in-progress story — does NOT create a new analysis
  const MAX_POLL_ATTEMPTS = 36; // ~3 minutes at the 5s interval below — avoids polling forever on a stuck job
  const resumeStoryPolling = (emiten: string) => {
    setStoryStatus('processing');
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollAttemptsRef.current = 0;

    pollIntervalRef.current = setInterval(async () => {
      pollAttemptsRef.current += 1;
      let reachedTerminal = false;

      try {
        const statusRes = await fetch(`/api/analyze-story?emiten=${emiten}`);
        const statusData = await statusRes.json();

        if (statusData.success && statusData.data && Array.isArray(statusData.data)) {
          const stories = statusData.data;
          setAgentStories(stories);

          const latest = stories[0];
          if (latest.status === 'completed') {
            reachedTerminal = true;
            setStoryStatus('completed');
          } else if (latest.status === 'error') {
            reachedTerminal = true;
            setStoryStatus('error');
          } else if (latest.status === 'processing' || latest.status === 'pending') {
            setStoryStatus('processing');
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }

      if (reachedTerminal || pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (!reachedTerminal) {
          // Gave up waiting on a stuck job — surface a clear error instead of spinning forever
          setStoryStatus('error');
          setAgentStories((prev) =>
            prev.length > 0
              ? [
                  {
                    ...prev[0],
                    status: 'error',
                    error_message: 'Analisis memakan waktu terlalu lama. Coba lagi nanti.',
                  },
                  ...prev.slice(1),
                ]
              : prev
          );
        }
      }
    }, 5000);
  };

  // User-initiated: create a NEW analysis via POST + start polling
  const handleAnalyzeStory = async () => {
    if (!result) return;

    window.dispatchEvent(new CustomEvent('stockbit-fetch-start'));
    const emiten = result.input.emiten.toUpperCase();
    setStoryStatus('pending');

    try {
      // Trigger background analysis
      const response = await fetch('/api/analyze-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emiten,
          keyStats: keyStats
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      // Start polling for status
      resumeStoryPolling(emiten);

    } catch (err) {
      console.error('Failed to start analysis:', err);
      setStoryStatus('error');
    } finally {
      window.dispatchEvent(new CustomEvent('stockbit-fetch-end'));
    }
  };

  const handleCopy = async () => {
    if (!result) return;

    try {
      const formattedText = formatResultForCopy(result);
      await navigator.clipboard.writeText(formattedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyImage = async () => {
    const container = document.getElementById('compact-result-card-container');
    const cardElement = container?.querySelector('.compact-card') as HTMLElement;
    if (!cardElement) return;

    try {
      // Use html-to-image for much better quality and glassmorphism support
      const blob = await htmlToImage.toBlob(cardElement, {
        pixelRatio: 2,
        cacheBust: true,
        // Remove backdrop-filter during capture to prevent the "gray layer" effect
        // Use 'as any' to allow vendor prefixes in the style object
        style: {
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          background: 'var(--bg-secondary)',
          borderRadius: '20px',
        } as any,
        filter: (node: any) => {
          // Ignore the footer buttons and any element marked for ignore
          const exclusionClasses = ['compact-footer'];
          if (node.classList) {
            return !exclusionClasses.some(cls => node.classList.contains(cls)) && 
                   !node.hasAttribute?.('data-html2canvas-ignore');
          }
          return true;
        }
      });

      if (!blob) throw new Error('Failed to generate image blob');

      try {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 2000);
      } catch (err) {
        console.error('Clipboard write failed:', err);

        // 1. Fallback for iOS Safari / Mobile: Web Share API
        // This opens the native share sheet which is often preferred on mobile
        if (navigator.share && navigator.canShare) {
          const file = new File([blob], `${result?.input.emiten || 'stock'}-analysis.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'Stock Analysis Result',
            });
            return;
          }
        }

        // 2. If all else fails
        throw err;
      }
    } catch (err) {
      console.error('Failed to generate image:', err);
      setError('Failed to copy image. Try taking a screenshot manually.');
    }
  };

  return (
    <div className="container">


      <InputForm
        onSubmit={handleSubmit}
        loading={loading}
        initialEmiten={selectedStock}
        fromDate={fromDate}
        toDate={toDate}
        onDateChange={handleDateChange}
        onCopyText={handleCopy}
        onCopyImage={handleCopyImage}
        onAnalyzeAI={() => handleAnalyzeStory()}
        copiedText={copied}
        copiedImage={copiedImage}
        storyStatus={storyStatus}
        hasResult={!!result}
      />

      {/* Fetching indicator moved to Navbar */}

      {error && (
        <div className="glass-card mt-4" style={{
          background: 'rgba(245, 87, 108, 0.1)',
          borderColor: 'var(--accent-warning)'
        }}>
          <h3>❌ Error</h3>
          <p style={{ color: 'var(--accent-warning)' }}>{error}</p>
        </div>
      )}

      {journalError && (
        <div className="glass-card mt-4" style={{
          background: 'rgba(255, 193, 7, 0.1)',
          borderColor: '#ffc107'
        }}>
          <h3>Jurnal gagal</h3>
          <p style={{ color: '#ffc107' }}>{journalError}</p>
        </div>
      )}

      {result && (
        <div style={{ marginTop: '2rem' }}>
          {result.isFromHistory && result.historyDate && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: 'rgba(255, 193, 7, 0.1)',
              border: '1px solid rgba(255, 193, 7, 0.3)',
              borderRadius: '12px',
              color: '#ffc107',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.9rem'
            }}>
              <span style={{ fontSize: '1.2rem' }}>⚠️</span>
              <div>
                Data broker live tidak tersedia. Menampilkan data history terakhir dari tanggal
                <strong style={{ marginLeft: '4px', color: '#ffca2c' }}>
                  {new Date(result.historyDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </strong>
              </div>
            </div>
          )}

          {/* Side-by-side Cards Container */}
          <div className="cards-row">
            {/* Left Column: Compact Result */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div id="compact-result-card-container">
                <CompactResultCard
                  result={result}
                  onCopyText={handleCopy}
                  onCopyImage={handleCopyImage}
                  copiedText={copied}
                  copiedImage={copiedImage}
                />
              </div>


            </div>

            {/* Right Column: Broker Summary */}
            {result.brokerSummary && (
              <BrokerSummaryCard
                emiten={result.input.emiten}
                dateRange={`${result.input.fromDate} — ${result.input.toDate}`}
                brokerSummary={result.brokerSummary}
                sector={result.sector}
              />
            )}

            {/* Decision Card (G0–G3 stance) */}
            {result.playbook && (
              <DecisionCard card={result.playbook} emiten={result.input.emiten} />
            )}

            {/* KeyStats Card */}
            {keyStats && (
              <KeyStatsCard
                emiten={result.input.emiten}
                keyStats={keyStats}
              />
            )}

            {/* Insider Radar Card (Phase 7 Integration) */}
            <div style={{
              gridColumn: '1 / -1',
              width: '100%'
            }}>
              <InsiderRadarCard
                assessment={radarData}
                loading={radarLoading}
                error={radarError}
                emiten={result.input.emiten}
                asOf={result.input.toDate}
                isInWatchlist={isInWatchlist}
                onToggleWatchlist={handleToggleWatchlist}
              />
            </div>

            {/* Emiten History Card - Full Width */}
            <div style={{
              gridColumn: '1 / -1',
              width: '100%'
            }}>
              <EmitenHistoryCard emiten={result.input.emiten} />
            </div>

            {/* Price Graph + Broker Flow Section */}
            <div style={{
              gridColumn: '1 / -1',
              width: '100%',
              display: 'flex',
              gap: '2rem',
              flexWrap: 'wrap',
              alignItems: 'stretch'
            }}>
              <div style={{ flex: '1 1 0', minWidth: '400px' }}>
                <PriceGraph ticker={result.input.emiten} />
              </div>
              <div style={{ flex: '1 1 0', minWidth: '400px', display: 'flex' }}>
                <BrokerFlowCard emiten={result.input.emiten} />
              </div>
            </div>

            {/* Agent Story Section - Full Width */}
            <div style={{ gridColumn: '1 / -1', width: '100%' }}>
              {(agentStories.length > 0 || storyStatus !== 'idle') && (
                <AgentStoryCard
                  stories={agentStories}
                  status={storyStatus}
                  onRetry={() => handleAnalyzeStory()}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

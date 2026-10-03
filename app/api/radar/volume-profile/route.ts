import { NextRequest, NextResponse } from 'next/server';
import { sessionDateJakarta } from '@/lib/market-calendar';
import {
  getLatestVolumeProfileSnapshot,
  getPriceHistory,
  saveVolumeProfileSnapshot,
} from '@/lib/db';
import {
  calculateVolumeProfile,
  evaluateVolumeProfileConfluence,
  type PriceBar,
  type VolumeProfileResult,
} from '@/lib/volume-profile';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const emiten = searchParams.get('emiten')?.toUpperCase();
    const tradeDate = searchParams.get('date') || sessionDateJakarta(new Date());
    const lookback = Math.min(120, Math.max(5, Number(searchParams.get('lookback')) || 20));
    const plannedEntryStr = searchParams.get('plannedEntry');
    const plannedEntry = plannedEntryStr ? Number(plannedEntryStr) : undefined;

    if (emiten) {
      let profile: VolumeProfileResult | null = null;

      // 1. Check if snapshot is already cached in database
      try {
        const stored = await getLatestVolumeProfileSnapshot(emiten, lookback);
        if (stored && stored.as_of_date === tradeDate) {
          const hvnShelves: number[] = Array.isArray(stored.hvn_shelves)
            ? (stored.hvn_shelves as number[])
            : typeof stored.hvn_shelves === 'string'
              ? JSON.parse(stored.hvn_shelves)
              : [];
          const lvnVoids: number[] = Array.isArray(stored.lvn_voids)
            ? (stored.lvn_voids as number[])
            : typeof stored.lvn_voids === 'string'
              ? JSON.parse(stored.lvn_voids)
              : [];

          profile = {
            emiten,
            asOfDate: String(stored.as_of_date),
            lookbackDays: Number(stored.lookback_days) || lookback,
            totalVolume: Number(stored.total_volume) || 0,
            pocPrice: Number(stored.poc_price) || 0,
            vahPrice: Number(stored.vah_price) || 0,
            valPrice: Number(stored.val_price) || 0,
            valueAreaVolumePct: 70,
            bins: [],
            hvnShelves,
            lvnVoids,
          };
        }
      } catch (dbErr) {
        console.warn(`[Volume Profile API] Failed to fetch stored snapshot for ${emiten}:`, dbErr);
      }

      // 2. If not stored or needs bin reconstruction, fetch price bars and calculate live
      if (!profile || profile.bins.length === 0) {
        let bars: PriceBar[] = [];
        try {
          const rawBars = await getPriceHistory(emiten, '2025-01-01', tradeDate);
          if (Array.isArray(rawBars) && rawBars.length > 0) {
            bars = rawBars.map((r: Record<string, unknown>) => ({
              date: String(r.date),
              open: Number(r.open),
              high: Number(r.high),
              low: Number(r.low),
              close: Number(r.close),
              volume: Number(r.volume),
            }));
          }
        } catch (priceErr) {
          console.warn(`[Volume Profile API] Failed to fetch price history for ${emiten}:`, priceErr);
        }

        profile = calculateVolumeProfile({
          emiten,
          bars,
          lookbackDays: lookback,
        });

        // 3. Persist snapshot if database is online and profile has valid data
        if (profile.totalVolume > 0 && profile.pocPrice > 0) {
          try {
            await saveVolumeProfileSnapshot({
              emiten,
              as_of_date: profile.asOfDate || tradeDate,
              lookback_days: lookback,
              poc_price: profile.pocPrice,
              vah_price: profile.vahPrice,
              val_price: profile.valPrice,
              total_volume: profile.totalVolume,
              hvn_shelves: profile.hvnShelves,
              lvn_voids: profile.lvnVoids,
            });
          } catch (saveErr) {
            console.warn(`[Volume Profile API] Failed to cache snapshot for ${emiten}:`, saveErr);
          }
        }
      }

      // 4. Optionally evaluate liquidity confluence if plannedEntry is passed
      const confluence = plannedEntry && plannedEntry > 0
        ? evaluateVolumeProfileConfluence({
            profile,
            plannedEntry,
          })
        : undefined;

      return NextResponse.json({
        status: 'success',
        data: profile,
        confluence,
      });
    }

    // Universe view when no emiten is passed
    return NextResponse.json({
      status: 'success',
      tradeDate,
      items: [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}

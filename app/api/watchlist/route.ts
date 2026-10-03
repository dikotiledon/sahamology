import { NextRequest, NextResponse } from 'next/server';
import { fetchWatchlist, fetchEmitenInfo, deleteWatchlistItem } from '@/lib/stockbit';
import {
  getEmitenFlagsForSymbols,
  getCachedWatchlistGroups,
  getCachedWatchlistItems,
  saveCachedWatchlistItems,
  addCachedWatchlistItem,
  deleteCachedWatchlistItem,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('groupId');
  const sync = searchParams.get('sync') === 'true';

  try {
    const numericGroupId = groupId ? Number(groupId) : undefined;

    // If sync requested, fetch from Stockbit
    if (sync) {
      return await fetchFromStockbitAndCache(numericGroupId);
    }

    // Try to read from local database first
    if (numericGroupId) {
      const cached = await getCachedWatchlistItems(numericGroupId);
      
      if (cached.items.length > 0) {
        // Merge with flags from emiten_flags table
        const symbols = cached.items.map((item: any) => (item.symbol || item.company_code).toUpperCase());

        const flags = await getEmitenFlagsForSymbols(symbols);

        const flagMap = new Map<string, string>();
        flags.forEach((f: any) => flagMap.set(f.emiten, f.flag));

        const itemsWithFlags = cached.items.map((item: any) => {
          const symbol = (item.symbol || item.company_code).toUpperCase();
          return {
            ...item,
            flag: flagMap.get(symbol) || null,
          };
        });

        const responseData = {
          data: {
            watchlist_id: numericGroupId,
            result: itemsWithFlags,
          },
          message: 'Cached data',
        };

        return NextResponse.json({
          success: true,
          data: responseData,
          source: 'cache',
          synced_at: cached.synced_at,
        });
      }
    }

    // If no cache exists, auto-sync from Stockbit (first time)
    return await fetchFromStockbitAndCache(numericGroupId);

  } catch (error) {
    console.error('Watchlist API Error:', error);
    
    // If Stockbit fails, try returning cached data
    if (groupId) {
      const cached = await getCachedWatchlistItems(Number(groupId));
      if (cached.items.length > 0) {
        return NextResponse.json({
          success: true,
          data: {
            data: { watchlist_id: Number(groupId), result: cached.items },
            message: 'Cached data (Stockbit unavailable)',
          },
          source: 'cache',
          synced_at: cached.synced_at,
          warning: 'Stockbit unavailable, showing cached data',
        });
      }
    }
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

/**
 * Fetch from Stockbit API, enrich with sector info, save to cache, and return
 */
async function fetchFromStockbitAndCache(groupId?: number) {
  const watchlistData = await fetchWatchlist(groupId);
  const items = watchlistData.data?.result || [];

  if (items.length === 0) {
    return NextResponse.json({
      success: true,
      data: watchlistData,
      source: 'stockbit',
      synced_at: new Date().toISOString(),
    });
  }

  const symbols = items.map((item: any) => (item.symbol || item.company_code).toUpperCase());

  // Fetch flags from database
  const flags = await getEmitenFlagsForSymbols(symbols);

  const flagMap = new Map<string, string>();
  flags.forEach((f: any) => flagMap.set(f.emiten, f.flag));

  // Fetch sector for each watchlist item in parallel AND merge flags
  const itemsWithData = await Promise.all(
    items.map(async (item: any) => {
      try {
        const symbol = (item.symbol || item.company_code).toUpperCase();
        const emitenInfo = await fetchEmitenInfo(symbol);
        
        // Helper to clean price strings (e.g., "1,234" -> 1234)
        const cleanPrice = (p: any) => {
          if (typeof p === 'number') return p;
          if (typeof p === 'string') return Number(p.replace(/,/g, ''));
          return 0;
        };
        
        const currentPrice = cleanPrice(item.last_price || item.price || emitenInfo?.data?.price || 0);
        
        return {
          ...item,
          id: item.id,
          last_price: currentPrice,
          sector: emitenInfo?.data?.sector || undefined,
          flag: flagMap.get(symbol) || null
        };
      } catch {
        const symbol = (item.symbol || item.company_code).toUpperCase();
        
        const cleanPrice = (p: any) => {
          if (typeof p === 'number') return p;
          if (typeof p === 'string') return Number(p.replace(/,/g, ''));
          return 0;
        };

        return {
          ...item,
          id: item.id,
          last_price: cleanPrice(item.last_price || item.price || 0),
          flag: flagMap.get(symbol) || null
        };
      }
    })
  );

  // Save to cache
  const actualGroupId = groupId || watchlistData.data?.watchlist_id;
  if (actualGroupId) {
    try {
      await saveCachedWatchlistItems(actualGroupId, itemsWithData);
    } catch (cacheError) {
      console.error('Failed to save watchlist cache (non-blocking):', cacheError);
    }
  }

  // Update the response with sector and flag data
  const updatedData = {
    ...watchlistData,
    data: {
      ...watchlistData.data,
      result: itemsWithData
    }
  };

  return NextResponse.json({
    success: true,
    data: updatedData,
    source: 'stockbit',
    synced_at: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { watchlistId, symbol } = body;

    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Symbol is required' },
        { status: 400 }
      );
    }

    const cleanSymbol = symbol.trim().toUpperCase();
    const NON_IDX_CODES = new Set(['USDIDR', 'EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'XAUUSD', 'XAGUSD']);
    if (!/^[A-Z]{4}$/.test(cleanSymbol) || NON_IDX_CODES.has(cleanSymbol)) {
      return NextResponse.json(
        { success: false, error: 'Kode emiten tidak valid. Harus 4 huruf saham IDX (contoh: BBCA).' },
        { status: 400 }
      );
    }

    let targetWatchlistId = watchlistId ? Number(watchlistId) : undefined;
    if (!targetWatchlistId) {
      const cachedGroups = await getCachedWatchlistGroups();
      const defaultG = cachedGroups.groups.find((g) => g.is_default) || cachedGroups.groups[0];
      targetWatchlistId = defaultG?.watchlist_id;
    }

    if (!targetWatchlistId) {
      return NextResponse.json(
        { success: false, error: 'Tidak ada grup watchlist aktif ditemukan' },
        { status: 400 }
      );
    }

    // Enrich with emiten info
    let companyName = cleanSymbol;
    let sector: string | undefined;
    let price: number | null = null;
    let percent: string = '0';
    let companyId: number | null = null;

    try {
      const emitenInfo = await fetchEmitenInfo(cleanSymbol);
      if (emitenInfo?.data) {
        companyName = emitenInfo.data.name || cleanSymbol;
        sector = emitenInfo.data.sector || undefined;
        price = parseFloat(String(emitenInfo.data.price || '').replace(/,/g, '')) || null;
        if (emitenInfo.data.percentage !== undefined && emitenInfo.data.percentage !== null) {
          percent = String(emitenInfo.data.percentage);
        }
        companyId = (emitenInfo.data as any).company_id || (emitenInfo.data as any).id || null;
      }
    } catch (infoErr) {
      console.warn(`[Watchlist POST] Could not fetch emiten info for ${cleanSymbol}:`, infoErr);
    }

    const result = await addCachedWatchlistItem(targetWatchlistId, {
      symbol: cleanSymbol,
      company_name: companyName,
      sector,
      last_price: price,
      percent,
      company_id: companyId,
      stockbit_item_id: `custom_${cleanSymbol}`,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Gagal menambahkan emiten ke watchlist' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.item,
      message: `${cleanSymbol} berhasil ditambahkan ke watchlist`,
    });
  } catch (error) {
    console.error('Add Watchlist API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const watchlistId = searchParams.get('watchlistId');
  const companyId = searchParams.get('companyId');
  const symbolParam = searchParams.get('symbol')?.trim().toUpperCase();

  if (!watchlistId || (!companyId && !symbolParam)) {
    return NextResponse.json(
      { success: false, error: 'Missing watchlistId or (companyId / symbol)' },
      { status: 400 }
    );
  }

  try {
    const numWatchlistId = Number(watchlistId);
    let resolvedSymbol = symbolParam;

    // Delete from Stockbit if companyId exists
    if (companyId) {
      try {
        await deleteWatchlistItem(numWatchlistId, Number(companyId));
      } catch (sbErr) {
        console.warn('Stockbit remote delete warning (continuing local deletion):', sbErr);
      }
    }

    // Resolve symbol from cache if only companyId was provided
    if (!resolvedSymbol && companyId) {
      const cached = await getCachedWatchlistItems(numWatchlistId);
      const itemToDelete = cached.items.find(
        (item: any) => String(item.id) === companyId || item.company_id === Number(companyId)
      );
      resolvedSymbol = itemToDelete?.symbol;
    }

    // Delete from local cache
    await deleteCachedWatchlistItem(numWatchlistId, {
      symbol: resolvedSymbol,
      companyId: companyId ? Number(companyId) : undefined,
    });

    return NextResponse.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Delete Watchlist API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

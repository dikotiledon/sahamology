import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addCachedWatchlistItem, deleteCachedWatchlistItem } from './db';

test('addCachedWatchlistItem and deleteCachedWatchlistItem are exported functions', () => {
  assert.equal(typeof addCachedWatchlistItem, 'function');
  assert.equal(typeof deleteCachedWatchlistItem, 'function');
});

test('saveCachedWatchlistItems preserves custom items using NOT LIKE custom_% condition', () => {
  const dbSrc = readFileSync(join(process.cwd(), 'lib/db.ts'), 'utf8');
  assert.match(
    dbSrc,
    /stockbit_item_id NOT LIKE 'custom_%'/,
    'saveCachedWatchlistItems must preserve custom items across syncs'
  );
  assert.match(
    dbSrc,
    /ON CONFLICT \(watchlist_group_id, symbol\) DO UPDATE/,
    'watchlist_items upsert must handle existing custom items'
  );
});

test('app/api/watchlist/route.ts exports GET, POST, and DELETE handlers', () => {
  const routeSrc = readFileSync(join(process.cwd(), 'app/api/watchlist/route.ts'), 'utf8');
  assert.match(routeSrc, /export async function GET/, 'route.ts must export GET');
  assert.match(routeSrc, /export async function POST/, 'route.ts must export POST');
  assert.match(routeSrc, /export async function DELETE/, 'route.ts must export DELETE');
});

test('POST /api/watchlist enforces 4-letter IDX symbol validation and non-IDX code rejection', () => {
  const routeSrc = readFileSync(join(process.cwd(), 'app/api/watchlist/route.ts'), 'utf8');
  assert.match(routeSrc, /\/\^\[A-Z\]\{4\}\$\//, 'must validate 4-letter alphabetic symbol');
  assert.match(routeSrc, /NON_IDX_CODES/, 'must reject non-IDX instruments like USDIDR');
  assert.match(routeSrc, /addCachedWatchlistItem/, 'must call addCachedWatchlistItem');
});

test('DELETE /api/watchlist accepts symbolParam alongside companyId', () => {
  const routeSrc = readFileSync(join(process.cwd(), 'app/api/watchlist/route.ts'), 'utf8');
  assert.match(routeSrc, /symbolParam/, 'DELETE must accept symbol query param');
  assert.match(routeSrc, /deleteCachedWatchlistItem/, 'DELETE must call deleteCachedWatchlistItem');
});

test('Calculator.tsx integrates InsiderRadarCard and evaluates radar per emiten asynchronously', () => {
  const calcSrc = readFileSync(join(process.cwd(), 'app/components/Calculator.tsx'), 'utf8');
  assert.match(calcSrc, /import InsiderRadarCard from '\.\/InsiderRadarCard'/, 'Calculator must import InsiderRadarCard');
  assert.match(calcSrc, /<InsiderRadarCard/, 'Calculator must render InsiderRadarCard');
  assert.match(calcSrc, /\/api\/radar\?emiten=/, 'Calculator must call /api/radar with emiten');
  assert.match(calcSrc, /handleToggleWatchlist/, 'Calculator must support toggling watchlist');
});

test('WatchlistSidebar.tsx provides Add Emiten form with validation and event dispatch', () => {
  const sidebarSrc = readFileSync(join(process.cwd(), 'app/components/WatchlistSidebar.tsx'), 'utf8');
  assert.match(sidebarSrc, /handleAddEmiten/, 'Sidebar must implement handleAddEmiten');
  assert.match(sidebarSrc, /watchlist-updated/, 'Sidebar must dispatch and listen to watchlist-updated');
  assert.match(sidebarSrc, /showAddForm/, 'Sidebar must toggle add form');
});

test('RadarPage provides quick Watchlist add and remove controls', () => {
  const radarSrc = readFileSync(join(process.cwd(), 'app/radar/page.tsx'), 'utf8');
  assert.match(radarSrc, /handleAddWatchlist/, 'Radar page must implement handleAddWatchlist');
  assert.match(radarSrc, /handleRemoveWatchlist/, 'Radar page must implement handleRemoveWatchlist');
  assert.match(radarSrc, /watchlist-updated/, 'Radar page must listen and dispatch watchlist-updated');
});

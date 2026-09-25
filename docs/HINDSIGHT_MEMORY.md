# Hindsight Memory — Sahamology Integration

Status: **Option A live** (bank created) · **Option B designed** (not yet implemented)

## 1. Goal

Sahamology has two memory systems that must not be confused:

| Layer | Store | Role |
|---|---|---|
| System of record | PostgreSQL (`stock_queries`, `agent_stories`, `background_job_logs`, ...) | Raw domain data, source of truth |
| Knowledge memory | Hindsight bank `sahamology` | Derived observations, semantic recall, reflection |

Rule: **PostgreSQL writes data, Hindsight writes observations.** No Stockbit token, password, or secret may ever be retained into Hindsight.

## 2. Option A — dedicated bank (DONE)

Bank `sahamology` created on the Hindsight instance at `http://192.168.1.4:8888` (API `0.10.0`).

```bash
curl -X PUT http://192.168.1.4:8888/v1/default/banks/sahamology \
  -H 'Content-Type: application/json' \
  -d '{
    "reflect_mission": "Kamu adalah analis riset saham Indonesia untuk proyek Sahamology. ...",
    "retain_mission": "Ekstrak fakta terstruktur tentang: narasi/katalis/SWOT emiten, prediksi target dan hasil hit/miss, bandar dan sektor, kegagalan background job. Jangan menyimpan token, password, atau secret."
  }'

curl -X PATCH http://192.168.1.4:8888/v1/default/banks/sahamology/config \
  -H 'Content-Type: application/json' \
  -d '{"updates": {"enable_reranking": false}}'
```

`enable_reranking` stays `false` (no reranker deployed) — per the Hindsight skill, reranking failures surface as HTTP 500 on recall/reflect while retain keeps succeeding.

### Verified canary loop (retain → recall → reflect → clear)

1. `POST /v1/default/banks/sahamology/memories` — retained a BBCA analysis canary (`async: false`), extracted a `world` fact and consolidated an `observation`.
2. `POST /v1/default/banks/sahamology/memories/recall` — semantic query with zero lexical overlap found the canary.
3. `POST /v1/default/banks/sahamology/reflect` — synthesized a correct Bahasa Indonesia answer (target realistis 10.500 / maksimal 11.200, bandar PT Mirae, katalis rights issue).
4. `DELETE /v1/default/banks/sahamology/memories` cleared the bank back to 0 nodes.

## 3. API surface used (verified against `/openapi.json`)

| Operation | Endpoint | Key fields |
|---|---|---|
| Create/update bank | `PUT /v1/default/banks/{bank_id}` | `reflect_mission`, `retain_mission` |
| Bank config | `PATCH /v1/default/banks/{bank_id}/config` | `{"updates": {"enable_reranking": false}}` |
| Retain | `POST /v1/default/banks/{bank_id}/memories` | `items[]` of `{content, timestamp, context, metadata, document_id, tags, update_mode, ...}` |
| Recall | `POST /v1/default/banks/{bank_id}/memories/recall` | `{query, tags, tags_match, types, prefer_observations, budget, max_tokens}` |
| Reflect | `POST /v1/default/banks/{bank_id}/reflect` | `{query, budget, max_tokens, response_schema}` |
| List | `GET /v1/default/banks/{bank_id}/memories/list` | `q`, `tags`, `limit`, `offset` |
| Curate | `PATCH /v1/default/banks/{bank_id}/memories/{memory_id}` | `{state: "invalidated"}` soft-retires (only world/experience) |
| Clear | `DELETE /v1/default/banks/{bank_id}/memories` | Destructive — clears whole bank |

Notes:

- There is **no hard delete per memory id**. To remove one memory, `PATCH` it with `{"state": "invalidated"}`.
- `document_id` groups memories into one document; `update_mode: "append" | "replace"` controls reprocessing.
- `timestamp` accepts ISO 8601, `null` (now), or `"unset"` (timeless reference material).

## 4. Option B — product feature integration (design)

New server-only module `lib/hindsight.ts` wraps the REST API. All calls must fail **open**: a memory failure must never break an analysis.

### 4.1 Config

```bash
HINDSIGHT_ENABLED=true
HINDSIGHT_API_URL=http://192.168.1.4:8888
HINDSIGHT_BANK_ID=sahamology
HINDSIGHT_API_KEY=            # optional; instance currently has no auth
```

### 4.2 `lib/hindsight.ts` (sketch)

```ts
// Server-only. Never import from client components.
const cfg = () => ({
  enabled: process.env.HINDSIGHT_ENABLED !== 'false',
  apiUrl: process.env.HINDSIGHT_API_URL ?? 'http://192.168.1.4:8888',
  bankId: process.env.HINDSIGHT_BANK_ID ?? 'sahamology',
  apiKey: process.env.HINDSIGHT_API_KEY ?? '',
});

export async function retainMemories(items: MemoryItem[]): Promise<void> {
  const c = cfg();
  if (!c.enabled) return;
  try {
    await fetch(`${c.apiUrl}/v1/default/banks/${c.bankId}/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
      body: JSON.stringify({ items, async: true }),
    });
  } catch (e) {
    console.error('[hindsight] retain failed (non-fatal):', e);
  }
}

export async function recallMemories(query: string, opts?: {
  tags?: string[]; types?: string[]; budget?: 'low'|'mid'|'high'; maxTokens?: number;
}) {
  const c = cfg();
  if (!c.enabled) return { results: [] };
  const res = await fetch(`${c.apiUrl}/v1/default/banks/${c.bankId}/memories/recall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
    body: JSON.stringify({
      query, budget: opts?.budget ?? 'low', max_tokens: opts?.maxTokens ?? 1200,
      tags: opts?.tags, types: opts?.types ?? ['observation', 'world'],
    }),
  });
  return res.json();
}
```

### 4.3 Integration point 1 — AI Story: recall past narratives, then retain the new one

`lib/jobs/run-story-analysis.ts`

**Before generation** (benefit: semantic multi-version narrative memory):

```ts
// near the top of the handler, before buildPrompt
const prior = await recallMemories(
  `narasi, katalis, SWOT, dan kesimpulan terbaru untuk emiten ${emiten}`,
  { tags: [`emiten:${emiten}`, 'story'], budget: 'low', maxTokens: 1200 }
);
const priorContext = prior.results?.map((r: any) => r.text).join('\n') || '';
const prompt = buildPrompt(emiten, keyStatsData, provider, priorContext);
```

`buildPrompt` gains an optional `priorNarratives?: string` parameter. When present, append:

```text
RIWAYAT NARASI SEBELUMNYA (dari memory, urut waktu):
<priorContext>

Bandingkan dengan analisis baru. Jika ada perubahan narasi atau katalis,
sebutkan secara eksplisit di bagian kesimpulan ("Perubahan vs analisis sebelumnya:").
```

**After successful parse** (benefit: memory accumulation):

```ts
await retainMemories([{
  content: [
    `AI Story ${emiten} selesai ${new Date().toISOString()}`,
    `Kesimpulan: ${analysisResult.kesimpulan}`,
    `Katalis: ${JSON.stringify(analysisResult.checklist_katalis ?? [])}`,
    `SWOT: ${JSON.stringify(analysisResult.swot_analysis ?? {})}`,
    `Strategi: ${JSON.stringify(analysisResult.strategi_trading ?? {})}`,
  ].join('\n'),
  context: 'sahamology ai-story analysis',
  timestamp: new Date().toISOString(),
  tags: ['sahamology', 'story', `emiten:${emiten}`],
  metadata: { source: 'analyze-story-background', emiten, story_id: storyId, model: generated.model },
  document_id: `story-${emiten}`,
  update_mode: 'append',
}]);
```

`update_mode: "append"` accumulates narrative history per emiten in one document; recall's temporal retrieval then exposes "how did the BBCA narrative change since last month?".

### 4.4 Integration point 2 — hit/miss observations

`lib/jobs/run-watchlist-analysis.ts` already has the right hook: `updatePreviousDayRealPrice()` is where a previous prediction gets its real outcome. Retain a verdict right there:

```ts
// after updatePreviousDayRealPrice(emiten, today, latestData.close, latestData.high)
await retainMemories([{
  content: `Prediksi ${emiten} ${prevDate}: target_realistis ${r.target_realistis}, target_max ${r.target_max}; ` +
            `real_harga ${latestData.close}, max_harga ${latestData.high}; ` +
            `HIT_R1=${(latestData.high ?? 0) >= (r.target_realistis ?? 0)}, HIT_MAX=${(latestData.high ?? 0) >= (r.target_max ?? 0)}`,
  context: 'sahamology prediction outcome',
  timestamp: new Date().toISOString(),
  tags: ['sahamology', 'hitmiss', `emiten:${emiten}`, r.bandar ? `bandar:${r.bandar}` : ''].filter(Boolean),
  metadata: { source: 'analyze-watchlist-background', emiten, bandar: r.bandar, sector: r.sector },
  document_id: `outcome-${emiten}`,
  update_mode: 'append',
}]);
```

This makes reflect able to answer: *"bandar–sector setup mana yang secara historis paling sering menembus R1?"*

### 4.5 Integration point 3 — job failures as lessons

In the catch blocks of both background functions, retain the failure (non-blocking):

```ts
await retainMemories([{
  content: `Background job ${jobName} gagal: ${errorMessage}`,
  context: 'sahamology job failure',
  timestamp: new Date().toISOString(),
  tags: ['sahamology', 'job-failure', jobName],
  metadata: { source: jobName, isTokenError: String(isTokenError ?? false) },
}]);
```

Reflect can then answer *"apa penyebab paling umum kegagalan scheduled function?"*

## 5. Deployment reachability (important constraint)

The app server (Docker container / PM2) runs on your own infrastructure. If it is on a different
machine than Hindsight (`192.168.1.4`), it cannot reach that LAN address directly unless the two
are on the same network segment. Consequences:

- **Same LAN (`next dev` / Docker on the LAN):** Option B works directly against `http://192.168.1.4:8888`.
- **Production (remote server):** use **Cloudflare Tunnel from `192.168.1.4` to a private hostname, token-protected via Cloudflare Access Service Token** — the app calls that hostname with the `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers; Hindsight stays local. Full procedure: `docs/CLOUDFLARE_TUNNEL.md`.
- **Quick dev-only tunnel:** `cloudflared tunnel --url http://localhost:8888` gives a throwaway `trycloudflare.com` URL — no auth, temporary; use only in `.env.local`.

Environment variables (`.env`):

```bash
HINDSIGHT_ENABLED=true
HINDSIGHT_API_URL=https://hindsight.memory.example.com
HINDSIGHT_BANK_ID=sahamology
HINDSIGHT_CF_ACCESS_CLIENT_ID=xxxx.access
HINDSIGHT_CF_ACCESS_CLIENT_SECRET=xxxxxxxx
```

`lib/hindsight.ts` attaches the two `CF-Access-*` headers when those env vars are set.

## 6. Security guardrails

1. Never retain `session.stockbit_token`, `profile` password rows, or any `.env` value.
2. `lib/hindsight.ts` is server-only; do not import it from client components (it must not ship the URL/key to the browser bundle).
3. Keep `enable_reranking: false` until a reranker is explicitly deployed.
4. Bank separation: product observations → `sahamology`; agent memory → `hermes` (unchanged).
5. All Hindsight calls are wrapped in try/catch — memory is an enhancement, never a dependency of the analysis path.

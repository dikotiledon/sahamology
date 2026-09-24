import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { geminiCalls } from './stubs/google-genai.mjs';
import { storyUpdates, jobUpdates } from './stubs/supabase.mjs';

const STORY = {
  matriks_story: [{ kategori_story: 'Aksi Korporasi' }],
  swot_analysis: { strengths: ['s'] },
  checklist_katalis: [{ item: 'i' }],
  strategi_trading: { tipe_saham: 'value' },
  keystat_signal: 'Positif/Sehat',
  kesimpulan: 'Kesimpulan uji.',
};
const STORY_JSON = JSON.stringify(STORY);

const ENV_KEYS = [
  'LLM_PROVIDER',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_STORY_MODEL',
  'GEMINI_STORY_THINKING_LEVEL',
  'LLM_STORY_TIMEOUT_MS',
];

let fetchCalls: Array<{ url: string; init: RequestInit }> = [];
let fetchImpl: (url: string, init: RequestInit) => Promise<Response> = async () => {
  throw new Error('fetch should not be called');
};

function setEnv(values: Record<string, string>) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

function storyRequest() {
  return new Request('https://example.test/.netlify/functions/analyze-story-background?emiten=bbri&id=42', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyStats: { pe: '10' } }),
  });
}

beforeEach(() => {
  geminiCalls.length = 0;
  storyUpdates.length = 0;
  jobUpdates.length = 0;
  fetchCalls = [];
  fetchImpl = async () => {
    throw new Error('fetch should not be called');
  };
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    fetchCalls.push({ url: String(url), init });
    return fetchImpl(String(url), init);
  }) as typeof fetch;
});

async function loadHandler() {
  const imported = await import(`./analyze-story-background.ts?case=${Date.now()}-${Math.random()}`);
  return imported.default as (req: Request) => Promise<Response>;
}

test('unset LLM_PROVIDER keeps the Gemini client, Google Search, and thinking config', async () => {
  setEnv({
    GEMINI_API_KEY: 'gemini-test-key',
    GEMINI_STORY_MODEL: 'gemini-test-model',
    GEMINI_STORY_THINKING_LEVEL: 'LOW',
  });
  const handler = await loadHandler();
  const response = await handler(storyRequest());
  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 0);
  assert.equal(geminiCalls[0]?.apiKey, 'gemini-test-key');
  const generate = geminiCalls.find((call) => call.model) as {
    model?: string;
    config?: { thinkingConfig?: unknown };
    tools?: unknown;
    contents?: unknown;
  } | undefined;
  assert.equal(generate?.model, 'gemini-test-model');
  assert.deepEqual(generate?.config?.thinkingConfig, { thinkingLevel: 'LOW' });
  assert.deepEqual(generate?.tools, [{ googleSearch: {} }]);
  assert.match(JSON.stringify(generate?.contents), /Google Search/);
  const completed = storyUpdates.find((update) => update.status === 'completed');
  assert.ok(completed);
  assert.equal(Object.hasOwn(completed, 'sources'), false);
});

test('openai mode names the first missing required variable and does not fetch', async () => {
  setEnv({ LLM_PROVIDER: 'openai', LLM_API_KEY: 'sk-test', LLM_MODEL: 'story-model' });
  const handler = await loadHandler();
  const response = await handler(storyRequest());
  assert.equal(response.status, 500);
  assert.equal(fetchCalls.length, 0);
  assert.equal(geminiCalls.length, 0);
  const errored = storyUpdates.find((update) => update.status === 'error');
  assert.match(String(errored?.error_message), /LLM_BASE_URL/);
  assert.equal(jobUpdates.at(-1)?.status, 'failed');
});

test('unknown LLM_PROVIDER fails before any network call', async () => {
  setEnv({ LLM_PROVIDER: 'anthropic', LLM_BASE_URL: 'https://llm.test/v1', LLM_API_KEY: 'sk-test', LLM_MODEL: 'm' });
  const handler = await loadHandler();
  const response = await handler(storyRequest());
  assert.equal(response.status, 500);
  assert.equal(fetchCalls.length, 0);
  assert.match(String(storyUpdates.find((update) => update.status === 'error')?.error_message), /LLM_PROVIDER/);
  assert.equal(jobUpdates.at(-1)?.status, 'failed');
});

test('openai mode posts one chat completion without tools and stores the model', async () => {
  setEnv({
    LLM_PROVIDER: 'openai',
    LLM_BASE_URL: 'https://llm.test/v1/',
    LLM_API_KEY: 'sk-test',
    LLM_MODEL: 'compatible-story',
    GEMINI_API_KEY: 'must-not-be-used',
  });
  fetchImpl = async () => Response.json({ choices: [{ message: { content: STORY_JSON } }] });
  const handler = await loadHandler();
  const response = await handler(storyRequest());
  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://llm.test/v1/chat/completions');
  assert.equal(geminiCalls.length, 0);
  const headers = new Headers(fetchCalls[0].init.headers);
  assert.equal(headers.get('authorization'), 'Bearer sk-test');
  const body = JSON.parse(String(fetchCalls[0].init.body));
  assert.equal(body.model, 'compatible-story');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.messages.length, 1);
  assert.equal(body.tools, undefined);
  assert.doesNotMatch(body.messages[0].content, /Google Search/);
  assert.match(body.messages[0].content, /"pe": "10"/);
  const completed = storyUpdates.find((update) => update.status === 'completed');
  assert.equal(completed?.status, 'completed');
  assert.deepEqual(completed?.matriks_story, STORY.matriks_story);
  assert.deepEqual(completed?.swot_analysis, STORY.swot_analysis);
  assert.deepEqual(completed?.checklist_katalis, STORY.checklist_katalis);
  assert.equal(completed?.keystat_signal, STORY.keystat_signal);
  assert.deepEqual(completed?.strategi_trading, STORY.strategi_trading);
  assert.equal(completed?.kesimpulan, STORY.kesimpulan);
  assert.equal(Object.hasOwn(completed, 'sources'), false);
  const processing = storyUpdates.find((update) => update.status === 'processing');
  assert.equal(processing?.model, 'compatible-story');
  assert.equal(processing?.thinking_level, null);
  assert.equal(jobUpdates.at(-1)?.status, 'completed');
});

test('openai mode marks 401, empty choices, and timeout as story and job failures', async () => {
  const cases: Array<{
    name: string;
    impl: (url: string, init: RequestInit) => Promise<Response>;
    pattern: RegExp;
  }> = [
    {
      name: '401',
      impl: async () => new Response('nope', { status: 401 }),
      pattern: /401/,
    },
    {
      name: 'empty',
      impl: async () => Response.json({ choices: [] }),
      pattern: /choices|empty|content/i,
    },
    {
      name: 'timeout',
      impl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
      pattern: /timed out|timeout|abort/i,
    },
  ];

  for (const item of cases) {
    storyUpdates.length = 0;
    jobUpdates.length = 0;
    fetchCalls = [];
    setEnv({
      LLM_PROVIDER: 'openai',
      LLM_BASE_URL: 'https://llm.test/v1',
      LLM_API_KEY: 'sk-test',
      LLM_MODEL: 'compatible-story',
      LLM_STORY_TIMEOUT_MS: '30',
    });
    fetchImpl = item.impl;
    const handler = await loadHandler();
    const response = await handler(storyRequest());
    assert.equal(response.status, 500, item.name);
    assert.equal(fetchCalls.length, 1, item.name);
    const errored = storyUpdates.find((update) => update.status === 'error');
    assert.match(String(errored?.error_message), item.pattern, item.name);
    assert.equal(jobUpdates.at(-1)?.status, 'failed', item.name);
  }
});

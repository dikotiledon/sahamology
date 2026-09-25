import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLimiter, stockbitFetch } from './stockbit-limiter';

test('limiter spaces out bursts', async () => {
  let now = 0;
  const sleeps: number[] = [];
  const limiter = createLimiter({
    ratePerSec: 2,
    burst: 2,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms; // advance the fake clock so the bucket refills
    },
  });

  await limiter.acquire();
  await limiter.acquire();
  await limiter.acquire(); // third call must wait and then succeed
  assert.ok(sleeps.length >= 1);
});

test('429 retries with backoff then succeeds', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response('', { status: 429, headers: { 'Retry-After': '0' } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const res = await stockbitFetch('https://example.com/x', {}, {
    fetch: fetchImpl,
    limiter: createLimiter({ ratePerSec: 1000, burst: 1000 }),
    sleep: async (ms: number) => { sleeps.push(ms); },
  });
  assert.equal(res.status, 200);
  assert.equal(calls, 2);
  assert.ok(sleeps.length >= 1);
});

test('401 does not retry', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response('', { status: 401 });
  };
  const res = await stockbitFetch('https://example.com/x', {}, {
    fetch: fetchImpl,
    limiter: createLimiter({ ratePerSec: 1000, burst: 1000, sleep: async () => {} }),
  });
  assert.equal(res.status, 401);
  assert.equal(calls, 1);
});

test('rate-limit exhaustion throws after max attempts', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response('', { status: 429, headers: { 'Retry-After': '0' } });
  };
  await assert.rejects(
    () => stockbitFetch('https://example.com/x', {}, {
      fetch: fetchImpl,
      limiter: createLimiter({ ratePerSec: 1000, burst: 1000 }),
      sleep: async () => {},
    }),
    /Stockbit rate limited/
  );
  assert.equal(calls, 5); // 1 initial + 4 retries
});

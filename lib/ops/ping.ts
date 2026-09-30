import Redis from 'ioredis';
import { query } from '../db';
import { READY_PING_MS } from './constants';

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ping-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** True iff `SELECT 1` settles inside READY_PING_MS. Never throws. */
export async function pingPostgres(): Promise<boolean> {
  try {
    await withDeadline(query('SELECT 1'), READY_PING_MS);
    return true;
  } catch {
    return false;
  }
}

/** True iff Redis PING settles inside READY_PING_MS. Never throws. Always disconnect() in finally (not quit()) so a hung Redis cannot stall teardown. */
export async function pingRedis(): Promise<boolean> {
  const url = process.env.REDIS_URL;
  const client = url
    ? new Redis(url, {
        connectTimeout: READY_PING_MS,
        maxRetriesPerRequest: 0,
        enableReadyCheck: false,
        lazyConnect: true,
      })
    : new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        connectTimeout: READY_PING_MS,
        maxRetriesPerRequest: 0,
        enableReadyCheck: false,
        lazyConnect: true,
      });
  try {
    await withDeadline(
      (async () => {
        await client.connect();
        await client.ping();
      })(),
      READY_PING_MS,
    );
    return true;
  } catch {
    return false;
  } finally {
    try {
      client.disconnect();
    } catch {
      // ignore
    }
  }
}

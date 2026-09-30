import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  __resetWorkerStatusForTests,
  getWorkerStatus,
  startWorkers,
} from './queue';

class FakeWorker {
  static constructed = 0;
  static failOn = 0;
  static closed: FakeWorker[] = [];
  name: string;
  constructor(name: string) {
    FakeWorker.constructed += 1;
    this.name = name;
    if (FakeWorker.failOn > 0 && FakeWorker.constructed === FakeWorker.failOn) {
      throw new Error(`worker-construct-fail:${name}`);
    }
  }
  on(): this {
    return this;
  }
  async close(): Promise<void> {
    FakeWorker.closed.push(this);
  }
}

afterEach(() => {
  __resetWorkerStatusForTests();
  FakeWorker.constructed = 0;
  FakeWorker.failOn = 0;
  FakeWorker.closed = [];
});

test('getWorkerStatus reports workersStarted false, schedulerOk independent, startedAt null before boot', () => {
  const status = getWorkerStatus();
  assert.equal(status.workersStarted, false);
  assert.equal(status.schedulerOk, false);
  assert.equal(status.startedAt, null);
});

test('a rejected ensureScheduledJobs yields schedulerOk false without preventing workersStarted', async () => {
  await startWorkers({
    Worker: FakeWorker as unknown as typeof import('bullmq').Worker,
    ensureScheduledJobs: async () => {
      throw new Error('redis-down');
    },
  });
  const status = getWorkerStatus();
  assert.equal(status.schedulerOk, false);
  assert.equal(status.workersStarted, true);
  assert.equal(typeof status.startedAt, 'number');
  assert.equal(FakeWorker.constructed, 3);
});

test('a later Worker constructor throw closes constructed workers and leaves workersStarted false', async () => {
  FakeWorker.failOn = 3;
  await assert.rejects(
    () =>
      startWorkers({
        Worker: FakeWorker as unknown as typeof import('bullmq').Worker,
        ensureScheduledJobs: async () => undefined,
      }),
    /worker-construct-fail/,
  );
  const status = getWorkerStatus();
  assert.equal(status.workersStarted, false);
  assert.equal(FakeWorker.constructed, 3);
  assert.equal(FakeWorker.closed.length, 2);
});

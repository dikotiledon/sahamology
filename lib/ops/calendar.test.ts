import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveJobCalendar } from './calendar';

test('Monday holiday 2026-08-17 at 11:00 UTC skips as holiday', () => {
  const cal = resolveJobCalendar(new Date('2026-08-17T11:00:00.000Z'));
  assert.equal(cal.kind, 'skip');
  if (cal.kind === 'skip') {
    assert.equal(cal.reason, 'holiday');
    assert.equal(cal.wall, '2026-08-17');
  }
});

test('Saturday 2026-09-26 skips as weekend', () => {
  const cal = resolveJobCalendar(new Date('2026-09-26T11:00:00.000Z'));
  assert.equal(cal.kind, 'skip');
  if (cal.kind === 'skip') {
    assert.equal(cal.reason, 'weekend');
    assert.equal(cal.wall, '2026-09-26');
  }
});

test('Thursday 2026-09-24 11:00 UTC runs that wall date', () => {
  const cal = resolveJobCalendar(new Date('2026-09-24T11:00:00.000Z'));
  assert.equal(cal.kind, 'run');
  if (cal.kind === 'run') {
    assert.equal(cal.today, '2026-09-24');
    assert.equal(cal.wall, '2026-09-24');
  }
});

test('Thursday 2026-09-24 07:00 UTC (14:00 WIB, pre-close) is still run', () => {
  const cal = resolveJobCalendar(new Date('2026-09-24T07:00:00.000Z'));
  assert.equal(cal.kind, 'run');
  if (cal.kind === 'run') assert.equal(cal.today, '2026-09-24');
});

test('2027-01-01 is not in the 2026 holiday file so a Friday runs', () => {
  const cal = resolveJobCalendar(new Date('2027-01-01T11:00:00.000Z'));
  assert.equal(cal.kind, 'run');
});

test('calendar source never mentions sessionDateJakarta', () => {
  const src = readFileSync(join(process.cwd(), 'lib', 'ops', 'calendar.ts'), 'utf8');
  assert.equal(src.includes('sessionDateJakarta'), false);
});

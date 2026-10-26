import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  fail: false,
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    execute: vi.fn(async () => {
      if (state.fail) throw new Error('DB_UNAVAILABLE');
      return state.rows;
    }),
  },
  pgRows: (result: unknown) => result as Array<Record<string, unknown>>,
}));

import { getHistoricalSuccessRateAsync } from './telemetry-ranking-bridge.js';

describe('getHistoricalSuccessRateAsync (per-tool, state-unconditioned)', () => {
  beforeEach(() => {
    state.rows = [];
    state.fail = false;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('returns the neutral 0.5 when the tool has no completed attempts', async () => {
    state.rows = [{ total: 0, success: 0, recent_total: 0, recent_success: 0, avg_latency: null, last_seen: null }];
    await expect(getHistoricalSuccessRateAsync('START', 'codebase:search')).resolves.toBe(0.5);
  });

  it('falls back to 0.5 when the database is unavailable', async () => {
    state.fail = true;
    await expect(getHistoricalSuccessRateAsync('START', 'codebase:search')).resolves.toBe(0.5);
  });

  it('shrinks a low-sample rate toward 0.5 (fewer than 20 attempts)', async () => {
    // 4 of 4 successes, all-time. Blended rate 0.7*1 + 0.3*0.5 = 0.85, then damped toward 0.5.
    state.rows = [{ total: 4, success: 4, recent_total: 0, recent_success: 0, avg_latency: 100, last_seen: '2026-09-01T00:00:00Z' }];
    const score = await getHistoricalSuccessRateAsync('START', 'codebase:search');
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(0.85);
  });

  it('uses the blended rate without damping once there are at least 20 attempts', async () => {
    // 20 attempts, 10 successes all-time; 4 recent attempts with 4 successes.
    // Blended = 0.7*0.5 + 0.3*1.0 = 0.65 (no damping at n>=20).
    state.rows = [{ total: 20, success: 10, recent_total: 4, recent_success: 4, avg_latency: 250, last_seen: '2026-10-01T00:00:00Z' }];
    await expect(getHistoricalSuccessRateAsync('START', 'codebase:search')).resolves.toBeCloseTo(0.65, 9);
  });

  it('clamps to [0, 1] and never returns a value outside it', async () => {
    state.rows = [{ total: 500, success: 0, recent_total: 500, recent_success: 500, avg_latency: 1, last_seen: null }];
    const score = await getHistoricalSuccessRateAsync('START', 'codebase:search');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

import { describe, expect, it } from 'vitest';

import { readJsonReport } from './report-utils.js';

type RedisCentroidReport = {
  status: string;
  mode: string;
  plannedKeys: Array<{ key: string; kind: string; rows: number }>;
  summary: {
    appliedWrites: number;
    failures: number;
    plannedWrites: number;
    qdrantBackedRows: number;
    communityBuckets: number;
    somBuckets: number;
    sampleKeys: string[];
  };
  redis: { available: boolean; container: string; passwordConfigured: boolean };
};

describe('redis centroid cache', () => {
  const report = readJsonReport<RedisCentroidReport>('../../docs/reports/redis-centroid-mirror-wiring.json');

  it('keeps the centroid wiring report passing', () => {
    expect(report.status).toBe('PASS');
    expect(report.redis.available).toBe(true);
    expect(report.redis.passwordConfigured).toBe(true);
  });

  it('keeps the planned centroid key shape stable', () => {
    expect(report.plannedKeys.length).toBeGreaterThan(0);
    for (const planned of report.plannedKeys) {
      expect(planned.key.startsWith('atlas:centroid:')).toBe(true);
      expect(planned.kind).toBeTruthy();
      expect(planned.rows).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps planned and applied write counts aligned', () => {
    expect(report.summary.plannedWrites).toBe(report.summary.appliedWrites);
    expect(report.summary.failures).toBe(0);
  });
});

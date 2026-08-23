import { describe, expect, it } from 'vitest';

import { readJsonReport } from './report-utils.js';

type QdrantMirrorReport = {
  status: string;
  collection: string;
  qdrant: { reachable: boolean; status: string; error: string | null };
  proof: Record<string, string>;
  summary: {
    canonicalRows: number;
    qdrantPointsScanned: number;
    joinablePoints: number;
    orphanPoints: number;
    agreementBefore: number;
    agreementAfter: number;
    patchCandidates: number;
    appliedPatches: number;
    applyFailures: number;
  };
  fieldCoverage: Record<string, { canonical: number; present: number; matched: number; mismatched: number; deferred: number }>;
};

describe('qdrant payload mirror', () => {
  const report = readJsonReport<QdrantMirrorReport>('../../docs/reports/qdrant-postgres-mirror-reconciliation.json');

  it('keeps the mirror reconciliation marked in sync', () => {
    expect(report.status).toBe('IN_SYNC');
    expect(report.qdrant.reachable).toBe(true);
    expect(report.summary.canonicalRows).toBeGreaterThan(0);
    expect(report.summary.qdrantPointsScanned).toBeGreaterThan(0);
  });

  it('tracks the expected proof states and coverage lanes', () => {
    expect(report.proof.qdrantMirror).toBe('PROVEN');
    expect(report.proof.identityCoverage).toBeDefined();
    expect(report.fieldCoverage.source_ref).toBeDefined();
    expect(report.fieldCoverage.feature_id).toBeDefined();
    expect(report.fieldCoverage.packet_key).toBeDefined();
    expect(report.fieldCoverage.som_cluster).toBeDefined();
  });

  it('does not report failed patches in the current reconciliation snapshot', () => {
    expect(report.summary.applyFailures).toBe(0);
    expect(report.summary.appliedPatches).toBe(0);
  });
});

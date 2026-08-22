import { describe, expect, it } from 'vitest';

import { readJsonReport } from './report-utils.js';

type ColdStorageProof = {
  schema: string;
  mode: string;
  status: string;
  source_path: string;
  source_hash: string;
  source_size_bytes: number;
  object_path: string;
  packet: {
    packet_key: string;
    source_ref: string;
    feature_id: string;
  };
  upload: unknown;
  restore: unknown;
  manifest: unknown;
};

describe('cold storage manifest proof', () => {
  const report = readJsonReport<ColdStorageProof>('../../docs/reports/cold-storage-restore-proof.json');

  it('keeps the current proof as a dry-run ready artifact', () => {
    expect(report.schema).toBe('cold_storage_restore_proof.v1');
    expect(report.status).toBe('DRY_RUN_READY');
    expect(report.mode).toBe('DRY_RUN');
  });

  it('retains manifest-linked packet identity', () => {
    expect(report.source_path).toBeTruthy();
    expect(report.source_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.source_size_bytes).toBeGreaterThan(0);
    expect(report.packet.packet_key).toBeTruthy();
    expect(report.packet.source_ref).toBeTruthy();
    expect(report.packet.feature_id).toBeTruthy();
  });

  it('does not claim restore evidence that is not present in the artifact', () => {
    expect(report.upload).toBeNull();
    expect(report.restore).toBeNull();
    expect(report.manifest).toBeNull();
  });
});

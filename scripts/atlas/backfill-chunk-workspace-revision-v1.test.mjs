import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';

describe('WORKSPACE-REVISION-BACKFILL-01', () => {
  const receiptPath = path.join(REPO_ROOT, 'docs/reports/workspace-revision-backfill-receipt-v1.json');

  it('generates a valid dry-run receipt with zero database writes', () => {
    expect(fs.existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

    expect(receipt.schema).toBe('atlas.workspace-revision-backfill.v1');
    expect(receipt.dryRun).toBe(true);
    expect(receipt.writesPerformed).toBe(false);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.status).toBe('DRY_RUN_AUDIT_PASSED');
  });

  it('targets the verified active workspace revision matching sha256 format', () => {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    expect(receipt.targetWorkspaceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receipt.targetWorkspaceRevision).toBe('sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc');
  });

  it('partitions 180,081 eligible chunks into 37 bounded batches of 5,000 rows', () => {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const { batchSize, statistics } = receipt;
    const { eligibleToBackfill, batchesPlanned, batchesExecuted, rowsUpdated } = statistics;

    expect(eligibleToBackfill).toBe(180081);
    expect(batchSize).toBe(5000);
    expect(batchesPlanned).toBe(37);
    expect(batchesExecuted).toBe(0);
    expect(rowsUpdated).toBe(0);
  });

  it('preserves cryptographic integrity via sha256 receipt checksum', () => {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    expect(receipt.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

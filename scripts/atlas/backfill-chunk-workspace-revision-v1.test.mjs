import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './connection-config.mjs';

describe('WORKSPACE-REVISION-BACKFILL-01', () => {
  const receiptPath = path.join(REPO_ROOT, 'docs/reports/workspace-revision-backfill-receipt-v1.json');

  it('preserves the original aggregate apply receipt for recovery', () => {
    expect(fs.existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

    expect(receipt.schema).toBe('atlas.workspace-revision-backfill.v1');
    expect(receipt.dryRun).toBe(false);
    expect(receipt.writesPerformed).toBe(true);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.status).toBe('APPLY_COMPLETED');
    expect(receipt).not.toHaveProperty('affectedPrimaryKeys');
    expect(receipt).not.toHaveProperty('preimages');
  });

  it('preserves the historical target workspace revision in sha256 format', () => {
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
    expect(batchesExecuted).toBe(37);
    expect(rowsUpdated).toBe(180081);
  });

  it('preserves cryptographic integrity via sha256 receipt checksum', () => {
    const { checksum, ...receipt } = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const actual = createHash('sha256').update(JSON.stringify(receipt, null, 2)).digest('hex');
    expect(checksum).toBe(`sha256:${actual}`);
  });

  it.each(['--apply', '--rollback'])('refuses %s before connecting or writing a receipt', (flag) => {
    const script = path.join(REPO_ROOT, 'scripts/atlas/backfill-chunk-workspace-revision-v1.mjs');
    const result = spawnSync(process.execPath, [script, flag, '--confirm-apply'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe('WORKSPACE_REVISION_BACKFILL_APPLY_SUSPENDED: use --recovery-audit');
    expect(result.stdout).toBe('');
  });
});

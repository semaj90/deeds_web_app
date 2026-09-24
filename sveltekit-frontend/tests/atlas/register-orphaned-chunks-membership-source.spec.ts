import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Static regression guard: the receipt-driven chunk-lineage path must read the canonical
// per-execution membership (graphify_execution_file_membership_v2). The legacy
// graphify_execution_files table stopped being written after 2026-09-09, so reading it
// yields no revisions for every later execution (found 2026-09-24).
const source = readFileSync(resolve(__dirname, '../../../scripts/atlas/register-orphaned-chunks.mjs'), 'utf8');
const receiptBranch = source.slice(
  source.indexOf('} else if (CAPTURE_LINEAGE && GRAPHIFY_SNAPSHOT_RECEIPT) {'),
  source.indexOf('} else if (CAPTURE_LINEAGE) {'),
);

describe('register-orphaned-chunks execution-membership source', () => {
  it('isolates the receipt-driven branch', () => {
    expect(receiptBranch.length).toBeGreaterThan(100);
  });

  it('joins graphify_execution_file_membership_v2 scoped to the receipt execution and exact source_ref', () => {
    expect(receiptBranch).toMatch(/JOIN graphify_execution_file_membership_v2 gef\s+ON gef\.source_ref = cci\.relative_path AND gef\.execution_id = \$2::uuid/);
  });

  it('propagates code_source_revision unchanged and never consults the legacy table', () => {
    expect(receiptBranch).toContain("NULLIF(BTRIM(gef.code_source_revision::text), '') AS source_revision");
    expect(receiptBranch).toContain('LEFT JOIN atlas_workspace_source_bindings b');
    expect(receiptBranch).toContain('b.source_revision = gef.code_source_revision');
    expect(receiptBranch).toContain('b.binding_checksum');
    expect(receiptBranch).not.toMatch(/JOIN graphify_execution_files\b/);
    expect(source).not.toMatch(/evidenceSource: GRAPHIFY_SNAPSHOT_RECEIPT \? 'graphify_execution_files'/);
  });

  it('requires the admitted exact revision before packet apply and inserts it on atlas_packets', () => {
    expect(source).toContain('PACKET_SOURCE_REVISION_REQUIRED');
    expect(source).toMatch(/INSERT INTO atlas_packets \(packet_id, packet_key, source_ref, source_revision,/);
    expect(source).toContain('admittedSourceRevisionByRef.get(registration.source_ref)');
  });
});

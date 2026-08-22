import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'scripts/atlas/export-frozen-semantic-v2-source.mts'), 'utf8');

describe('revision-qualified FrozenSemanticSnapshotV2 source exporter', () => {
  it('uses Graphify logical workspace/source revisions and never atlas_packets cache epoch as authority', () => {
    expect(source).toContain("gf.code_source_revision");
    expect(source).toContain("gr.workspace_revision = $1");
    expect(source).toContain("sourceRevisionAuthority: 'graphify_files.code_source_revision'");
    expect(source).toContain("workspaceRevisionAuthority: 'graphify_runs.workspace_revision'");
    expect(source).toContain('atlasPacketWorkspaceCacheEpochUsedAsAuthority: false');
    expect(source).not.toMatch(/p\.workspace_revision\s+AS\s+workspace_revision/i);
    expect(source).not.toContain("git rev-parse HEAD");
  });

  it('requires digest equality and blocks ambiguous logical lineage', () => {
    expect(source).toContain("lower(replace(gf.content_hash, 'sha256:', '')) = lower(replace(p.sha256, 'sha256:', ''))");
    expect(source).toContain("reason: 'AMBIGUOUS_LOGICAL_LINEAGE'");
    expect(source).toContain("reason: 'PACKET_SOURCE_DIGEST_MISMATCH'");
  });

  it('runs the database observation in a repeatable-read read-only transaction', () => {
    expect(source).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(source).toContain("postgresWritesAttempted: false");
    expect(source).toContain("qdrantWritesAttempted: false");
  });
});

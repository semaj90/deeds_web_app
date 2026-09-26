import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertSummaryRoutingRowsV1, compileSummaryRoutingRowV1, createSummaryRoutingPostgresRepositoryV1, SummaryRoutingRepositoryError,
  type SummaryRoutingSourceRowV1,
} from './summary-routing-postgres-repository-v1.js';
import { projectSummaryEmbeddingJobV1 } from './summary-routing-payload-v1.js';

const WS = 'sha256:ws';
const sha = (t: string) => `sha256:${createHash('sha256').update(t, 'utf8').digest('hex')}`;
const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const row = (i: number, over: Partial<SummaryRoutingSourceRowV1> = {}): SummaryRoutingSourceRowV1 => ({
  chunk_row_id: id(i), canonical_chunk_id: `fullrepo:src/f${i}.ts:0`, chunk_id: `fullrepo:src/f${i}.ts:0`, packet_key: `packet:${i}`, source_ref: `src/f${i}.ts`,
  source_revision: `sha256:r${i}`, binding_source_revision: `sha256:r${i}`, workspace_revision: WS, binding_workspace_revision: WS, binding_checksum: `bind:${i}`,
  membership_status: 'ACTIVE', revision_status: 'PROVEN', lineage_evidence_refs: ['ev:1'], summary_text: null, summary_provenance: null, legacy_summary: null, packet_summary: null,
  has_summary_embedding: false, has_summary_embedding_384: false, language: 'typescript', domain_class: 'backend', community_id: 2, cluster_id: 3, som_cell_x: 7, som_cell_y: 14, pagerank: 0.1, n_lineage: 1, ...over,
});
const ids = (n: number) => Array.from({ length: n }, (_, i) => id(i + 1));
const twelve = () => Array.from({ length: 12 }, (_, i) => row(i + 1));
const err = (fn: () => void) => { try { fn(); } catch (e) { return (e as SummaryRoutingRepositoryError).code; } return null; };

describe('SummaryRoutingPostgresRepositoryV1 invariants', () => {
  it('exact 12-row batch passes', () => { expect(err(() => assertSummaryRoutingRowsV1(ids(12), twelve(), WS))).toBeNull(); });
  it('blocks the whole batch on each identity defect', () => {
    const t = twelve();
    expect(err(() => assertSummaryRoutingRowsV1(ids(13), t, WS))).toBe('REQUESTED_CHUNK_NOT_FOUND');
    expect(err(() => assertSummaryRoutingRowsV1(ids(12), [...t, row(1)], WS))).toBe('DUPLICATE_CHUNK_ROW');
    expect(err(() => assertSummaryRoutingRowsV1(ids(12), t, 'sha256:other'))).toBe('WORKSPACE_REVISION_MISMATCH');
    expect(err(() => assertSummaryRoutingRowsV1(ids(12), [row(1, { binding_checksum: '' }), ...t.slice(1)], WS))).toBe('SOURCE_BINDING_MISSING');
    expect(err(() => assertSummaryRoutingRowsV1(ids(12), [row(1, { binding_source_revision: 'sha256:drift' }), ...t.slice(1)], WS))).toBe('SOURCE_REVISION_MISMATCH');
    expect(err(() => assertSummaryRoutingRowsV1(ids(12), [row(1, { revision_status: 'UNPROVEN' }), ...t.slice(1)], WS))).toBe('LINEAGE_NOT_PROVEN');
    expect(err(() => assertSummaryRoutingRowsV1(ids(12), [row(1, { chunk_id: 'other' }), ...t.slice(1)], WS))).toBe('CANONICAL_CHUNK_ID_MISMATCH');
    expect(err(() => assertSummaryRoutingRowsV1(ids(12), [row(1, { n_lineage: 2 }), ...t.slice(1)], WS))).toBe('PACKET_KEY_AMBIGUOUS');
    expect(err(() => assertSummaryRoutingRowsV1(ids(12), [row(1, { summary_provenance: 'x' }), ...t.slice(1)], WS))).toBe('SUMMARY_PROVENANCE_MALFORMED');
  });
  it('repository runs the SQL with (repo, workspace, ids), asserts, and never writes', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const repo = createSummaryRoutingPostgresRepositoryV1({ async query(sql, params) { calls.push({ sql, params }); return { rows: twelve() as never }; } });
    const rows = await repo.readByChunkRowIds({ repositoryId: 'deeds-web-app', workspaceRevision: WS, chunkRowIds: ids(12) });
    expect(rows).toHaveLength(12);
    expect(calls[0].params[0]).toBe('deeds-web-app');
    expect(calls.every((c) => !/\b(UPDATE|INSERT|DELETE)\b/i.test(c.sql))).toBe(true);
    const bad = createSummaryRoutingPostgresRepositoryV1({ async query() { return { rows: [row(1, { revision_status: 'UNPROVEN' })] as never }; } });
    await expect(bad.readByChunkRowIds({ repositoryId: 'r', workspaceRevision: WS, chunkRowIds: [id(1)] })).rejects.toThrow('LINEAGE_NOT_PROVEN');
  });
  it('layer hints are digest refs marked HINT, never revision-qualified', async () => {
    const repo = createSummaryRoutingPostgresRepositoryV1({ async query() { return { rows: [{ packet_key: 'packet:1', layer_ref: '(0,1)', text: 'layer text', model_name: 'm', generated_at: '2026-07-04' }] }; } });
    const h = await repo.readSummaryLayerHints(['packet:1']);
    expect(h[0]).toMatchObject({ authority: 'HINT', revisionQualified: false, digest: sha('layer text') });
  });
});

describe('row -> payload compile', () => {
  const TEXT = 'Validates the session token and returns the authenticated user record.';
  const prov = (over = {}) => ({ sourceRevision: 'sha256:r1', workspaceRevision: WS, summaryDigest: sha(TEXT), admission: { status: 'ADMITTED' }, ...over });
  it('legacy quarantine from the row + injected detector: quarantined BLOCKED, clean lineage-bound HINT', () => {
    const detect = (t: string) => ({ clean: !/scaffold/.test(t) });
    expect(compileSummaryRoutingRowV1(row(1, { legacy_summary: 'fine text here for the chunk', legacy_quarantined: true }), detect).summary.state).toBe('BLOCKED');
    expect(compileSummaryRoutingRowV1(row(1, { legacy_summary: 'scaffold leak', legacy_quarantined: false }), detect).summary.state).toBe('BLOCKED');
    expect(compileSummaryRoutingRowV1(row(1, { legacy_summary: 'fine text here for the chunk', legacy_quarantined: false }), detect).summary).toMatchObject({ state: 'HINT', hintClass: 'LEGACY_HINT_LINEAGE_BOUND' });
  });
  it('legacy only / packet only -> HINT; none -> MISSING', () => {
    expect(compileSummaryRoutingRowV1(row(1, { legacy_summary: 'legacy' })).summary).toMatchObject({ state: 'HINT', source: 'LEGACY_CHUNK_SUMMARY' });
    expect(compileSummaryRoutingRowV1(row(1, { packet_summary: 'pkt' })).summary).toMatchObject({ state: 'HINT', source: 'PACKET_SUMMARY' });
    expect(compileSummaryRoutingRowV1(row(1)).summary.state).toBe('MISSING');
  });
  it('admitted exact summary_text -> CURRENT and job-eligible; wrong revision never CURRENT', () => {
    const cur = compileSummaryRoutingRowV1(row(1, { summary_text: TEXT, summary_provenance: prov() }));
    expect(cur.summary.state).toBe('CURRENT');
    expect(projectSummaryEmbeddingJobV1(cur, 'p')).not.toBeNull();
    const bad = compileSummaryRoutingRowV1(row(1, { summary_text: TEXT, summary_provenance: prov({ sourceRevision: 'sha256:zz' }) }));
    expect(bad.summary.state).toBe('BLOCKED');
    expect(projectSummaryEmbeddingJobV1(bad, 'p')).toBeNull();
  });
  it('a 768 vector with no representation lineage stays legacyUnbound; same fixture -> same checksum', () => {
    const p = compileSummaryRoutingRowV1(row(1, { summary_text: TEXT, summary_provenance: prov(), has_summary_embedding: true }));
    expect(p.semantic).toMatchObject({ summaryEmbeddingAvailable: false, legacyUnboundVectorPresent: true });
    expect(compileSummaryRoutingRowV1(row(1, { legacy_summary: 'x' })).payloadChecksum).toBe(compileSummaryRoutingRowV1(row(1, { legacy_summary: 'x' })).payloadChecksum);
  });
});

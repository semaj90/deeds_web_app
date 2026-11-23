import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, quotePgIdentifier, runGraphSourceAudit } from './audit-graph-sources-readonly-v1.mjs';

function makeMockClient({ readOnly = 'on' } = {}) {
  const calls = [];
  const knownColumns = {
    atlas_graph_snapshots_v2: ['snapshot_id', 'status', 'graph_revision', 'workspace_revision', 'source_inventory_revision', 'created_at'],
    atlas_graph_edges_v2: ['snapshot_id', 'edge_type'],
    atlas_graph_nodes_v2: ['snapshot_id', 'source_ref', 'source_revision', 'content_hash'],
    code_features: ['feature_id', 'source_ref', 'symbol', 'kind', 'line_start', 'line_end', 'packet_key'],
    feature_file_edges: ['source_ref', 'target_ref', 'relation_type'],
    code_feature_edges: ['from_feature_id', 'to_feature_id', 'relation', 'evidence_ref', 'confidence', 'created_at'],
    graphify_files: ['repository_relative_path', 'content_hash'],
    codebase_chunk_index: ['source_ref', 'source_revision', 'content_hash'],
  };
  const client = {
    async connect() {},
    async end() {},
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT current_setting')) return { rows: [{ read_only: readOnly, server_version: '18.0' }] };
      if (sql.includes('FROM information_schema.columns')) {
        const rows = Object.entries(knownColumns).flatMap(([table_name, names]) => names.map((column_name, index) => ({
          table_name, column_name, ordinal_position: index + 1, data_type: 'text', udt_name: 'text',
        })));
        return { rows };
      }
      if (/SELECT count\(\*\)::text AS row_count/.test(sql)) return { rows: [{ row_count: '3' }] };
      if (sql.includes('FROM public."atlas_graph_snapshots_v2"')) return { rows: [{ snapshot_id: 'snap-a', status: 'SUPERSEDED', graph_revision: null }] };
      if (sql.includes('AS evidence_ref_count')) return { rows: [{
        relation: 'DEPENDS_ON', row_count: '2', source_count: '1', target_count: '2',
        min_confidence: 0.9, max_confidence: 0.9, evidence_ref_count: '2',
      }] };
      if (sql.includes('GROUP BY')) return { rows: sql.includes('"relation"')
        ? [{ predicate: 'IMPORTS', row_count: '2' }]
        : [{ edge_type: 'CONTAINS', row_count: '2' }] };
      if (sql.includes('strpos(lower(')) return { rows: [{ source_ref: 'src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts', content_hash: 'abc' }] };
      if (sql.includes('FROM public."code_feature_edges" LIMIT $1')) return { rows: [{
        from_feature_id: 'feature-a', to_feature_id: 'feature-b', relation: 'DEPENDS_ON',
        evidence_ref: 'src/a.ts#L2-L2', confidence: 0.9,
      }] };
      if (/^SELECT .* FROM public\./.test(sql)) return { rows: [{ relation_type: 'IMPORTS', source_ref: 'a.ts', target_ref: 'b.ts' }] };
      return { rows: [] };
    },
  };
  return { client, calls };
}

test('parseArgs normalizes target and rejects unsafe output paths and sample limits', () => {
  assert.equal(parseArgs(['--target=src\\a.ts']).target, 'src/a.ts');
  assert.throws(() => parseArgs(['--sample-limit=21']), /INVALID_SAMPLE_LIMIT/);
  assert.throws(() => parseArgs(['--output=../../outside.json']), /OUTPUT_PATH_OUTSIDE_WORKSPACE/);
  assert.throws(() => quotePgIdentifier('x; DROP TABLE y'), /UNSAFE_SQL_IDENTIFIER/);
  assert.equal(quotePgIdentifier('valid_name'), '"valid_name"');
});

test('audit uses a confirmed read-only transaction and only safe bounded projections', async () => {
  const { client, calls } = makeMockClient();
  const report = await runGraphSourceAudit({
    target: 'src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts',
    sampleLimit: 3,
    clientFactory: () => client,
  });

  assert.equal(report.database.connected, true);
  assert.equal(report.readOnlyTransaction, true);
  assert.equal(report.databaseWritesPerformed, false);
  assert.equal(report.targetMatches.atlas_graph_nodes_v2.matchMode, 'BASENAME_CANDIDATE_NOT_EXACT_IDENTITY');
  assert.equal(report.targetMatches.atlas_graph_nodes_v2.rows.length, 1);
  assert.equal(report.targetMatches.code_features.matchMode, 'BASENAME_CANDIDATE_NOT_EXACT_IDENTITY');
  assert.equal(report.counts.feature_file_edges.rows, '3');
  assert.equal(calls[0].sql, 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
  assert.ok(calls.every(({ sql }) => !/^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|REFRESH)\b/i.test(sql)));
  const arbitrarySample = calls.find(({ sql }) => sql.includes('FROM public."feature_file_edges" LIMIT $1'));
  assert.match(arbitrarySample.sql, /"relation_type"/);
  assert.doesNotMatch(arbitrarySample.sql, /SELECT \*/i);
  assert.equal(report.edgeSamples.code_feature_edges.predicateColumn, 'relation');
  assert.deepEqual(report.edgeSamples.code_feature_edges.predicateCounts, [{ predicate: 'IMPORTS', row_count: '2' }]);
  const codeFeatureSample = calls.find(({ sql }) => sql.includes('FROM public."code_feature_edges" LIMIT $1'));
  assert.match(codeFeatureSample.sql, /"relation"/);
  assert.match(codeFeatureSample.sql, /"from_feature_id"/);
  assert.match(codeFeatureSample.sql, /"to_feature_id"/);
  assert.match(codeFeatureSample.sql, /"evidence_ref"/);
  assert.equal(report.relationQuality.codeFeatureEdges.status, 'QUERIED');
  assert.equal(report.relationQuality.codeFeatureEdges.rows[0].evidence_ref_count, '2');
  assert.ok(calls.some(({ sql }) => /count\(DISTINCT "from_feature_id"\)/i.test(sql)));
});

test('audit stops before schema inspection if PostgreSQL does not confirm read-only mode', async () => {
  const { client, calls } = makeMockClient({ readOnly: 'off' });
  const report = await runGraphSourceAudit({ target: 'src/a.ts', clientFactory: () => client });
  assert.equal(report.readOnlyTransaction, false);
  assert.deepEqual(report.errors, ['READ_ONLY_TRANSACTION_NOT_CONFIRMED']);
  assert.equal(calls.some(({ sql }) => sql.includes('information_schema.columns')), false);
  assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
});

test('direct audit calls enforce the sample limit', async () => {
  await assert.rejects(runGraphSourceAudit({ target: 'src/a.ts', sampleLimit: 0 }), /INVALID_SAMPLE_LIMIT/);
});

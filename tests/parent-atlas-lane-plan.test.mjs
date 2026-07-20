import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLiveSchemaReport } from '../scripts/atlas/reconcile-parent-atlas-live-schema.mjs';
import { buildReplayReport, normalizeReplayRecord } from '../scripts/atlas/replayable-packet-reader-writer.mjs';

test('live schema reconciliation classifies canonical, alias-only, and missing groups', () => {
  const report = buildLiveSchemaReport([
    {
      table: 'atlas_tree_nodes',
      title: 'Tree Nodes',
      exists: true,
      row_count: 12,
      groups: [
        { canonical: 'node_id', aliases: [], status: 'CANONICAL', resolved_column: 'node_id', actual_type: 'uuid', actual_db_type: 'uuid', udt_name: 'uuid', nullable: false, default: null, type_ok: true },
        { canonical: 'parent_id', aliases: ['parent_node_id'], status: 'ALIAS_ONLY', resolved_column: 'parent_node_id', actual_type: 'uuid', actual_db_type: 'uuid', udt_name: 'uuid', nullable: true, default: null, type_ok: true },
        { canonical: 'ledger_type', aliases: [], status: 'MISSING', resolved_column: null, actual_type: null, actual_db_type: null, udt_name: null, nullable: null, default: null, type_ok: false },
      ],
      expectedIndexes: [
        { label: 'packet_key', columns: ['packet_key'], status: 'CANONICAL', indexes: ['idx_atlas_tree_nodes_packet_key'] },
        { label: 'source_ref', columns: ['source_ref'], status: 'MISSING', indexes: [] },
      ],
      columns: [],
      indexes: [],
    },
  ]);

  assert.equal(report.status, 'FAIL');
  assert.equal(report.totals.aliasOnly, 1);
  assert.equal(report.totals.missing, 1);
  assert.equal(report.totals.indexesMissing, 1);
  assert.ok(report.signature);
});

test('replayable packet reader normalizes identity and skips incomplete rows', () => {
  const accepted = normalizeReplayRecord(
    {
      packet_key: 'packet:1',
      source_ref: 'src/lib/server/thing.ts',
      feature_id: 'feature.thing',
      title_id: 'title-1',
      tree_node_id: '11111111-1111-4111-8111-111111111111',
      qdrant_point_id: '222',
      summary_type: 'brief',
      domain_class: 'codebase',
      keywords: ['alpha', 'beta'],
      tags: 'gamma',
    },
    { sourceFile: '/tmp/input.ndjson', lineNumber: 3 },
  );

  const skipped = normalizeReplayRecord(
    { source_ref: 'src/lib/server/thing.ts', feature_id: 'feature.thing' },
    { sourceFile: '/tmp/input.ndjson', lineNumber: 4 },
  );

  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.source_ref, 'sveltekit-frontend/src/lib/server/thing.ts');
  assert.deepEqual(accepted.keywords, ['alpha', 'beta']);
  assert.deepEqual(accepted.tags, ['gamma']);
  assert.equal(skipped.status, 'skipped');
  assert.deepEqual(skipped.missing_identity_fields, ['packet_key']);
});

test('replay report summarizes accepted and skipped rows', () => {
  const report = buildReplayReport({
    inputs: [{ path: '/tmp/in.ndjson', kind: 'ndjson', accepted_rows: 1, skipped_rows: 1, parse_errors: 0 }],
    acceptedRows: [
      {
        status: 'accepted',
        packet_key: 'packet:1',
        source_ref: 'sveltekit-frontend/src/lib/server/thing.ts',
        feature_id: 'feature.thing',
        title_id: 'title-1',
        tree_node_id: '11111111-1111-4111-8111-111111111111',
        qdrant_point_id: '222',
        content_hash: null,
        summary: null,
        summary_type: 'brief',
        domain_class: 'codebase',
        ontology_label: null,
        topology_label: null,
        som_cluster: null,
        community_id: null,
        metadata_version: null,
        repository_id: null,
        symbol_kind: null,
        keywords: [],
        concepts: [],
        tags: [],
        contract_version: null,
        source_file: '/tmp/in.ndjson',
        source_line: 3,
        canonical_source_ref: 'sveltekit-frontend/src/lib/server/thing.ts',
        missing_identity_fields: [],
      },
    ],
    skippedRows: [
      {
        status: 'skipped',
        packet_key: null,
        source_ref: 'sveltekit-frontend/src/lib/server/thing.ts',
        feature_id: 'feature.thing',
        missing_identity_fields: ['packet_key'],
      },
    ],
    parseErrors: [],
  });

  assert.equal(report.status, 'PASS_WITH_WARNINGS');
  assert.equal(report.totals.accepted_rows, 1);
  assert.equal(report.totals.skipped_rows, 1);
  assert.equal(report.coverage.packet_key.count, 1);
  assert.ok(report.manifest.accepted_identity_hash);
});

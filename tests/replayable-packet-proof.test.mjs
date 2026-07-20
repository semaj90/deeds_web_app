import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReplayReport } from '../scripts/atlas/replayable-packet-reader-writer.mjs';

test('replay report emits materialization proof states', () => {
  const report = buildReplayReport({
    inputs: [{ path: '/tmp/in.ndjson', kind: 'ndjson', accepted_rows: 2, skipped_rows: 1, parse_errors: 0 }],
    acceptedRows: [
      {
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
        feature_id: null,
        missing_identity_fields: ['packet_key', 'feature_id'],
        canonical_source_ref: 'sveltekit-frontend/src/lib/server/thing.ts',
        qdrant_point_id: null,
      },
    ],
    parseErrors: [],
  });

  assert.equal(report.status, 'PASS_WITH_WARNINGS');
  assert.equal(report.proof.batchingLogic, 'PROVEN');
  assert.equal(report.proof.resumeSemantics, 'RESUME_SEMANTICS_NOT_YET_PROVEN');
  assert.ok(report.proofStates.includes('BATCHING_LOGIC_PROVEN'));
  assert.ok(report.proofStates.includes('RESUME_SEMANTICS_NOT_YET_PROVEN'));
});

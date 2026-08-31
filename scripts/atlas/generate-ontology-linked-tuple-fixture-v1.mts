// ONTO-PY-01 prerequisite: generate ONE frozen, schema-validated
// OntologyLinkedTupleV1 fixture for the Python adapter's parity tests to
// replay against. Uses the REAL schema directly (imported, not
// hand-copied) so the fixture can never silently drift from the
// canonical TS contract. Deliberately a genuine 4-participant n-ary
// relation, not a trivial binary edge, per the operator's instruction —
// this is exactly the shape RDF cannot represent as one triple, so it's
// the real test of whether the Python adapter's n-ary reification is
// honest.
//
// Run from sveltekit-frontend/ (so the $lib alias resolves):
//   cd sveltekit-frontend && npx tsx ../scripts/atlas/generate-ontology-linked-tuple-fixture-v1.mts

import { writeFileSync } from 'node:fs';
import { OntologyLinkedTupleV1Schema, buildOntologyLinkedTupleId } from '$lib/server/atlas/contracts/ontology-linked-tuple-v1.js';

const tupleId = buildOntologyLinkedTupleId([
  'ontology-linked-tuple.v1',
  'packet:oak-fixture:repair-failure-r17',
  'src/lib/server/atlas/symbol-repair-example.ts',
  'tree-node:t7',
  'title:0',
  'CODE_REPAIR_CAUSAL_PATH',
  'fixture:onto-py-01',
]);

const fixture = OntologyLinkedTupleV1Schema.parse({
  tupleId,
  schemaVersion: 'ontology-linked-tuple.v1',
  packetKey: 'packet:oak-fixture:repair-failure-r17',
  sourceRef: 'src/lib/server/atlas/symbol-repair-example.ts',
  treeNodeId: 'tree-node:t7',
  titleId: 'title:0',
  surfaceText: 'CODE_REPAIR_CAUSAL_PATH',
  tokenIndex: 0,
  partOfSpeech: null,
  label: 'CODE_REPAIR_CAUSAL_PATH',
  labelKind: 'ontology',
  labelSource: 'manual',
  ontologyIds: ['ontology:code-repair-causal-path'],
  conceptIds: ['concept:symbol-change-impact'],
  // Genuine n-ary relation: 4 named participants, not a pairwise edge.
  // Mirrors the operator's own example (failingTest/targetSymbol/caller
  // + a confidence-bearing evidence participant) using only real,
  // schema-legal role/entityKind enum values — no invented vocabulary.
  participants: [
    { entityId: 'symbol:S1', entityKind: 'ast_symbol', role: 'cause', label: 'caller symbol S1' },
    { entityId: 'symbol:S2', entityKind: 'ast_symbol', role: 'effect', label: 'target symbol S2 (failing)' },
    { entityId: 'symbol:T7', entityKind: 'ast_symbol', role: 'evidence', label: 'failing test T7' },
    { entityId: 'tool_call:typecheck-run-42', entityKind: 'tool_call', role: 'tool', label: 'tsc --noEmit invocation that surfaced the failure' },
  ],
  evidenceRefs: [
    'vitest:ontology-kernel-end-to-end.spec.ts:pre-fix-run:4-failed-of-21',
  ],
  relationRevision: 'relation:code-repair-causal-path:v1',
  evidenceSpan: {
    sourceRef: 'src/lib/server/atlas/symbol-repair-example.ts',
    start: 120,
    end: 168,
  },
  confidence: 0.93,
  evidenceState: 'ACTIVE_VERIFIED',
  lifecycle: 'OBSERVED',
  provenance: {
    sourceTables: ['atlas_symbol_versions', 'atlas_callable_search'],
    labelerVersion: null,
    taggerVersion: null,
    ontologyVersion: 'ontology-kernel:v0',
    nlpVersion: null,
    sourceRevision: 'sha256:' + 'b'.repeat(64),
    representationId: null,
    representationRevision: null,
    producerId: 'onto-py-01-fixture-generator',
    producerRevision: 'onto-py-01:v0',
    featureRevision: null,
    graphRevision: null,
    ontologyRevision: 'ontology-kernel:v0',
    modelRevision: null,
    inputDigest: null,
    outputDigest: null,
    generatedAt: new Date('2026-08-31T00:00:00.000Z').toISOString(),
    lastVerifiedAt: null,
  },
});

const outPath = process.argv[2] ?? '../docs/reports/fixtures/ontology-linked-tuple-fixture-v1.json';
writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
console.log(`Wrote ${outPath}`);
console.log(`tupleId: ${fixture.tupleId}`);
console.log(`participants: ${fixture.participants.length} (n-ary, not binary)`);

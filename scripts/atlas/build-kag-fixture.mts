#!/usr/bin/env node
/**
 * build-kag-fixture.mts
 *
 * KAG-04 (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration) live
 * proof, step 1: builds one real HyperedgeV1 via the actual createHyperedgeV1
 * factory (so checksum is genuine, not fabricated) and one real
 * OntologyLinkedTupleV1, writes both to a JSONL fixture consumable by the
 * existing scripts/atlas/materialize-kag-contracts-v1.mts.
 *
 * Usage (run from repo root via node --import tsx, or `npx tsx` from
 * sveltekit-frontend/):
 *   node sveltekit-frontend/node_modules/tsx/dist/cli.mjs scripts/atlas/build-kag-fixture.mts
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHyperedgeV1 } from '../../sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts';
import type { OntologyLinkedTupleV1 } from '../../sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const hyperedge = createHyperedgeV1({
  predicate: 'related',
  participants: [
    { canonicalId: '0ba2345cd9c542fa', role: 'member', ordinal: 0 },
    { canonicalId: 'packet:kag04-proof-b', role: 'member', ordinal: 1 },
  ],
  evidenceRefs: ['0ba2345cd9c542fa'],
  workspaceRevision: 'ws:kag04-proof',
  graphRevision: 'graph:kag04-proof',
  sourceRevision: 'src:kag04-proof',
  producerRevision: 'kag04-live-proof:v1',
});

const tuple: OntologyLinkedTupleV1 = {
  tupleId: 'tuple:kag04-live-proof-2026-08-25',
  schemaVersion: 'ontology-linked-tuple.v1',
  packetKey: '0ba2345cd9c542fa',
  sourceRef: 'taxonomy:kag04-proof',
  surfaceText: 'live proof',
  label: 'live proof',
  labelKind: 'ontology',
  labelSource: 'semantic_tagger',
  ontologyIds: ['ontology:kag04-proof'],
  conceptIds: ['concept:kag04-proof'],
  participants: [],
  evidenceRefs: [],
  confidence: 0.75,
  evidenceState: 'ACTIVE_VERIFIED',
  lifecycle: 'OBSERVED',
  provenance: {
    sourceTables: ['taxonomy_nodes'],
    labelerVersion: null,
    taggerVersion: null,
    ontologyVersion: null,
    nlpVersion: null,
  },
};

const fixturePath = path.join(ROOT, '.tmp/atlas/kag04-live-proof-fixture.jsonl');
await fs.mkdir(path.dirname(fixturePath), { recursive: true });
await fs.writeFile(
  fixturePath,
  `${JSON.stringify({ kind: 'hyperedge', value: hyperedge })}\n${JSON.stringify({ kind: 'ontology_tuple', value: tuple })}\n`
);
console.log(`FIXTURE_WRITTEN ${fixturePath}`);

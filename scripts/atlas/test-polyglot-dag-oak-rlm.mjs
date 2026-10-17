import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildContextManifestV2,
  computeOrderedSelectionChecksumV1,
  computeSelectedOrdinalSetChecksumV1,
  verifyContextManifestV2Selection,
} from '../../sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.js';
import { chooseCandidateBucket } from '../../sveltekit-frontend/src/lib/server/atlas/graph/graph-runtime-contracts.js';
import { parseDspyRepairOutputV1 } from '../../sveltekit-frontend/src/lib/server/atlas/evals/dspy-repair-output-v1.js';
import {
  RetrievalDagPrefillLutV1Schema,
  orderLutEntriesByDagTopology,
  readUtf8SourceSpanSlice,
  synthesizeRetrievalDagPrefillPlanV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/prefill/retrieval-dag-prefill-lut-v1.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');
const svelteRoot = path.join(repoRoot, 'sveltekit-frontend');
const lutPath = path.join(svelteRoot, 'data/atlas-tensor-proof/retrieval_dag_prefill_lut_v1.json');

test('Polyglot 5-Plane LUT, OaK Option Insert, RLM Pointer Swap & ContextManifestV2 Admission', () => {
  const rawLut = JSON.parse(fs.readFileSync(lutPath, 'utf8'));
  const lut = RetrievalDagPrefillLutV1Schema.parse(rawLut);

  assert.equal(lut.entries.length, 50);

  // Topological Kahn sort order on [0, 10, 20, 30] -> [30, 20, 10, 0]
  const rawSelection = [0, 10, 20, 30];
  const selectedEntries = rawSelection.map((ord) => lut.entries[ord]);
  const { ordered, cyclesBroken } = orderLutEntriesByDagTopology(selectedEntries);

  assert.equal(cyclesBroken, 0);
  const orderedOrdinals = ordered.map((e) => e.ordinal);
  assert.deepEqual(orderedOrdinals, [30, 20, 10, 0]);

  // ContextManifest build & verification
  const selectedNodeKeys = ordered.map((e) => e.canonicalId);
  const evidenceRefs = ordered.flatMap((e) => [e.canonicalId, `sha256:${e.vectorSha256}`]);
  const snapshotId = 'snap-polyglot-dag-v1';
  const ordinalMapChecksum = lut.checksumSha256;

  const selectedOrdinalSetChecksum = computeSelectedOrdinalSetChecksumV1({
    snapshotId,
    ordinalMapChecksum,
    selectedOrdinals: orderedOrdinals,
  });

  const orderedSelectionChecksum = computeOrderedSelectionChecksumV1({
    ordinals: orderedOrdinals,
    selectedNodeKeys,
    evidenceRefs,
  });

  const manifestV1 = {
    schema: 'atlas.context-manifest.v1',
    requestId: 'req-polyglot-oak-rlm-01',
    snapshotId,
    graphRevision: lut.graphRevision,
    query: 'Verify 5-plane polyglot LUT prefill, OaK option insert, and RLM pointer swap closure',
    candidateBucket: chooseCandidateBucket(orderedOrdinals.length),
    candidateCount: orderedOrdinals.length,
    tokenBudget: 4096,
    selectedNodeKeys,
    evidenceRefs,
    producerRevision: 'atlas.polyglot-prefill.v1',
  };

  const manifestV2 = buildContextManifestV2(manifestV1, {
    selectedOrdinalSetChecksum,
    orderedSelectionChecksum,
    evidenceRevisions: {
      sourceRevision: ordered[0].sourceRevision,
      representationRevision: lut.representationRevision,
      featureRevision: 'atlas.candidate-feature-matrix.v1',
      ontologyRevision: 'atlas.ontology.v1',
      modelRevision: 'ornith-1.5-9b',
      promptTemplateRevision: 'atlas.dag-prefill-template.v1',
    },
    ordinalMapChecksum,
    retrievalPolicyRevision: 'atlas.hmm-policy.v1',
    acePlaybookRevision: 'atlas.ace-playbook.v1',
  });

  verifyContextManifestV2Selection(manifestV2, {
    snapshotId,
    ordinalMapChecksum,
    selectedOrdinals: orderedOrdinals,
  });

  const prefillPlan = synthesizeRetrievalDagPrefillPlanV1({
    repoRoot,
    lut,
    selectedOrdinals: rawSelection,
    requestId: manifestV1.requestId,
    contextManifestChecksum: manifestV2.identityChecksum,
    userQuery: manifestV1.query,
  });
  assert.equal(prefillPlan.kvCachePersisted, false);
  assert.deepEqual(prefillPlan.orderedOrdinals, [30, 20, 10, 0]);

  // Valid DSPy repair proposal
  const rlmTags = ordered.map((e) => `<rlm_call label="${e.canonicalId}" />`);
  const oakOptionInsert = `OPTION[verify_dag_lineage]: traverse(${selectedNodeKeys.join(' -> ')}) using RLM pointer swaps ${rlmTags.slice(0, 2).join(' ')}`;

  const admittedProposal = parseDspyRepairOutputV1(
    {
      schema: 'atlas.dspy-repair-output.v1',
      contextManifestChecksum: `sha256:${manifestV2.identityChecksum}`,
      diagnosis: 'Topological LUT prefill verified across 4 nodes',
      targetCandidates: selectedNodeKeys,
      patchPlan: oakOptionInsert,
      validationPlan: 'Run test suite',
      evidenceRefs,
    },
    manifestV2
  );

  assert.deepEqual(admittedProposal.targetCandidates, selectedNodeKeys);
  assert.equal(admittedProposal.patchPlan.includes('<rlm_call label='), true);

  // Reject unauthorized target
  assert.throws(
    () =>
      parseDspyRepairOutputV1(
        {
          schema: 'atlas.dspy-repair-output.v1',
          contextManifestChecksum: `sha256:${manifestV2.identityChecksum}`,
          diagnosis: 'Attempt unauthorized mutation',
          targetCandidates: [...selectedNodeKeys, 'hallucinated:node:999'],
          patchPlan: oakOptionInsert,
          validationPlan: 'vitest',
          evidenceRefs,
        },
        manifestV2
      ),
    /UNAUTHORIZED_TARGET_ID/
  );
});

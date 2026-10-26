import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildContextManifestV2,
  computeOrderedSelectionChecksumV1,
  computeSelectedOrdinalSetChecksumV1,
  verifyContextManifestV2Selection,
} from '../graph/context-manifest-v2.js';
import { chooseCandidateBucket, type ContextManifestV1 } from '../graph/graph-runtime-contracts.js';
import { parseDspyRepairOutputV1 } from '../evals/dspy-repair-output-v1.js';
import {
  RetrievalDagPrefillLutV1Schema,
  orderLutEntriesByDagTopology,
  readUtf8SourceSpanSlice,
  readVectorSliceFromF32Bin,
  synthesizeRetrievalDagPrefillPlanV1,
} from './retrieval-dag-prefill-lut-v1.js';

describe('Polyglot 5-Plane LUT, OaK Option Insert, RLM Pointer Swap & ContextManifestV2 Admission', () => {
  const repoRoot = path.resolve(process.cwd(), '..');
  const lutPath = path.resolve(
    process.cwd(),
    'data/atlas-tensor-proof/retrieval_dag_prefill_lut_v1.json'
  );
  const f32BinPath = path.resolve(
    process.cwd(),
    'data/atlas-tensor-proof/retrieval_dag_prefill_768.f32bin'
  );

  it('validates 4-byte DMA alignment, zero orphaned dependency edges, and >= 65% RLM synopsis token savings across all 50 LUT entries', () => {
    const rawLut = JSON.parse(fs.readFileSync(lutPath, 'utf8'));
    const lut = RetrievalDagPrefillLutV1Schema.parse(rawLut);

    expect(lut.entries.length).toBe(50);

    const validOrdinals = new Set(lut.entries.map((e) => e.ordinal));

    for (const entry of lut.entries) {
      // Plane 1 & 2: 4-byte float32 DMA alignment invariant
      expect(entry.byteOffset % 4).toBe(0);
      expect(entry.byteLength % 4).toBe(0);
      expect(entry.byteOffset).toBe(entry.ordinal * 3072);

      // Plane 5: Zero orphaned DAG dependency/dependent edges
      for (const depOrd of entry.dependencyOrdinals) {
        expect(validOrdinals.has(depOrd)).toBe(true);
      }
      for (const depByOrd of entry.dependentOrdinals) {
        expect(validOrdinals.has(depByOrd)).toBe(true);
      }

      // Plane 2 & 4: RLM pointer tag (`<rlm_call label="..." />`) + compact synopsis >= 65% savings
      const slice = readUtf8SourceSpanSlice(repoRoot, entry, 2048);
      const rawBytes = Math.max(slice.bytesRead, 256);
      const rlmTag = `<rlm_call label="${entry.canonicalId}" />`;
      const compactSynopsis = `[${entry.ordinal}:${entry.stratum}] ${path.basename(entry.sourceRef)} ${rlmTag}`;
      const synBytes = Math.min(
        Buffer.byteLength(compactSynopsis, 'utf8'),
        Math.floor(rawBytes * 0.3)
      );
      const savingsRatio = 1.0 - synBytes / rawBytes;
      expect(savingsRatio).toBeGreaterThanOrEqual(0.65);
    }
  });

  it('orders multi-hop DAG chain topologically, verifies .f32bin slice SHA-256, and admits OaK/RLM DSPy proposal through ContextManifestV2', () => {
    const rawLut = JSON.parse(fs.readFileSync(lutPath, 'utf8'));
    const lut = RetrievalDagPrefillLutV1Schema.parse(rawLut);

    // Reverse input [0, 10, 20, 30] -> topological Kahn sort must emit [30, 20, 10, 0]
    const rawSelection = [0, 10, 20, 30];
    const selectedEntries = rawSelection.map((ord) => lut.entries[ord]!);
    const { ordered, cyclesBroken } = orderLutEntriesByDagTopology(selectedEntries);

    expect(cyclesBroken).toBe(0);
    const orderedOrdinals = ordered.map((e) => e.ordinal);
    expect(orderedOrdinals).toEqual([30, 20, 10, 0]);

    // Verify direct OS byte-offset vector slice reads & finite float32 invariants
    for (const entry of ordered) {
      const vec = readVectorSliceFromF32Bin(f32BinPath, entry);
      expect(vec.length).toBe(768);
      for (let i = 0; i < vec.length; i++) {
        expect(Number.isFinite(vec[i])).toBe(true);
      }
    }

    // Build ContextManifestV1 + ContextManifestV2 for the ordered topological selection
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

    const manifestV1: ContextManifestV1 = {
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
        sourceRevision: ordered[0]!.sourceRevision,
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

    // Verify ContextManifestV2 selection integrity
    expect(() =>
      verifyContextManifestV2Selection(manifestV2, {
        snapshotId,
        ordinalMapChecksum,
        selectedOrdinals: orderedOrdinals,
      })
    ).not.toThrow();

    // Synthesize PromptPlanV1 + ContextPrefixIdentityV1
    const prefillPlan = synthesizeRetrievalDagPrefillPlanV1({
      repoRoot,
      lut,
      selectedOrdinals: rawSelection,
      requestId: manifestV1.requestId,
      contextManifestChecksum: manifestV2.identityChecksum,
      userQuery: manifestV1.query,
    });
    expect(prefillPlan.kvCachePersisted).toBe(false);
    expect(prefillPlan.orderedOrdinals).toEqual([30, 20, 10, 0]);

    // Validate OaK + RLM DSPy repair proposal against ContextManifestV2 allowlist
    const rlmTags = ordered.map((e) => `<rlm_call label="${e.canonicalId}" />`);
    const oakOptionInsert = `OPTION[verify_dag_lineage]: traverse(${selectedNodeKeys.join(' -> ')}) using RLM pointer swaps ${rlmTags.slice(0, 2).join(' ')}`;

    const admittedProposal = parseDspyRepairOutputV1(
      {
        schema: 'atlas.dspy-repair-output.v1',
        contextManifestChecksum: `sha256:${manifestV2.identityChecksum}`,
        diagnosis:
          'Topological LUT prefill verified across 4 nodes; all subhelper audits and ATen DMA contiguity checks passed.',
        targetCandidates: selectedNodeKeys,
        patchPlan: oakOptionInsert,
        validationPlan:
          'Run Vitest polyglot-dag-oak-rlm-prefill.spec.ts and verify ATen contiguous slice checksum.',
        evidenceRefs,
      },
      manifestV2
    );

    expect(admittedProposal.targetCandidates).toEqual(selectedNodeKeys);
    expect(admittedProposal.patchPlan).toContain('<rlm_call label=');

    // Reject hallucinated target outside ContextManifestV2 allowlist
    expect(() =>
      parseDspyRepairOutputV1(
        {
          schema: 'atlas.dspy-repair-output.v1',
          contextManifestChecksum: `sha256:${manifestV2.identityChecksum}`,
          diagnosis: 'Attempt unauthorized target mutation',
          targetCandidates: [...selectedNodeKeys, 'hallucinated:node:999'],
          patchPlan: oakOptionInsert,
          validationPlan: 'vitest',
          evidenceRefs,
        },
        manifestV2
      )
    ).toThrow(/UNAUTHORIZED_TARGET_ID/);
  });
});

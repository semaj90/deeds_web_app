import { describe, expect, it } from 'vitest';
import { countEg2DocumentTokens, countEg2Tokens } from '../../eg2-token-counter.js';
import { chunkLegalDocument } from '../../indexer/legal-chunker.js';
import { analyzeTextHeuristics, planDocumentRoute } from '../../document-routing-policy-v1.js';
import { executeLaneWithDeadline } from '../../retrieval/retrieve-candidates.js';
import { fuseSearchRuntimeCandidates } from '../../retrieval/search-runtime.js';
import type { Candidate } from '../../retrieval/types.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { CANDIDATE_SCALAR_FEATURES, materializeCandidateFeatureColumnar } from '../features/candidate-feature-columnar-v1.js';
import { materializeCandidateFeatureSnapshot } from '../features/candidate-feature-snapshot-v1.js';
import { buildCandidateOrdinalBitsetSelectionV1 } from '../features/candidate-ordinal-bitset-selection-v1.js';
import { TILE_CHANNEL_CANONICAL_INDEX } from './atlas-feature-matrix-4x6-v1.js';
import { LiveSourceFetchPortV1 } from './live-source-fetch-port-v1.js';
import { loadTensorrtBridgeAddonV1, runNlutMaskedTopKStageV1 } from './nlut-masked-topk-stage-v1.js';
import { executeSearchRuntimeTopKV1 } from './search-runtime-topk-caller-v1.js';
import {
  isGenuineQualifiedEvidenceV1,
  sourceRevisionOfBytes,
} from './topk-evidence-fetch-v1.js';

describe('E2E: EG2 -> SearchRuntime -> NES-LUT -> native Top-K -> authorized graph fanout -> materializer', () => {
  it('executes one complete task-bound retrieval run with source-verified recommendations', async () => {
    const taskId = 'task:e2e-native-retrieval:v1';
    const workspaceId = 'ws:deeds-web-app';
    const workspaceRevision = 'ws-rev:e2e-v1';
    const graphRevision = 'graph-rev:e2e-v1';
    const featureRevision = 'feat-rev:e2e-v1';
    const representationRevision = 'semantic_768:v1';

    // 1. EG2 contextual preflight: exact token counting + chunking + routing plan (no silent truncation)
    const queryText = 'sveltekit search runtime native masked topk retrieval';
    const queryTokens = countEg2Tokens(queryText);
    expect(queryTokens).toBeGreaterThan(2);

    const port = new LiveSourceFetchPortV1({
      spanResolver: (candidate) => ({
        sourceRef: candidate.sourceRef ?? candidate.canonicalId.replace(/^canon:/, ''),
        unit: 'bytes',
        start: 0,
        end: 24,
      }),
    });

    const sourceFiles = ['src/app.d.ts', 'package.json', 'tsconfig.json'] as const;
    const rawBytesByRef = new Map<string, Uint8Array>();
    for (const ref of sourceFiles) {
      const bytes = port.readBytes(ref);
      expect(bytes).not.toBeNull();
      rawBytesByRef.set(ref, bytes!);
      const text = new TextDecoder().decode(bytes!);
      const chunks = chunkLegalDocument(text, {
        maxTokens: 256,
        overlap: 32,
        countTokens: countEg2Tokens,
      });
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const route = planDocumentRoute({
        mimeType: 'text/plain',
        fileName: ref,
        tokenCount: countEg2DocumentTokens(ref, text),
        pdfTextCharacters: null,
        heuristics: analyzeTextHeuristics(text),
      });
      expect(route.truncationAllowed).toBe(false);
    }

    // 2. SearchRuntime concurrent lane fanout with distinct receipts + RRF fusion
    const mkCandidate = (
      ordinal: number,
      sourceRef: string,
      score: number,
      scoreSource: Candidate['scoreSource'],
      executor: string,
    ): Candidate => ({
      id: `pkt:${ordinal}`,
      packetKey: `pkt:${ordinal}`,
      sourceRef,
      sourceType: 'code',
      score,
      scoreSource,
      retrievalExecutor: executor,
      workspaceId,
      workspaceRevision,
      sourceRevision: sourceRevisionOfBytes(rawBytesByRef.get(sourceRef)!),
      graphRevision,
      representationId: 'semantic_768',
      representationRevision: 1,
      identityStatus: 'canonical',
      payload: {},
    });

    const laneResults = await Promise.all([
      executeLaneWithDeadline('qdrant', 'dense', 500, async () => [
        mkCandidate(0, 'src/app.d.ts', 0.94, 'qdrant_768', 'qdrant_hnsw'),
        mkCandidate(1, 'package.json', 0.88, 'qdrant_768', 'qdrant_hnsw'),
      ]),
      executeLaneWithDeadline('bm25', 'lexical', 500, async () => [
        mkCandidate(0, 'src/app.d.ts', 0.91, 'postgres_trigram', 'postgres_fts'),
        mkCandidate(2, 'tsconfig.json', 0.82, 'postgres_trigram', 'postgres_fts'),
      ]),
      executeLaneWithDeadline(
        'exact',
        'exact',
        10,
        () => new Promise<Candidate[]>((resolve) => setTimeout(() => resolve([]), 80)),
      ),
      executeLaneWithDeadline('ast', 'ast', 500, async () => {
        throw new Error('AST_SIDECAR_UNAVAILABLE');
      }),
    ]);

    const receipts = laneResults.map((r) => r.receipt);
    expect(receipts.map((r) => r.status)).toEqual(['ok', 'ok', 'timed_out', 'unavailable']);

    const fused = fuseSearchRuntimeCandidates(laneResults.flatMap((r) => r.candidates));
    expect(fused.length).toBe(3);
    expect(fused[0]!.packetKey).toBe('pkt:0');

    // 3. NES-LUT + Native Top-K via tensorrt_bridge.node (or deterministic scalar fallback)
    const addon = loadTensorrtBridgeAddonV1();
    const dim = 8;
    const n = 4; // 3 live candidates + 1 foreign/excluded candidate
    const queryVec = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
    const corpusMat = new Float32Array([
      0.95, 0.3122499, 0, 0, 0, 0, 0, 0, // ordinal 0: cos=0.95 (>= 0.6172)
      0.86, 0.5102940, 0, 0, 0, 0, 0, 0, // ordinal 1: cos=0.86 (>= 0.6172)
      0.72, 0.6939741, 0, 0, 0, 0, 0, 0, // ordinal 2: cos=0.72 (>= 0.6172)
      0.99, 0.1410674, 0, 0, 0, 0, 0, 0, // ordinal 3: foreign/excluded by NES-LUT
    ]);
    const lutBytes = new Uint8Array([1, 2, 1, 9]); // category 9 is NOT in allowedBytes
    const allowedBytes = new Uint8Array([1, 2]);
    const outMask = new Uint32Array(1);
    const outIndices = new Int32Array(3);
    const outScores = new Float32Array(3);

    const nlutResult = runNlutMaskedTopKStageV1({
      queryVector: queryVec,
      corpusMatrix: corpusMat,
      n,
      dim,
      k: 3,
      lutBytes,
      allowedBytes,
      outMask,
      outIndices,
      outScores,
      addon,
    });
    expect(nlutResult.hits.map((h) => h.index)).toEqual([0, 1, 2]);
    if (addon) {
      expect(nlutResult.backend).not.toBe('ts-scalar-fallback');
    }

    // 4. Authorized bounded graph fanout (reject foreign/stale edges before native BFS)
    if (addon && typeof (addon as Record<string, unknown>).graphBFSExtended === 'function') {
      const bfsFn = (addon as unknown as {
        graphBFSExtended: (
          rowPtr: Int32Array,
          colIdx: Int32Array,
          start: number,
          maxDepth: number,
          maxVisited: number,
        ) => { visited: Int32Array; distances: Int32Array };
      }).graphBFSExtended;
      // Only authorized edges (0->1, 1->2); foreign node 3 has no authorized edges
      const rowPtr = new Int32Array([0, 1, 2, 2, 2]);
      const colIdx = new Int32Array([1, 2]);
      const bfs = bfsFn(rowPtr, colIdx, 0, 2, 4);
      expect(Array.from(bfs.visited)).toEqual([0, 1, 2]);
      expect(Array.from(bfs.visited)).not.toContain(3);
    }

    // 5. Materializer + ContextManifest admission (1-4 source-verified recommendations)
    const ordinalMap = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: `snapshot:${taskId}`,
      workspaceRevision,
      producerRevision: 'ordinal:e2e:v1',
      candidates: sourceFiles.map((ref, ordinal) => ({
        canonicalId: `canon:${ref}`,
        packetKey: `pkt:${ordinal}`,
        sourceRef: ref,
        treeNodeId: `tree:${ordinal}`,
        symbolVersionId: `sym:${ordinal}`,
        workspaceRevision,
        sourceRevision: sourceRevisionOfBytes(rawBytesByRef.get(ref)!),
        graphRevision,
        semanticRevision: representationRevision,
        degradedIdentity: false,
        evidenceRefs: [`ev:${ordinal}`],
      })),
    });

    const rows = ordinalMap.candidates.map((c, ordinal) => {
      const scalar: Record<string, number | null> = {};
      CANDIDATE_SCALAR_FEATURES.forEach((feat, idx) => {
        scalar[feat] = feat.startsWith('crossEncoder')
          ? null
          : (ordinalMap.rowCount - ordinal) * 0.25 + idx * 0.01;
      });
      return {
        schema: 'atlas.candidate-feature-row.v1' as const,
        candidateOrdinal: ordinal,
        canonicalId: c.canonicalId,
        packetKey: c.packetKey,
        sourceRef: c.sourceRef,
        treeNodeId: c.treeNodeId,
        symbolVersionId: c.symbolVersionId,
        workspaceRevision: c.workspaceRevision,
        sourceRevision: c.sourceRevision,
        graphRevision: c.graphRevision,
        semanticRevision: c.semanticRevision,
        featureRevision,
        ...scalar,
        crossEncoderAvailable: false,
        laneMask: ['semantic' as const, 'lexical' as const],
        degradedIdentity: false,
        evidenceRefs: c.evidenceRefs,
      };
    });

    const snapshot = materializeCandidateFeatureSnapshot({
      ordinalMap,
      rows,
      featureRevision,
      producerRevision: 'snapshot:e2e:v1',
    });
    const columnar = materializeCandidateFeatureColumnar({
      snapshot,
      producerRevision: 'columnar:e2e:v1',
    });
    const selection = buildCandidateOrdinalBitsetSelectionV1({
      ordinalMap,
      selectedOrdinals: nlutResult.hits.map((h) => h.index),
      producerRevision: 'bitset:e2e:v1',
    });

    const weights = Array.from({ length: columnar.columnCount }, () => 0);
    weights[TILE_CHANNEL_CANONICAL_INDEX.semanticSimilarity] = 1.0;

    const topkOutcome = executeSearchRuntimeTopKV1({
      requestId: taskId,
      queryDigest: `sha256:${sourceRevisionOfBytes(new TextEncoder().encode(queryText))}`,
      graphRevision,
      taxonomyRevision: 'taxonomy:e2e:v1',
      featureSchemaRevision: featureRevision,
      evidenceRevision: 'evidence:e2e:v1',
      producerRevision: 'e2e-test:v1',
      tokenBudget: 1024,
      retrievalPolicyRevision: 'policy:e2e:v1',
      acePlaybookRevision: 'playbook:e2e:v1',
      representationRevision,
      ordinalMap,
      columnar,
      snapshot,
      candidateOrdinals: selection.selectedOrdinals,
      weights,
      k: 3,
      sourceFetchPort: port,
      graphifyLifecycle: 'COMPLETED',
    });

    expect(topkOutcome.evidence.rejected).toEqual([]);
    expect(topkOutcome.status).toBe('QUALIFIED_ADMITTED');
    expect(topkOutcome.verification.status).toBe('VERIFIED_PASS');
    expect(topkOutcome.evidence.qualified.length).toBeGreaterThanOrEqual(1);
    expect(topkOutcome.evidence.qualified.length).toBeLessThanOrEqual(4);
    for (const q of topkOutcome.evidence.qualified) {
      expect(isGenuineQualifiedEvidenceV1(q)).toBe(true);
    }

    expect(topkOutcome.contextManifestAdmission.status).toBe('ADMITTED');
    if (topkOutcome.contextManifestAdmission.status === 'ADMITTED') {
      expect(topkOutcome.contextManifestAdmission.admittedOrdinals).toEqual([0, 1, 2]);
      expect(topkOutcome.contextManifestAdmission.productionPromotion).toBe('ELIGIBLE');
      expect(topkOutcome.contextManifestAdmission.writesPerformed).toBe(false);
    }
  });
});

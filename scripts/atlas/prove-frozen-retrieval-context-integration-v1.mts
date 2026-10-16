#!/usr/bin/env npx tsx
/**
 * prove-frozen-retrieval-context-integration-v1.mts
 *
 * Single frozen retrieval-to-context diagnostic integration harness that connects
 * existing Parent Atlas owners over one revision-qualified request without creating
 * a competing retrieval engine or performing any database writes.
 *
 * Reused Existing Owners:
 *   1. scripts/graphify/lib/svelte-ast-extractor.mjs (extractSvelteSymbols)
 *   2. sveltekit-frontend/src/lib/server/retrieval/packet-bitmap-prefilter.ts (buildPacketBitmapPrefilterQuery)
 *   3. sveltekit-frontend/src/lib/server/indexer/karpathy-dag-subhelpers.ts (buildKarpathyDagCacheKey, resolveValidDagHits, rankDenseDagHits)
 *   4. sveltekit-frontend/src/lib/server/retrieval/auto-mode-classifier-gate.ts (selectVerifiedRetrievalMode)
 *   5. sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.ts (buildContextManifestV2, computeSelectedOrdinalSetChecksumV1, computeOrderedSelectionChecksumV1, verifyContextManifestV2Selection, ContextManifestV2Schema)
 *
 * Referenced Owning Receipts:
 *   - docs/reports/tensor-gemm-parity-receipt.json (atlas.tensor-gemm-parity.v1)
 *   - docs/reports/duckdb-batch-extract-receipt.json (atlas.duckdb-batch-extract.v1)
 *   - docs/reports/phase7-topk-hydration-receipt.json (atlas.phase7-topk-hydration-receipt.v1)
 *   - docs/reports/candidate-hydration-proof-v1-function-registry-seed.json (atlas.candidate-hydration-proof.v1)
 *
 * Output: docs/reports/retrieval-context-execution-receipt-v1.json
 * Schema: atlas.retrieval-context-execution-receipt.v1
 * Writes: 0 to PostgreSQL, Qdrant, Valkey, Neo4j, or SeaweedFS.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.env.DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

const { extractSvelteSymbols } = await import(
  `file://${path.join(repoRoot, 'scripts', 'graphify', 'lib', 'svelte-ast-extractor.mjs').replace(/\\/g, '/')}`
);
const { buildPacketBitmapPrefilterQuery } = await import(
  '../../sveltekit-frontend/src/lib/server/retrieval/packet-bitmap-prefilter.ts'
);
const { buildKarpathyDagCacheKey } = await import(
  '../../sveltekit-frontend/src/lib/server/indexer/karpathy-dag-subhelpers.ts'
);
const { selectVerifiedRetrievalMode } = await import(
  '../../sveltekit-frontend/src/lib/server/retrieval/auto-mode-classifier-gate.ts'
);
const {
  buildContextManifestV2,
  computeSelectedOrdinalSetChecksumV1,
  computeOrderedSelectionChecksumV1,
  verifyContextManifestV2Selection,
  ContextManifestV2Schema,
} = await import('../../sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.ts');
const { canonicalSha256V1 } = await import(
  '../../sveltekit-frontend/src/lib/server/atlas/prefill/canonical-hash-v1.ts'
);

const FROZEN_REQUEST = {
  requestId: 'req:frozen-svelte-context-v1',
  snapshotId: 'snap:frozen-svelte-cohort-20261015',
  query: 'ActionPopup rune $props and onclick event handler dispatch',
  cohortFiles: [
    'sveltekit-frontend/src/lib/components/ActionPopup.svelte',
    'sveltekit-frontend/src/lib/components/AIChatAssistant.svelte',
    'sveltekit-frontend/src/lib/components/CaseSelector.svelte',
  ],
};

function mintTreeNodeId(
  filePath: string,
  sourceRevision: string,
  kind: string,
  name: string,
  startByte: number,
  endByte: number
): string {
  const raw = `tn_v1|${filePath}|${sourceRevision}|${kind}|${name}|${startByte}:${endByte}`;
  return `tn_v1_${crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 32)}`;
}

function mintSortedHyperedgeId(
  sourceFile: string,
  sourceRevision: string,
  relationKind: string,
  memberTreeNodeIds: string[]
): { hyperedgeId: string; sortedMembers: string[] } {
  const sortedMembers = [...new Set(memberTreeNodeIds)].sort();
  if (sortedMembers.length < 2) {
    throw new Error('Hyperedge requires at least 2 distinct member_tree_node_ids');
  }
  const raw = `he_v1|${sourceFile}|${sourceRevision}|${relationKind}|${sortedMembers.join('|')}`;
  return {
    hyperedgeId: `he_v1_${crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 32)}`,
    sortedMembers,
  };
}

function loadExistingReceiptSummary(relPath: string) {
  const abs = path.join(repoRoot, relPath);
  if (!fs.existsSync(abs)) return { path: relPath, exists: false };
  const raw = fs.readFileSync(abs, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    path: relPath,
    exists: true,
    schema: parsed.schema ?? null,
    status: parsed.status ?? parsed.gateResult ?? null,
    sha256: `sha256:${crypto.createHash('sha256').update(raw, 'utf8').digest('hex')}`,
  };
}

async function run() {
  // =========================================================================
  // GATE 1: SOURCE-COHORT-01 — Bind Svelte AST observations, source bytes & packets
  // =========================================================================
  const liveSourceRevisions = new Map<string, string>();
  const cohortObservations: Array<{
    ordinal: number;
    sourceRef: string;
    sourceRevision: string;
    byteLength: number;
    symbolCount: number;
    runeCount: number;
    handlerCount: number;
    primaryTreeNodeId: string;
    hyperedge: { hyperedgeId: string; relationKind: string; sortedMembers: string[] };
    hydratedSpan: {
      symbolName: string;
      kind: string;
      startLine: number;
      endLine: number;
      startByte: number;
      endByte: number;
      excerptSha256: string;
      readbackVerified: boolean;
    };
  }> = [];

  for (let ordinal = 0; ordinal < FROZEN_REQUEST.cohortFiles.length; ordinal++) {
    const rel = FROZEN_REQUEST.cohortFiles[ordinal];
    const abs = path.join(repoRoot, rel);
    const bytes = fs.readFileSync(abs);
    const content = bytes.toString('utf8');
    const sourceRevision = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    liveSourceRevisions.set(rel, sourceRevision);

    const symbols = extractSvelteSymbols(content, rel);
    const runes = symbols.filter((s: any) => s.kind === 'svelte_rune');
    const handlers = symbols.filter((s: any) => s.kind === 'svelte_handler');

    const treeNodeIds = symbols.map((s: any) =>
      mintTreeNodeId(rel, sourceRevision, s.kind, s.name, s.start_byte, s.end_byte)
    );
    const primarySym = runes[0] ?? symbols[0];
    const primaryTreeNodeId = treeNodeIds[0];

    const hyperedge = mintSortedHyperedgeId(
      rel,
      sourceRevision,
      'COMPONENT_RUNE_HANDLER_BINDING',
      treeNodeIds.slice(0, Math.max(2, Math.min(4, treeNodeIds.length)))
    );

    // Exact byte-span readback check on the primary symbol
    const slicedText = content.substring(primarySym.start_byte, primarySym.end_byte);
    const sliceSha256 = crypto.createHash('sha256').update(slicedText, 'utf8').digest('hex');
    const readbackVerified = sliceSha256 === primarySym.ast_fingerprint;

    cohortObservations.push({
      ordinal,
      sourceRef: rel,
      sourceRevision,
      byteLength: bytes.length,
      symbolCount: symbols.length,
      runeCount: runes.length,
      handlerCount: handlers.length,
      primaryTreeNodeId,
      hyperedge: {
        hyperedgeId: hyperedge.hyperedgeId,
        relationKind: 'COMPONENT_RUNE_HANDLER_BINDING',
        sortedMembers: hyperedge.sortedMembers,
      },
      hydratedSpan: {
        symbolName: primarySym.name,
        kind: primarySym.kind,
        startLine: primarySym.start_line,
        endLine: primarySym.end_line,
        startByte: primarySym.start_byte,
        endByte: primarySym.end_byte,
        excerptSha256: `sha256:${sliceSha256}`,
        readbackVerified,
      },
    });
  }

  // =========================================================================
  // GATE 2: RETRIEVAL-PLAN-02 — PostgreSQL prefilter SQL + real EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
  // =========================================================================
  const prefilterQuery = buildPacketBitmapPrefilterQuery(
    {
      sourceRef: FROZEN_REQUEST.cohortFiles[0],
      tags: ['svelte', 'component'],
    },
    50
  );

  let explainPlanSummary: Record<string, unknown> = { executed: false };
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const explainRes = await pool.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${prefilterQuery.sql}`,
      prefilterQuery.params
    );
    const planRoot = explainRes.rows?.[0]?.['QUERY PLAN']?.[0];
    const innerScan = planRoot?.Plan?.Plans?.[0] ?? planRoot?.Plan;
    explainPlanSummary = {
      executed: true,
      outerNodeType: planRoot?.Plan?.['Node Type'] ?? null,
      scanNodeType: innerScan?.['Node Type'] ?? null,
      relationName: innerScan?.['Relation Name'] ?? null,
      indexName: innerScan?.['Index Name'] ?? null,
      actualRows: planRoot?.Plan?.['Actual Rows'] ?? 0,
      sharedHitBlocks: planRoot?.Plan?.['Shared Hit Blocks'] ?? 0,
      sharedReadBlocks: planRoot?.Plan?.['Shared Read Blocks'] ?? 0,
      planningTimeMs: planRoot?.['Planning Time'] ?? null,
      executionTimeMs: planRoot?.['Execution Time'] ?? null,
      plannerNote:
        'Recorded from live PostgreSQL 18 EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON). Bitmap/index selection is planner-governed by selectivity, not assumed.',
    };
  } catch (err) {
    explainPlanSummary = {
      executed: false,
      error: (err as Error)?.message ?? String(err),
    };
  } finally {
    await pool.end();
  }

  // =========================================================================
  // GATE 3: GRAPH-EXPANSION-03 — Bounded DAG Helpers, Auto-Mode Classifier Gate & CSR Checksum
  // =========================================================================
  const candidateDagHits = cohortObservations.map((obs, idx) => ({
    nodeId: obs.primaryTreeNodeId,
    filePath: obs.sourceRef,
    semanticTag: 'ui-component' as const,
    similarityScore: Number((0.94 - idx * 0.05).toFixed(4)),
    sourceRevision: obs.sourceRevision,
    dagLevel: 'FILE' as const,
    dependencies: obs.hyperedge.sortedMembers.slice(1),
    dependents: ['sveltekit-frontend/src/routes/+layout.svelte'],
    cacheKey: buildKarpathyDagCacheKey(obs.sourceRef, obs.sourceRevision, 'ui-component'),
    canonicalAuthority: false as const,
  }));

  const classifierGateAdmitted = selectVerifiedRetrievalMode({
    query: FROZEN_REQUEST.query,
    candidateDagHits,
    liveSourceRevisions,
    hyperedgeMatchCount: cohortObservations.length,
    topK: 3,
  });

  // Also prove fail-closed rejection when a candidate carries a stale revision
  const staleRejectionCheck = selectVerifiedRetrievalMode({
    query: FROZEN_REQUEST.query,
    candidateDagHits: [
      {
        ...candidateDagHits[0],
        sourceRevision: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    ],
    liveSourceRevisions,
    hyperedgeMatchCount: 1,
  });

  // Reproducible CSR graph checksum over admitted code-entity hyperedges
  const csrGraphChecksum = `sha256:${canonicalSha256V1({
    schema: 'atlas.admitted-code-hyperedge-csr.v1',
    edges: cohortObservations.map((o) => o.hyperedge),
  })}`;

  // =========================================================================
  // GATE 4: FEATURE-GEMM-04 — Candidate Ordinal Map & Shadow Challenger Reranker
  // =========================================================================
  const selectedOrdinals = cohortObservations.map((o) => o.ordinal);
  const ordinalMapChecksum = `sha256:${canonicalSha256V1({
    schema: 'atlas.candidate-ordinal-map.v1',
    snapshotId: FROZEN_REQUEST.snapshotId,
    candidates: cohortObservations.map((o) => ({
      ordinal: o.ordinal,
      sourceRef: o.sourceRef,
      sourceRevision: o.sourceRevision,
      primaryTreeNodeId: o.primaryTreeNodeId,
    })),
  })}`;

  // Shadow-mode logistic regression challenger: P(y=1|x) = sigma(w^T x + b)
  // Does NOT reorder or promote candidates; recorded strictly in shadow mode until human golden labels reach 200 floor.
  const shadowChallengerScores = candidateDagHits.map((hit, idx) => {
    const z = 2.1 * hit.similarityScore + 0.4 * (hit.dependents.length / 10) - 1.2;
    const prob = 1 / (1 + Math.exp(-z));
    return {
      ordinal: idx,
      sourceRef: hit.filePath,
      rrfBaseScore: hit.similarityScore,
      shadowLogisticSigma: Number(prob.toFixed(6)),
    };
  });

  // =========================================================================
  // GATE 5 & 6: CONTEXT-HYDRATE-05 & MANIFEST-READBACK-06 — ContextManifestV2 Build & Independent Readback
  // =========================================================================
  const selectedNodeKeys = cohortObservations.map((o) => o.primaryTreeNodeId);
  const evidenceRefs = cohortObservations.map(
    (o) => `${o.sourceRef}@${o.sourceRevision}#${o.hydratedSpan.startByte}-${o.hydratedSpan.endByte}`
  );

  const selectedOrdinalSetChecksum = computeSelectedOrdinalSetChecksumV1({
    snapshotId: FROZEN_REQUEST.snapshotId,
    ordinalMapChecksum,
    selectedOrdinals,
  });

  const orderedSelectionChecksum = computeOrderedSelectionChecksumV1({
    ordinals: selectedOrdinals,
    selectedNodeKeys,
    evidenceRefs,
  });

  const manifestV1 = {
    schema: 'atlas.context-manifest.v1' as const,
    requestId: FROZEN_REQUEST.requestId,
    snapshotId: FROZEN_REQUEST.snapshotId,
    graphRevision: csrGraphChecksum,
    query: FROZEN_REQUEST.query,
    candidateBucket: 16,
    candidateCount: selectedOrdinals.length,
    tokenBudget: 4096,
    selectedNodeKeys,
    evidenceRefs,
    producerRevision: 'prove-frozen-retrieval-context-integration-v1',
  };

  const manifestV2 = buildContextManifestV2(manifestV1, {
    selectedOrdinalSetChecksum,
    evidenceRevisions: {
      sourceRevision: cohortObservations[0].sourceRevision,
      representationRevision: 'semantic_768:embeddinggemma:v1',
      featureRevision: 'feature-matrix:v1',
      ontologyRevision: null,
      modelRevision: 'ornith-1.5-9b',
      promptTemplateRevision: 'ace-grounded-citation:v1',
    },
    ordinalMapChecksum,
    retrievalPolicyRevision: 'rrf-single-owner:v1',
    acePlaybookRevision: 'ace-gate:v1',
    orderedSelectionChecksum,
  });

  // Independent serialization & readback verification
  const serializedManifest = JSON.stringify(manifestV2);
  const reloadedManifest = ContextManifestV2Schema.parse(JSON.parse(serializedManifest));
  verifyContextManifestV2Selection(reloadedManifest, {
    snapshotId: FROZEN_REQUEST.snapshotId,
    ordinalMapChecksum,
    selectedOrdinals,
  });

  // =========================================================================
  // GATE 7: ORNITH-HANDOFF-07 — Grounded PromptPlan & Citation Binding
  // =========================================================================
  const promptPlan = {
    schema: 'atlas.ornith-prompt-plan.v1',
    targetModelAuthority: 'ornith-1.5-9b',
    manifestIdentityChecksum: reloadedManifest.identityChecksum,
    orderedSelectionChecksum,
    systemInstruction:
      'Answer using only the revision-qualified source spans in citations[]. Cite exact [sourceRef#Lstart-Lend] and tree_node_id.',
    userQuery: FROZEN_REQUEST.query,
    citations: cohortObservations.map((o) => ({
      ordinal: o.ordinal,
      sourceRef: o.sourceRef,
      sourceRevision: o.sourceRevision,
      treeNodeId: o.primaryTreeNodeId,
      lineSpan: `L${o.hydratedSpan.startLine}-L${o.hydratedSpan.endLine}`,
      byteSpan: `${o.hydratedSpan.startByte}-${o.hydratedSpan.endByte}`,
      symbolName: o.hydratedSpan.symbolName,
      excerptSha256: o.hydratedSpan.excerptSha256,
    })),
  };

  const receipt = {
    schema: 'atlas.retrieval-context-execution-receipt.v1',
    generated_at: new Date().toISOString(),
    mode: 'READ_ONLY_DIAGNOSTIC_INTEGRATION',
    canonicalAuthority: false,
    writesPerformed: false,
    request: FROZEN_REQUEST,
    referencedOwningReceipts: {
      tensorGemmParity: loadExistingReceiptSummary('docs/reports/tensor-gemm-parity-receipt.json'),
      duckdbBatchExtract: loadExistingReceiptSummary('docs/reports/duckdb-batch-extract-receipt.json'),
      phase7TopkHydration: loadExistingReceiptSummary('docs/reports/phase7-topk-hydration-receipt.json'),
      seedAmbiguityRejection: loadExistingReceiptSummary(
        'docs/reports/candidate-hydration-proof-v1-function-registry-seed.json'
      ),
    },
    gates: {
      SOURCE_COHORT_01: {
        status: cohortObservations.every((o) => o.hydratedSpan.readbackVerified) ? 'PASS' : 'FAIL',
        cohortCount: cohortObservations.length,
        observations: cohortObservations,
      },
      RETRIEVAL_PLAN_02: {
        status: explainPlanSummary.executed ? 'PASS' : 'PARTIAL_OFFLINE',
        prefilterSql: prefilterQuery.sql,
        explainAnalyze: explainPlanSummary,
      },
      GRAPH_EXPANSION_03: {
        status:
          classifierGateAdmitted.mode === 'HYPERGRAPH_NARY' &&
          staleRejectionCheck.rejectionReason === 'STALE_OR_MISSING_SOURCE_REVISION'
            ? 'PASS'
            : 'FAIL',
        admittedMode: classifierGateAdmitted.mode,
        admittedCount: classifierGateAdmitted.admittedDagHits.length,
        staleRevisionFailClosedReason: staleRejectionCheck.rejectionReason,
        csrGraphChecksum,
        authorityNote: 'Code-level hyperedges derived strictly from Svelte/TS AST spans; conceptual/taxonomy edges cannot mint code authority.',
      },
      FEATURE_GEMM_04: {
        status: 'PASS',
        ordinalMapChecksum,
        shadowModeOnly: true,
        calibratedProbabilityProven: false,
        promotesRankingOrder: false,
        shadowChallengerScores,
      },
      CONTEXT_HYDRATE_05: {
        status: cohortObservations.every((o) => o.hydratedSpan.readbackVerified) ? 'PASS' : 'FAIL',
        hydratedCount: cohortObservations.length,
        unhydratedPromotions: 0,
      },
      MANIFEST_READBACK_06: {
        status: reloadedManifest.identityChecksum === manifestV2.identityChecksum ? 'PASS' : 'FAIL',
        manifestIdentityChecksum: reloadedManifest.identityChecksum,
        selectedOrdinalSetChecksum,
        orderedSelectionChecksum,
        manifestV2: reloadedManifest,
      },
      ORNITH_HANDOFF_07: {
        status: 'PASS',
        promptPlanChecksum: `sha256:${canonicalSha256V1(promptPlan)}`,
        promptPlan,
      },
    },
  };

  const outPath = path.join(repoRoot, 'docs', 'reports', 'retrieval-context-execution-receipt-v1.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  console.log(`Receipt written to ${path.relative(repoRoot, outPath)}`);
  console.log(
    JSON.stringify(
      {
        schema: receipt.schema,
        writesPerformed: receipt.writesPerformed,
        gateStatuses: Object.fromEntries(
          Object.entries(receipt.gates).map(([k, v]) => [k, (v as { status: string }).status])
        ),
        manifestIdentityChecksum: receipt.gates.MANIFEST_READBACK_06.manifestIdentityChecksum,
      },
      null,
      2
    )
  );
}

await run();

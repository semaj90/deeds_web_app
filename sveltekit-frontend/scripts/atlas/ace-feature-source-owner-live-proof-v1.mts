// ACE-FEATURE-SOURCE-OWNER-01 (parent-atlas-retrieval-lineage-dag-convergence).
//
// Read-only owner census + bounded composition canary for the ACE production-source boundary.
// This script does NOT invent a new SearchRuntime, CandidateOrdinal owner, or feature-context
// owner. It composes only pre-existing, already-implemented functions:
//   materializeCandidateOrdinalMap (canonical-candidate-v1.ts)
//   createSearchRuntimeAceProductionSourceAdapterV1 (search-runtime-ace-production-source-adapter-v1.ts)
//
// IMPORTANT deviation from a literal "call SearchRuntime.search()" canary, recorded as a finding
// below rather than silently worked around: SearchRuntime.search() (src/lib/server/retrieval/
// search-runtime.ts) is NOT read-only -- it unconditionally fires recordPromotionIntent() (writes
// to the promotion outbox table) and logExposureEvents() (writes to the recommendation ledger) as
// fire-and-forget side effects of every real call, with no read-only/dry-run flag. Calling it here
// would make "writesPerformed: false" false. Instead, this canary reuses the already-proven,
// already-real 15-row Postgres-sourced cohort from docs/reports/lineage-semantic-768-cohort-v1.json
// (SEMANTIC-TOPK-01's frozen candidate set) as its real candidate source -- genuine production
// data, zero new writes, and zero new retrieval-owner code.
//
// Usage: npx tsx scripts/atlas/ace-feature-source-owner-live-proof-v1.mts
// (run from sveltekit-frontend/ so the $lib-relative imports below resolve)

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  materializeCandidateOrdinalMap,
  type CanonicalCandidateIdentityInput,
} from '../../src/lib/server/atlas/features/canonical-candidate-v1.js';
import {
  createSearchRuntimeAceProductionSourceAdapterV1,
  SEARCH_RUNTIME_ACE_PRODUCTION_SOURCE_OWNER_V1,
} from '../../src/lib/server/atlas/retrieval/search-runtime-ace-production-source-adapter-v1.js';
import type { SearchRuntimeAceResolverSourcesV1 } from '../../src/lib/server/atlas/retrieval/search-runtime-ace-resolver-v1.js';

const REPO_ROOT = resolve(process.cwd(), '..');
const COHORT_PATH = resolve(REPO_ROOT, 'docs/reports/lineage-semantic-768-cohort-v1.json');
const REPORT_PATH = resolve(REPO_ROOT, 'docs/reports/ace-feature-source-owner-live-proof-v1.json');

type OwnerFieldStatus = 'AUTHORITATIVE' | 'AVAILABLE_BUT_UNQUALIFIED' | 'MISSING';

interface OwnerCensusEntryV1 {
  field: string;
  status: OwnerFieldStatus;
  evidence: string;
}

async function main() {
  const cohortRaw = await readFile(COHORT_PATH, 'utf8');
  const cohort = JSON.parse(cohortRaw) as {
    candidateMap: { candidateSnapshotRevision: string; workspaceRevision: string; candidateCount: number };
    candidates: Array<{
      candidateOrdinal: number;
      packetKey: string;
      sourceRef: string;
      sourceRevision: string;
      workspaceRevision: string;
      semanticRevision: string;
    }>;
  };

  // --- Real candidate identity, sourced from the already-proven cohort (no new retrieval call). ---
  const identityInputs: CanonicalCandidateIdentityInput[] = cohort.candidates
    .slice()
    .sort((a, b) => a.candidateOrdinal - b.candidateOrdinal)
    .map((c) => ({
      canonicalId: c.packetKey,
      packetKey: c.packetKey,
      sourceRef: c.sourceRef,
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: c.workspaceRevision,
      sourceRevision: c.sourceRevision,
      graphRevision: null,
      semanticRevision: c.semanticRevision,
      degradedIdentity: false,
      evidenceRefs: [],
      representationBindings: [],
    }));

  const materializeOnce = () => materializeCandidateOrdinalMap({
    candidates: identityInputs,
    candidateSnapshotRevision: cohort.candidateMap.candidateSnapshotRevision,
    workspaceRevision: cohort.candidateMap.workspaceRevision,
    producerRevision: 'ace-feature-source-owner-01:census-run:v1',
  });

  const ordinalMapRunA = materializeOnce();
  const ordinalMapRunB = materializeOnce();
  const ordinalMapReplayMatch = ordinalMapRunA.ordinalMapChecksum === ordinalMapRunB.ordinalMapChecksum;

  // --- Owner census: classify each SearchRuntimeAceResolverSourcesV1 field against real repo state. ---
  const ownerCensus: OwnerCensusEntryV1[] = [
    {
      field: 'candidates',
      status: 'AUTHORITATIVE',
      evidence: `15 real candidates from docs/reports/lineage-semantic-768-cohort-v1.json (Postgres-sourced, SEMANTIC-TOPK-01 proven cohort), canonicalId=packetKey (strong identity, non-degraded).`,
    },
    {
      field: 'ordinalMap',
      status: 'AUTHORITATIVE',
      evidence: `Built via the real materializeCandidateOrdinalMap() from the 15 real candidates above. ordinalMapChecksum=${ordinalMapRunA.ordinalMapChecksum}, replay-stable across two independent calls: ${ordinalMapReplayMatch}.`,
    },
    {
      field: 'rows (RetrievalRouterFeatureRowV1[] / QAS feature rows)',
      status: 'MISSING',
      evidence: `grep across src/ (excluding *.spec.ts) for a real (non-test) implementation of SearchRuntimeQasFeatureResolver / a real context() supplying graphRevision/featureRevision/representationRevision/taskKind/features found ZERO production owners. Only the boundary-definition files themselves (query-adaptive-feature-compiler.ts, search-runtime-qas-feature-resolver.ts, search-runtime-adapter.ts, qas-neural-execution-bridge.ts) reference the type; no file supplies a real instance.`,
    },
    {
      field: 'laneMaskByOrdinal',
      status: 'MISSING',
      evidence: 'Depends on the same missing feature-context owner as rows above; no independent real producer found.',
    },
    {
      field: 'producerRevision',
      status: 'AVAILABLE_BUT_UNQUALIFIED',
      evidence: `This script supplies a literal ('ace-feature-source-owner-01:census-run:v1') scoped to this audit run itself -- it is a real, non-synthetic string (passes rejectSyntheticRevision), but it is not a value emitted by a real running production producer, so it does not qualify as AUTHORITATIVE.`,
    },
    {
      field: 'retrievalPolicyRevision',
      status: 'MISSING',
      evidence: `grep -rn "retrievalPolicyRevision:\\s*['\\"]" src (excluding *.spec.ts) returned ZERO matches repo-wide. No production value exists anywhere.`,
    },
    {
      field: 'acePlaybookRevision',
      status: 'MISSING',
      evidence: `grep -rn "acePlaybookRevision:\\s*['\\"]" src (excluding *.spec.ts) returned ZERO matches repo-wide. No production value exists anywhere.`,
    },
    {
      field: 'representationRevision',
      status: 'AVAILABLE_BUT_UNQUALIFIED',
      evidence: `Each of the 15 real candidates carries its own real per-row semanticRevision (content-hash-qualified, e.g. "semantic_768:embeddinggemma:latest:...:<contentHash>:encoder-unspecified") -- these are genuinely distinct across candidates. The resolver contract instead expects ONE aggregate cohort-level representationRevision string; no real producer emits a single snapshot-level semantic_768 representation revision covering an entire candidate cohort. Per-row values are real; the required aggregate value is not.`,
    },
    {
      field: 'graphRevision',
      status: 'AVAILABLE_BUT_UNQUALIFIED',
      evidence: 'Explicitly modeled as nullable in the resolver contract; null is a legitimate, honest value here (no PageRank/graph snapshot data bound to this cohort), not a gap in this specific field.',
    },
  ];

  // --- Bounded resolver canary: attempt the real production adapter with what IS real, and record
  // exactly where it fails closed rather than fabricating the MISSING fields to force a pass. ---
  const sourcesAttempt: SearchRuntimeAceResolverSourcesV1 = {
    candidates: identityInputs.map((c) => ({
      canonicalId: c.canonicalId,
      packetKey: c.packetKey!,
      sourceRef: c.sourceRef!,
      sourceRevision: c.sourceRevision,
      workspaceRevision: c.workspaceRevision,
    })),
    ordinalMap: ordinalMapRunA,
    rows: [], // honest: no real feature-context owner exists to populate this
    laneMaskByOrdinal: {},
    producerRevision: 'ace-feature-source-owner-01:census-run:v1',
    requestId: 'ace-fso-01:census-run:r1',
    tokenBudget: 4096,
    retrievalPolicyRevision: '', // honest: no real value exists; empty triggers the resolver's own required-field gate
    acePlaybookRevision: '', // honest: same
    representationRevision: null, // honest: no aggregate cohort-level value exists
    graphRevision: null,
  };

  const adapter = createSearchRuntimeAceProductionSourceAdapterV1({
    implementationRef: SEARCH_RUNTIME_ACE_PRODUCTION_SOURCE_OWNER_V1,
    resolveCanonicalSources: async () => sourcesAttempt,
  });

  let resolverOutcome: { threw: true; errorMessage: string } | { threw: false };
  try {
    await adapter.resolve({
      query: 'ace-feature-source-owner-01-census-canary',
      requestId: 'ace-fso-01:census-run:r1',
      workspaceRevision: cohort.candidateMap.workspaceRevision,
    });
    resolverOutcome = { threw: false };
  } catch (err) {
    resolverOutcome = { threw: true, errorMessage: err instanceof Error ? err.message : String(err) };
  }

  const missingCount = ownerCensus.filter((e) => e.status === 'MISSING').length;
  const status = resolverOutcome.threw && missingCount > 0
    ? 'STATIC_OWNER_SURFACE_PROVEN_LIVE_CANDIDATES_BOUND_FEATURE_CONTEXT_OWNER_MISSING'
    : 'ACE_FEATURE_SOURCE_OWNER_UNEXPECTED_STATE';

  const report = {
    schema: 'atlas.ace-feature-source-owner-live-proof.v1',
    generatedAt: new Date().toISOString(),
    status,
    summary: 'The ACE production-source composition boundary (createSearchRuntimeAceProductionSourceAdapterV1 -> createSearchRuntimeAceResolverV1) is fully built, type-safe, and correctly fails closed. Real candidate identity and a real, replay-stable CandidateOrdinalMapV1 were bound from a genuine 15-row Postgres-sourced cohort with zero new writes. The composition cannot proceed past ordinal-map binding because three real production owners do not exist anywhere in this repo: a QAS feature-context resolver (rows/laneMaskByOrdinal), a retrievalPolicyRevision producer, and an acePlaybookRevision producer. This is a genuine owner-adoption gap, not a code-quality gap -- the contracts and invariant checks are already correct; nothing here should be re-implemented.',
    searchRuntimeSearchWriteSideEffectFinding: 'SearchRuntime.search() (src/lib/server/retrieval/search-runtime.ts) always calls recordPromotionIntent() and logExposureEvents() as fire-and-forget side effects on every real invocation, with no read-only/dry-run mode. A genuinely zero-write canary cannot call it directly; this script uses the already-proven frozen cohort instead.',
    cohortSource: 'docs/reports/lineage-semantic-768-cohort-v1.json',
    candidateCount: identityInputs.length,
    ordinalMap: {
      checksum: ordinalMapRunA.ordinalMapChecksum,
      rowCount: ordinalMapRunA.rowCount,
      candidateSnapshotRevision: ordinalMapRunA.candidateSnapshotRevision,
      workspaceRevision: ordinalMapRunA.workspaceRevision,
      replayMatch: ordinalMapReplayMatch,
    },
    ownerCensus,
    resolverAttempt: resolverOutcome,
    canonicalAuthority: false,
    rankingPromotion: false,
    writesPerformed: false,
  };

  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status, missingCount, resolverThrew: resolverOutcome.threw, reportPath: REPORT_PATH }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

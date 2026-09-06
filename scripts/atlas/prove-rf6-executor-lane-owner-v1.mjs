import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const files = {
  searchRuntime: 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts',
  rrfIntegration: 'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts',
  rrfCombiner: 'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner.ts',
  searchRoute: 'sveltekit-frontend/src/routes/api/search/rrf/+server.ts',
  evaluationRoute: 'sveltekit-frontend/src/routes/api/retrieval/rrf/+server.ts',
  goFacade: 'sveltekit-frontend/src/lib/server/retrieval/go-retrieval-facade.ts',
  multiVector: 'sveltekit-frontend/src/lib/server/retrieval/multi-vector-orchestrator.ts',
  multiVectorRrf: 'sveltekit-frontend/src/lib/server/retrieval/rrf-multi-vector.ts',
};

const read = (relativePath) => {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) throw new Error(`MISSING_SOURCE:${relativePath}`);
  const bytes = readFileSync(path);
  return {
    path: relativePath,
    checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    text: bytes.toString('utf8'),
  };
};

const source = Object.fromEntries(Object.entries(files).map(([name, path]) => [name, read(path)]));
const has = (name, pattern) => pattern.test(source[name].text);
const checks = [
  ['SEARCH_RUNTIME_LOGICAL_DENSE_LANE', has('searchRuntime', /function getFusionLogicalLane[\s\S]*?embeddingLane === 'dense_768'[\s\S]*?return 'dense'/)],
  ['SEARCH_RUNTIME_LANE_EVIDENCE', has('searchRuntime', /laneEvidence[\s\S]*?supportingHitCount[\s\S]*?contributingSources/)],
  ['SEARCH_RUNTIME_FUSION_OWNER', has('searchRuntime', /export function fuseSearchRuntimeCandidates/)],
  ['SEARCH_ROUTE_RRF_INTEGRATION', has('searchRoute', /multiLaneRetrievalWithRRF/) && has('searchRoute', /rrf-integration\.js/)],
  ['RRF_INTEGRATION_QDRANT_EXECUTOR', has('rrfIntegration', /source: 'qdrant_vector'/)],
  ['RRF_INTEGRATION_TURBOVEC_EXECUTOR', has('rrfIntegration', /source: 'turbovec_ann'/)],
  ['RRF_COMBINER_SEPARATE_LANE_KEYS', has('rrfCombiner', /Map<string, Map<RetrievalLaneName, RRFScore>>/)],
  ['EVALUATION_ROUTE_DIRECT_FUSION', has('evaluationRoute', /from '\$lib\/server\/retrieval\/rrf-fusion\.js'/) && has('evaluationRoute', /fuseRetrievalLanes/) && !has('evaluationRoute', /from '\$lib\/server\/retrieval\/go-retrieval-facade\.js'/)],
  ['GO_FACADE_MULTI_VECTOR', has('goFacade', /executeMultiVectorRetrieval/) && has('goFacade', /multi-vector-orchestrator/)],
  ['MULTI_VECTOR_RRF_OWNER', has('multiVector', /fuseLanesViaRrf/)],
  ['MULTI_VECTOR_RRF_IMPLEMENTATION', has('multiVectorRrf', /fuseLanesViaRrf|function fuse/)],
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
const report = {
  schema: 'atlas.rf6-executor-lane-owner.v1',
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'RF6_EXECUTOR_LANE_OWNER_PROVEN_SOURCE_TRACE' : 'RF6_EXECUTOR_LANE_OWNER_FAILED',
  proofKind: 'READ_ONLY_CURRENT_SOURCE_TRACE',
  ownerDecision: {
    canonicalOwner: 'SearchRuntime',
    logicalDenseLane: 'dense',
    executors: ['qdrant', 'turbovec', 'cuvs', 'cagra'],
    executorIdentityIsProvenance: true,
    oneSemanticVotePerCandidate: 'REQUIRED_NOT_YET_RUNTIME_PROVEN',
    decisions: {
      'rrf-integration.ts::combineViaRRF': 'DELEGATE_TO_CANONICAL',
      'rrf-fusion.ts::fuseRetrievalLanes': 'RETAIN_INDEPENDENT_EVALUATION_ONLY',
      'multi-vector-orchestrator.ts::fuseLanesViaRrf': 'DELEGATE_TO_CANONICAL_AFTER_ENVELOPE',
      'unified-orchestrator.ts::combineRRFLanes': 'RETAIN_PENDING_OWNER_REPLAY',
      'rrf-fuse.ts': 'DELEGATE_TO_CANONICAL',
    },
  },
  checks: Object.fromEntries(checks.map(([name, passed]) => [name, passed])),
  source,
  effects: {
    sourceInspectionReadOnly: true,
    canonicalWrites: false,
    datastoreWrites: 0,
    cacheWrites: 0,
    modelCalls: 0,
    runtimeFilesModified: false,
  },
  nextGate: 'RF6-SEMANTIC-VOTE-01',
  blockedUntil: ['explicit caller migration or adapter boundary', 'focused alternative-executor replay', 'revision-qualified candidate envelope'],
};

const reportPath = resolve(root, 'docs/reports/rf6-executor-lane-owner-v1.json');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`${report.status} checks=${checks.length} failed=${failures.length} report=${reportPath}`);
if (failures.length > 0) process.exitCode = 1;

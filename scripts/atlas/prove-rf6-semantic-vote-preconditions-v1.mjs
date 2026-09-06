import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const relativePaths = {
  turbovecAdapter: 'sveltekit-frontend/src/lib/server/retrieval/turbovec-prefilter.ts',
  turbovecSidecar: 'sveltekit-frontend/scripts/turbovec-sidecar.py',
  turbovecGrpcProto: 'proto/active/turbovec.proto',
  turbovecGrpcLegacyProto: 'proto/active/turbovec_cuda.proto',
  turbovecGrpcBridge: 'scripts/sidecars/turbovec-grpc-bridge.mjs',
  turbovecGrpcClient: 'sveltekit-frontend/src/lib/server/grpc/turbovec-cuda-client.ts',
  turbovecProofLoader: 'scripts/atlas/prove-turbovec-ann-grpc.mjs',
  rrfIntegration: 'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts',
  searchRuntime: 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts',
  canonicalResolver: 'sveltekit-frontend/src/lib/server/retrieval/identity-resolution.ts',
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

const source = Object.fromEntries(Object.entries(relativePaths).map(([name, path]) => [name, read(path)]));
const has = (name, pattern) => pattern.test(source[name].text);
const checks = {
  turbovecResultShapeExists: has('turbovecAdapter', /export interface TurboVecSearchResult/),
  turbovecIdentityTypePresent: has('turbovecAdapter', /identity\?: TurboVecCandidateIdentity/),
  turbovecHttpResponseCarriesIdentity: has('turbovecSidecar', /result\["identity"\] = metadata/) && has('turbovecSidecar', /"identity": r\["identity"\]/),
  turbovecHttpLoaderCarriesIdentity: has('turbovecProofLoader', /identity: \{/),
  turbovecSourceRef: has('turbovecGrpcClient', /sourceRef\?: string \| null/),
  turbovecPacketIdentity: has('turbovecGrpcClient', /packetKey\?: string \| null|symbolVersionId\?: string \| null/),
  turbovecRevision: has('turbovecGrpcClient', /sourceRevision\?: string \| null/) && has('turbovecGrpcClient', /workspaceRevision\?: string \| null/),
  turbovecGrpcCanonicalClient: has('turbovecGrpcClient', /proto\/active\/turbovec\.proto/) && has('turbovecGrpcClient', /TurboVecService/),
  turbovecGrpcCandidateEnvelope: has('turbovecGrpcProto', /CandidateIdentity identity/) && has('turbovecGrpcProto', /source_ref/) && has('turbovecGrpcProto', /workspace_revision/),
  turbovecGrpcBridgeEnvelope: has('turbovecGrpcBridge', /annSvcDef/) && has('turbovecGrpcBridge', /rawIdentity/) && has('turbovecGrpcBridge', /server\.addService\(annSvcDef/),
  turbovecGrpcLegacyCompatibility: has('turbovecGrpcLegacyProto', /TurboVecCudaService/) && has('turbovecGrpcBridge', /legacySvcDef/),
  rrfIntegrationNormalizesHits: has('rrfIntegration', /normalizeCanonicalIdentity\(hits\)/),
  rrfIntegrationUsesExecutorNames: has('rrfIntegration', /source: 'qdrant_vector'/) && has('rrfIntegration', /source: 'turbovec_ann'/),
  canonicalResolverSupportsRevisionFields: has('canonicalResolver', /symbolVersionId|sourceRef|contentHash/),
  searchRuntimeLogicalLane: has('searchRuntime', /function getFusionLogicalLane/) && has('searchRuntime', /return 'dense'/),
};

const missingIdentity = [
  ...(checks.turbovecSourceRef ? [] : ['turbovecSourceRef']),
  ...(checks.turbovecPacketIdentity ? [] : ['turbovecPacketIdentity']),
  ...(checks.turbovecRevision ? [] : ['turbovecRevision']),
  ...(checks.turbovecGrpcCanonicalClient ? [] : ['turbovecGrpcCanonicalClient']),
  ...(checks.turbovecGrpcCandidateEnvelope ? [] : ['turbovecGrpcCandidateEnvelope']),
  ...(checks.turbovecGrpcBridgeEnvelope ? [] : ['turbovecGrpcBridgeEnvelope']),
].filter((key) => !checks[key]);
const status = missingIdentity.length === 0
  ? 'RF6_SEMANTIC_VOTE_PRECONDITIONS_READY'
  : 'RF6_SEMANTIC_VOTE_BLOCKED_UPSTREAM';

const report = {
  schema: 'atlas.rf6-semantic-vote-preconditions.v1',
  generatedAt: new Date().toISOString(),
  status,
  proofKind: 'READ_ONLY_CURRENT_SOURCE_TRACE',
  requiredEnvelope: [
    'symbolVersionId or packetKey or sourceRef/contentHash with explicit trust status',
    'sourceRevision',
    'workspaceRevision',
    'logicalLane',
    'executor identity as provenance',
  ],
  missingIdentity,
  checks,
  finding: missingIdentity.length === 0
    ? 'TurboVec HTTP and canonical split gRPC executors both carry a revision-qualified identity envelope; the deprecated combined service remains compatibility-only.'
    : checks.turbovecHttpResponseCarriesIdentity && checks.turbovecHttpLoaderCarriesIdentity
      ? 'The HTTP TurboVec path preserves optional identity/revision provenance, but the canonical gRPC envelope/client/bridge path is incomplete; one-vote semantics remain blocked while the executor cannot be revision-qualified.'
      : 'TurboVec does not yet preserve a complete identity/revision envelope across its executor paths.',
  safePolicy: 'Do not merge by fuzzy id, cluster, rank, or timestamp; do not silently promote fallback ids to canonical identity.',
  source,
  effects: {
    sourceInspectionReadOnly: true,
    canonicalWrites: false,
    datastoreWrites: 0,
    cacheWrites: 0,
    modelCalls: 0,
    runtimeFilesModified: false,
  },
  nextGate: missingIdentity.length === 0 ? 'RF6-SEMANTIC-VOTE-01' : 'TURBOVEC-CANONICAL-ENVELOPE-01',
};

const reportPath = resolve(root, 'docs/reports/rf6-semantic-vote-preconditions-v1.json');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`${status} missing=${missingIdentity.join(',') || 'none'} report=${reportPath}`);
if (missingIdentity.length > 0) process.exitCode = 2;

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildContextManifestV2 } from '../../src/lib/server/atlas/graph/context-manifest-v2.js';
import { materializeCandidateOrdinalMap } from '../../src/lib/server/atlas/features/canonical-candidate-v1.js';
import { buildPromptPlanV1 } from '../../src/lib/server/atlas/prefill/prompt-plan-v1.js';
import { buildPrefillRoutingDecisionV1 } from '../../src/lib/server/atlas/prefill/prefill-routing-decision-v1.js';

const repoRoot = resolve(process.cwd(), '..');
const output = resolve(repoRoot, 'docs/reports/prefill-dag-fixture-v1.json');
const requestId = 'fixture:prefill-dag-v1';
const snapshotId = 'fixture:candidate-snapshot-v1';
const ordinalMap = materializeCandidateOrdinalMap({
  candidateSnapshotRevision: snapshotId,
  workspaceRevision: 'fixture:workspace-revision-v1',
  producerRevision: 'fixture:ordinal-map-producer-v1',
  candidates: [
    { canonicalId: 'candidate:fixture:c', packetKey: 'packet:fixture:c', sourceRef: 'fixture:source:c', treeNodeId: 'tree:fixture:c', symbolVersionId: null, workspaceRevision: 'fixture:workspace-revision-v1', sourceRevision: 'fixture:source-revision-v1', graphRevision: 'fixture:graph-revision-v1', semanticRevision: 'fixture:semantic-768-v1', degradedIdentity: false, evidenceRefs: ['fixture:source:c'] },
    { canonicalId: 'candidate:fixture:a', packetKey: 'packet:fixture:a', sourceRef: 'fixture:source:a', treeNodeId: 'tree:fixture:a', symbolVersionId: null, workspaceRevision: 'fixture:workspace-revision-v1', sourceRevision: 'fixture:source-revision-v1', graphRevision: 'fixture:graph-revision-v1', semanticRevision: 'fixture:semantic-768-v1', degradedIdentity: false, evidenceRefs: ['fixture:source:a'] },
    { canonicalId: 'candidate:fixture:b', packetKey: 'packet:fixture:b', sourceRef: 'fixture:source:b', treeNodeId: 'tree:fixture:b', symbolVersionId: null, workspaceRevision: 'fixture:workspace-revision-v1', sourceRevision: 'fixture:source-revision-v1', graphRevision: 'fixture:graph-revision-v1', semanticRevision: 'fixture:semantic-768-v1', degradedIdentity: false, evidenceRefs: ['fixture:source:b'] },
  ],
});
const selectedOrdinals = [0, 1, 2];
const selectedCandidates = selectedOrdinals.map((ordinal) => {
  const candidate = ordinalMap.candidates.find((entry) => entry.candidateOrdinal === ordinal);
  if (!candidate) throw new Error(`FIXTURE_ORDINAL_NOT_FOUND:${ordinal}`);
  return candidate;
});
const candidateKeys = selectedCandidates.map((candidate) => candidate.packetKey);
const manifestV1 = {
  schema: 'atlas.context-manifest.v1' as const,
  requestId,
  snapshotId,
  graphRevision: 'fixture:graph-revision-v1',
  query: 'trace packet lineage and prepare bounded context',
  candidateBucket: 8 as const,
  candidateCount: candidateKeys.length,
  tokenBudget: 128,
  selectedNodeKeys: candidateKeys,
  evidenceRefs: ['fixture:source:a', 'fixture:source:b'],
  producerRevision: 'fixture:prefill-dag-producer-v1',
};
const identityInput = {
  selectedOrdinalSetChecksum: createHash('sha256').update(selectedOrdinals.join(',')).digest('hex'),
  evidenceRevisions: {
    sourceRevision: 'fixture:source-revision-v1',
    representationRevision: 'fixture:semantic-768-v1',
    featureRevision: 'fixture:feature-revision-v1',
    ontologyRevision: null,
    modelRevision: 'fixture:model-revision-v1',
    promptTemplateRevision: 'fixture:prompt-template-v1',
  },
  ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
  retrievalPolicyRevision: 'fixture:retrieval-policy-v1',
  acePlaybookRevision: 'fixture:ace-playbook-v1',
};
const manifestA = buildContextManifestV2(manifestV1, identityInput);
const manifestB = buildContextManifestV2(manifestV1, identityInput);
const contentChecksum = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const promptInput = {
  requestId,
  contextManifestChecksum: manifestA.identityChecksum,
  tokenizerRevision: 'fixture:tokenizer-v1',
  promptTemplateRevision: 'fixture:prompt-template-v1',
  instructionRevision: 'fixture:instruction-v1',
  segments: [
    { ordinal: 0, kind: 'SYSTEM' as const, packetKey: null, evidenceRefs: [], contentChecksum: contentChecksum('system'), tokenCount: 4 },
    { ordinal: 1, kind: 'EVIDENCE' as const, packetKey: selectedCandidates[0]?.packetKey ?? null, evidenceRefs: selectedCandidates[0]?.evidenceRefs ?? [], contentChecksum: contentChecksum('evidence-a'), tokenCount: 12 },
    { ordinal: 2, kind: 'USER_QUERY' as const, packetKey: null, evidenceRefs: [], contentChecksum: contentChecksum(manifestV1.query), tokenCount: 10 },
  ],
  contextLimitTokens: 256,
  reservedOutputTokens: 64,
  maxInputTokens: 192,
};
const promptA = buildPromptPlanV1(promptInput);
const promptB = buildPromptPlanV1(promptInput);
const packetRevisionSetChecksum = createHash('sha256')
  .update(selectedCandidates.map((candidate) => `${candidate.packetKey}:${candidate.sourceRevision}`).join('|'), 'utf8')
  .digest('hex');
const compactTensorChecksum = createHash('sha256')
  .update(JSON.stringify(Array.from({ length: 154 }, (_, index) => index / 154)), 'utf8')
  .digest('hex');
const classifierOutputChecksum = createHash('sha256').update('fixture:logical-needs-v1', 'utf8').digest('hex');
const executorCapabilityRevision = 'fixture:executor-capability-v2';
const retrievalPlanChecksum = createHash('sha256').update('fixture:retrieval-executor-plan-v2', 'utf8').digest('hex');
const routingDecision = buildPrefillRoutingDecisionV1({
  requestId,
  workspaceRevision: 'fixture:workspace-revision-v1',
  packetRevisionSetChecksum,
  retrievalRouterTensorRevision: 'atlas.retrieval-router-tensor.v2',
  compactTensorChecksum,
  classifierRevision: 'fixture:classifier-v1',
  classifierOutputChecksum,
  executorCapabilityRevision,
  retrievalPlanChecksum,
  candidateOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
  status: 'BLOCKED_LINEAGE',
  canonicalAuthority: false,
  writesPerformed: false,
  producerRevision: 'fixture:prefill-routing-decision-v1',
});
const report = {
  schema: 'ParentAtlasPrefillDagFixtureV1',
  generatedAt: new Date().toISOString(),
  status: manifestA.identityChecksum === manifestB.identityChecksum && promptA.checksumSha256 === promptB.checksumSha256
    ? 'PREFILL_DAG_REPLAY_PROVEN'
    : 'PREFILL_DAG_REPLAY_FAILED',
  evidenceClass: 'FIXTURE_ONLY',
  stages: ['QueryRouterTensorV2', 'CompactQueryRouterTensorV1', 'PrefillRoutingDecisionV1', 'RetrievalPlan', 'CandidateOrdinalMap', 'CandidateFeatureMatrix', 'ContextManifestV2', 'PromptPlanV1'],
  candidateCount: candidateKeys.length,
  candidateOrdering: selectedCandidates.map((candidate) => ({ ordinal: candidate.candidateOrdinal, packetKey: candidate.packetKey, canonicalId: candidate.canonicalId })),
  ordinalMap: {
    checksum: ordinalMap.ordinalMapChecksum,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    rowCount: ordinalMap.rowCount,
    selectedOrdinals,
    derivedByOrdinal: true,
  },
  manifestIdentityChecksum: manifestA.identityChecksum,
  promptPlanChecksum: promptA.checksumSha256,
  routingDecision: {
    checksum: routingDecision.checksumSha256,
    status: routingDecision.status,
    tensorRevision: routingDecision.retrievalRouterTensorRevision,
    candidateOrdinalMapChecksum: routingDecision.candidateOrdinalMapChecksum,
    canonicalAuthority: routingDecision.canonicalAuthority,
    writesPerformed: routingDecision.writesPerformed,
  },
  totalPromptTokens: promptA.totalTokens,
  replay: {
    sameManifestChecksum: manifestA.identityChecksum === manifestB.identityChecksum,
    samePromptChecksum: promptA.checksumSha256 === promptB.checksumSha256,
    sameSegmentOrdering: promptA.segments.map((segment) => segment.ordinal).join(',') === '0,1,2',
  },
  canonicalAuthority: false,
  canonicalWritesAllowed: false,
  writesPerformed: false,
  liveRetrievalExecuted: false,
  modelPrefillExecuted: false,
  nextRequirement: 'CURRENT_REVISION_QUALIFIED_CANDIDATE_FEATURES_AND_LIVE_LINEAGE_ADMISSION',
};
mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, manifestIdentityChecksum: report.manifestIdentityChecksum, promptPlanChecksum: report.promptPlanChecksum, output }, null, 2));

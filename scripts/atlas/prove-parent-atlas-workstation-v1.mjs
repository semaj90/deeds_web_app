#!/usr/bin/env node

/** Read-only orchestration proof for the Parent Atlas Workstation V1 canary. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(process.env.ATLAS_WORKSTATION_REPORT ?? path.join(ROOT, 'docs/reports/parent-atlas-workstation-v1-readiness.json'));
const readJson = (name) => fs.readFile(path.join(ROOT, 'docs/reports', name), 'utf8').then(JSON.parse);

async function main() {
  const [map, retrieval, context, dag] = await Promise.all([
    readJson('lineage-qualified-candidate-map-v1.json'),
    readJson('parent-atlas-golden-retrieval-v1.json'),
    readJson('parent-atlas-context-manifest-v1.json'),
    readJson('parent-atlas-dag-runtime-v1.json'),
  ]);
  const sameMap = [retrieval.candidateMap, context.candidateMap, dag.candidate].every((binding) =>
    binding.candidateSnapshotRevision === map.map.candidateSnapshotRevision || binding.candidateSnapshotRevision === map.candidateSnapshotRevision
  );
  const sameOrdinal = [retrieval.candidateMap, context.candidateMap, dag.candidate].every((binding) => binding.ordinalMapChecksum === map.map.ordinalMapChecksum || binding.ordinalMapChecksum === map.ordinalMapChecksum);
  const sameWorkspace = [retrieval.candidateMap, context.candidateMap, dag.candidate].every((binding) => binding.workspaceRevision === map.lineage.workspaceRevision || binding.workspaceRevision === map.workspaceRevision);
  const report = {
    schema: 'atlas.workstation-v1-readiness.v1',
    status: map.actualCandidateCount > 0 && retrieval.status === 'GOLDEN_RETRIEVAL_REPLAY_PROVEN' && context.status === 'CONTEXT_MANIFEST_REPLAY_PROVEN' && dag.status === 'DAG_RUNTIME_READ_ONLY_PROVEN' && sameMap && sameOrdinal && sameWorkspace ? 'WORKSTATION_V1_PROVEN' : 'WORKSTATION_V1_BLOCKED',
    gates: {
      sourceLineage: map.lineage.syntheticRevisionFallbacks === false && map.lineage.sourceRefEquality && map.lineage.packetChunkContentHashEquality ? 'PROVEN_CANARY' : 'BLOCKED',
      candidateOrdinal: map.map.identityAuthority === false && map.actualCandidateCount <= 768 ? 'PROVEN_CANARY' : 'BLOCKED',
      semantic768: map.semantic.representationId === 'semantic_768' && map.semantic.dimensions === 768 && retrieval.qdrant.vectorName === 'content' ? 'PROVEN' : 'BLOCKED',
      retrievalReplay: retrieval.replay?.identical === true ? 'PROVEN' : 'BLOCKED',
      contextManifest: context.status === 'CONTEXT_MANIFEST_REPLAY_PROVEN' ? 'PROVEN' : 'BLOCKED',
      dagValidator: dag.validation?.status === 'ACCEPTED' ? 'PROVEN_CANARY' : 'BLOCKED',
      readOnlyExecution: dag.execution?.mode === 'BOUNDED_READ_ONLY' ? 'PROVEN' : 'BLOCKED',
    },
    bindingParity: { sameCandidateSnapshotRevision: sameMap, sameOrdinalMapChecksum: sameOrdinal, sameWorkspaceRevision: sameWorkspace, graphRevision: null },
    canary: { actualCandidateCount: map.actualCandidateCount, candidatePoolLimit: 768, contextTopK: context.selection?.selectedCount ?? null, ordinalMapChecksum: map.map.ordinalMapChecksum, candidateSnapshotRevision: map.map.candidateSnapshotRevision, workspaceRevision: map.lineage.workspaceRevision },
    explicitlyDeferred: { currentRelationshipGraph: 'OPTIONAL_CURRENT_RELATIONSHIP_CORPUS_EMPTY', neuralShortlist: 'CHALLENGER_NOT_PROMOTED', cache: 'BYPASS', trtLlm: 'DEFERRED', mutationExecution: 'NOT_RUN' },
    sourceReports: ['lineage-qualified-candidate-map-v1.json', 'parent-atlas-golden-retrieval-v1.json', 'parent-atlas-context-manifest-v1.json', 'parent-atlas-dag-runtime-v1.json'],
    writes: { postgresWrites: false, qdrantWrites: false, valkeyWrites: false, neo4jWrites: false, sourceWrites: false },
    nextGate: 'V1.1_SCALE_OR_OPTIONAL_GRAPH_RELATIONSHIP_CORPUS',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, actualCandidateCount: map.actualCandidateCount, sameOrdinalMap: sameOrdinal, reportPath }, null, 2));
  if (report.status !== 'WORKSTATION_V1_PROVEN') process.exitCode = 1;
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });

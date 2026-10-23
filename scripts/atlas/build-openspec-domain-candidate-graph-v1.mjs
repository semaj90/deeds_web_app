#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { buildOpenSpecDomainCandidateGraphV1, createOpenSpecDomainCandidateTraversalIndexV1,
  traverseOpenSpecDomainCandidateGraphV1 } from './lib/openspec-domain-candidate-graph-v1.mjs';

const [packageManifestArg, taskPathManifestArg, domainManifestArg, runId, runtimeOwnerManifestArg] = process.argv.slice(2);
if (!packageManifestArg || !taskPathManifestArg || !domainManifestArg
  || !/^[a-zA-Z0-9][a-zA-Z0-9-]{2,63}$/.test(runId ?? '')) {
  throw new Error('USAGE: node scripts/atlas/build-openspec-domain-candidate-graph-v1.mjs <package-graph-manifest> <task-path-manifest> <domain-manifest> <run-id> [runtime-owner-manifest]');
}

const root = process.cwd();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const writeExclusive = (filePath, bytes) => writeFileSync(filePath, bytes, { flag: 'wx' });
const resolveInsideRoot = relative => {
  const absolute = path.resolve(root, relative);
  const rel = path.relative(root, absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('ARTIFACT_PATH_OUTSIDE_REPOSITORY');
  return absolute;
};
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const rowsFromArrow = table => Array.from({ length: table.numRows }, (_, index) => Object.fromEntries(
  table.schema.fields.map(field => [field.name, table.getChild(field.name).get(index)])));
const verifyBodyChecksum = (manifest, field, schema, sorted = false) => {
  const body = { ...manifest };
  delete body[field];
  const bytes = Buffer.from(sorted ? canonical(body) : JSON.stringify(body));
  if (manifest.schema !== schema || sha256(bytes) !== manifest[field]) throw new Error('INPUT_MANIFEST_CHECKSUM_INVALID');
};

const packageManifestPath = resolveInsideRoot(packageManifestArg);
const packageManifestBytes = readFileSync(packageManifestPath);
const packageManifest = JSON.parse(packageManifestBytes.toString('utf8'));
verifyBodyChecksum(packageManifest, 'manifestBodySha256', 'atlas.openspec-package-candidate-graph-manifest.v1', true);
const readPackageArtifact = name => {
  const descriptor = packageManifest.artifacts[name];
  const bytes = readFileSync(resolveInsideRoot(descriptor.path));
  if (sha256(bytes) !== descriptor.sha256 || bytes.byteLength !== descriptor.bytes) throw new Error(`PACKAGE_GRAPH_ARTIFACT_INVALID:${name}`);
  return bytes;
};
const baseNodes = rowsFromArrow(tableFromIPC(readPackageArtifact('nodes.arrow')));
const baseEdges = rowsFromArrow(tableFromIPC(readPackageArtifact('typed-edges.arrow')));
if (baseNodes.length !== packageManifest.counts.nodeCount || baseEdges.length !== packageManifest.counts.edgeCount) {
  throw new Error('PACKAGE_GRAPH_COUNTS_INVALID');
}

const taskPathManifestPath = resolveInsideRoot(taskPathManifestArg);
const taskPathManifestBytes = readFileSync(taskPathManifestPath);
const taskPathManifest = JSON.parse(taskPathManifestBytes.toString('utf8'));
verifyBodyChecksum(taskPathManifest, 'manifestBodySha256', 'atlas.openspec-source-path-edge-manifest.v1');
if (packageManifest.inputs.taskPathManifestBodySha256 !== taskPathManifest.manifestBodySha256
  || packageManifest.inputs.taskPathRowsSha256 !== taskPathManifest.rowsSha256) throw new Error('PACKAGE_TASK_PATH_INPUT_MISMATCH');
const taskPathReadbackPath = path.join(path.dirname(taskPathManifestPath), 'independent-readback.json');
const taskPathReadbackBytes = readFileSync(taskPathReadbackPath);
const taskPathReadback = JSON.parse(taskPathReadbackBytes.toString('utf8'));
if (taskPathReadback.status !== 'VERIFIED_ADVISORY_REFERENCE_EDGES'
  || taskPathReadback.rowsSha256 !== taskPathManifest.rowsSha256
  || taskPathReadback.candidateRows !== taskPathManifest.rowCount
  || taskPathReadback.taskRefsVerified !== taskPathManifest.rowCount
  || sha256(taskPathReadbackBytes) !== packageManifest.inputs.taskPathIndependentReadbackSha256) {
  throw new Error('TASK_PATH_READBACK_INVALID');
}
const taskRowsBytes = readFileSync(resolveInsideRoot(taskPathManifest.rowsPath));
if (sha256(taskRowsBytes) !== taskPathManifest.rowsSha256) throw new Error('TASK_PATH_ROWS_CHECKSUM_INVALID');
const taskPathRows = taskRowsBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
if (taskPathRows.length !== taskPathManifest.rowCount) throw new Error('TASK_PATH_ROW_COUNT_INVALID');

const domainManifestPath = resolveInsideRoot(domainManifestArg);
const domainManifestBytes = readFileSync(domainManifestPath);
const domainManifest = JSON.parse(domainManifestBytes.toString('utf8'));
verifyBodyChecksum(domainManifest, 'manifestBodySha256', 'atlas.directory-domain-candidates-manifest.v1');
if (domainManifest.status !== 'ADVISORY_PROPOSALS_ONLY' || domainManifest.canonicalAuthority !== false) {
  throw new Error('DOMAIN_CANDIDATE_AUTHORITY_INVALID');
}
const domainArtifactBytes = readFileSync(resolveInsideRoot(domainManifest.artifactPath));
if (sha256(domainArtifactBytes) !== domainManifest.artifactSha256 || domainArtifactBytes.byteLength !== domainManifest.artifactBytes) {
  throw new Error('DOMAIN_CANDIDATE_ARTIFACT_CHECKSUM_INVALID');
}
const summaryPath = resolveInsideRoot(domainManifest.inputs.directorySummaryPath);
const summaryBytes = readFileSync(summaryPath);
if (sha256(summaryBytes) !== domainManifest.inputs.directorySummarySha256) throw new Error('DIRECTORY_SUMMARY_CHECKSUM_INVALID');
const summaryManifestPath = path.join(path.dirname(summaryPath), 'manifest.json');
const summaryManifestBytes = readFileSync(summaryManifestPath);
if (sha256(summaryManifestBytes) !== domainManifest.inputs.directorySummaryManifestSha256) throw new Error('DIRECTORY_SUMMARY_MANIFEST_CHECKSUM_INVALID');
const summaryManifest = JSON.parse(summaryManifestBytes.toString('utf8'));
if (summaryManifest.schema !== 'atlas.directory-metadata-summaries.v1'
  || summaryManifest.artifactSha256 !== sha256(summaryBytes)
  || summaryManifest.summaryCount !== domainManifest.directoryCount) throw new Error('DIRECTORY_SUMMARY_BINDING_INVALID');
const vocabularyBytes = readFileSync(resolveInsideRoot(domainManifest.inputs.vocabularyPath));
if (sha256(vocabularyBytes) !== domainManifest.inputs.vocabularySha256) throw new Error('DOMAIN_VOCABULARY_CHECKSUM_INVALID');
const vocabulary = JSON.parse(vocabularyBytes.toString('utf8'));
const validGroupIds = new Set(vocabulary.groups.map(group => group.group_id ?? group.id));

const domainReadbackPath = path.join(path.dirname(domainManifestPath), 'independent-readback.json');
const domainReadbackBytes = readFileSync(domainReadbackPath);
const domainReadback = JSON.parse(domainReadbackBytes.toString('utf8'));
if (domainReadback.status !== 'VERIFIED_ADVISORY_ARTIFACT'
  || domainReadback.manifestBodySha256 !== domainManifest.manifestBodySha256
  || domainReadback.artifactSha256 !== domainManifest.artifactSha256
  || domainReadback.allRowsJoinToSummary !== true
  || domainReadback.allGroupIdsResolve !== true
  || domainReadback.candidateRowsChecksumVerified !== true) throw new Error('DOMAIN_CANDIDATE_READBACK_INVALID');

const summaryTable = tableFromIPC(summaryBytes);
const domainTable = tableFromIPC(domainArtifactBytes);
if (summaryTable.numRows !== domainManifest.directoryCount || domainTable.numRows !== domainManifest.candidateRowCount) {
  throw new Error('DOMAIN_INPUT_ROW_COUNT_INVALID');
}
const summaryRows = rowsFromArrow(summaryTable);
const domainRows = rowsFromArrow(domainTable);
if (domainRows.some(row => row.candidateGroupId && !validGroupIds.has(row.candidateGroupId))) {
  throw new Error('DOMAIN_GROUP_NOT_IN_VOCABULARY');
}

let runtimeOwnerManifest = null;
let runtimeOwnerManifestBytes = null;
let runtimeOwnerArtifactBytes = null;
let runtimeOwnerRows = [];
if (runtimeOwnerManifestArg) {
  const runtimeOwnerManifestPath = resolveInsideRoot(runtimeOwnerManifestArg);
  runtimeOwnerManifestBytes = readFileSync(runtimeOwnerManifestPath);
  runtimeOwnerManifest = JSON.parse(runtimeOwnerManifestBytes.toString('utf8'));
  verifyBodyChecksum(runtimeOwnerManifest, 'receiptSha256', 'atlas.runtime-owner-directory-candidates.v1', true);
  if (runtimeOwnerManifest.status !== 'DECLARED_OWNER_PATHS_ADVISORY_ONLY'
    || runtimeOwnerManifest.canonicalAuthority !== false || runtimeOwnerManifest.executionProven !== false
    || runtimeOwnerManifest.sourceRevisionQualified !== false || runtimeOwnerManifest.productionStoreWrites !== false
    || runtimeOwnerManifest.inventorySha256 !== summaryManifest.sourceInventorySha256
    || runtimeOwnerManifest.directoryArtifactSha256 !== summaryManifest.inputBindings.directoryRollupArtifactSha256) {
    throw new Error('RUNTIME_OWNER_GRAPH_INPUT_LINEAGE_MISMATCH');
  }
  const runtimeOwnerArtifactPath = resolveInsideRoot(path.join(path.dirname(runtimeOwnerManifestArg), 'runtime-owner-candidates.arrow'));
  runtimeOwnerArtifactBytes = readFileSync(runtimeOwnerArtifactPath);
  if (sha256(runtimeOwnerArtifactBytes) !== runtimeOwnerManifest.artifacts?.['runtime-owner-candidates.arrow']?.sha256) {
    throw new Error('RUNTIME_OWNER_GRAPH_ARTIFACT_CHECKSUM_INVALID');
  }
  const runtimeTable = tableFromIPC(runtimeOwnerArtifactBytes);
  if (runtimeTable.numRows !== runtimeOwnerManifest.ownerCandidates) throw new Error('RUNTIME_OWNER_GRAPH_ROW_COUNT_INVALID');
  runtimeOwnerRows = rowsFromArrow(runtimeTable).map(row => ({
    ...row,
    executionProven: row.executionProven === 1,
    sourceRevisionQualified: row.sourceRevisionQualified === 1,
  }));
  for (const row of runtimeOwnerRows) {
    const ownerPath = resolveInsideRoot(row.ownerPath);
    const ownerStat = lstatSync(ownerPath);
    if (!ownerStat.isFile() || ownerStat.isSymbolicLink() || sha256(readFileSync(ownerPath)) !== row.ownerFileSha256) {
      throw new Error(`RUNTIME_OWNER_CURRENT_BYTES_MISMATCH:${row.capabilityId}`);
    }
  }
}

const rejectCounts = { TARGET_NOT_REGULAR: 0, TARGET_DIGEST_MISSING: 0, TARGET_DIGEST_MISMATCH: 0,
  DIRECTORY_PARENT_MISMATCH: 0 };
const currentTaskPathRows = [];
for (const row of taskPathRows) {
  if (row.resolutionStatus !== 'EXACT_REPO_ROOT_FILE') continue;
  if (!/^[a-f0-9]{64}$/i.test(row.targetFileSha256 ?? '')) {
    rejectCounts.TARGET_DIGEST_MISSING += 1;
    continue;
  }
  const target = resolveInsideRoot(row.targetPath);
  try {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('NOT_REGULAR');
    const bytes = readFileSync(target);
    if (sha256(bytes) !== row.targetFileSha256 || stat.size !== row.targetFileBytes) {
      rejectCounts.TARGET_DIGEST_MISMATCH += 1;
      continue;
    }
  } catch {
    rejectCounts.TARGET_NOT_REGULAR += 1;
    continue;
  }
  const parentPath = path.posix.dirname(row.targetPath.replaceAll('\\', '/')) || '.';
  if (parentPath !== row.targetDirectoryPath) {
    rejectCounts.DIRECTORY_PARENT_MISMATCH += 1;
    continue;
  }
  currentTaskPathRows.push(row);
}

const graph = buildOpenSpecDomainCandidateGraphV1({ baseNodes, baseEdges, taskPathRows: currentTaskPathRows,
  summaryRows, domainRows, runtimeOwnerRows });
const traversalEvidenceStatuses = [
  'EXACT_PATH_AND_TARGET_DIGEST_CAPTURED',
  'PATH_PARENT_AND_SUMMARY_DIGEST_MATCH_ADVISORY',
  'SUMMARY_DERIVED_PROPOSAL_ONLY',
];
const traversalEdgeTypes = ['OPENSPEC_TASK_REFERENCES_PATH_CANDIDATE', 'FILE_PARENT_DIRECTORY_CANDIDATE', 'DIRECTORY_DOMAIN_CANDIDATE'];
const traversalEvidenceExcludedEdgeCount = graph.edges.filter(edge => traversalEdgeTypes.includes(edge.edgeType)
  && !traversalEvidenceStatuses.includes(edge.evidenceStatus)).length;
const traversals = [];
const domainReachCounts = new Map();
let fanoutTruncatedTaskCount = 0;
const traversalIndex = createOpenSpecDomainCandidateTraversalIndexV1({ nodes: graph.nodes, edges: graph.edges,
  edgeTypes: traversalEdgeTypes, evidenceStatuses: traversalEvidenceStatuses });
for (const taskNode of graph.nodes.filter(node => node.nodeType === 'TASK_CANDIDATE')) {
  const result = traverseOpenSpecDomainCandidateGraphV1({ index: traversalIndex,
    startNodeKey: taskNode.nodeKey, maxHops: 3, maxFanout: 20 });
  if (result.fanoutTruncated) fanoutTruncatedTaskCount += 1;
  const domainGroups = result.reached.filter(node => node.nodeType === 'DOMAIN_GROUP_CANDIDATE')
    .map(node => node.nodeKey).sort();
  for (const domainKey of new Set(domainGroups)) domainReachCounts.set(domainKey, (domainReachCounts.get(domainKey) ?? 0) + 1);
  traversals.push({ taskRef: taskNode.taskRef, taskBlockSha256: taskNode.taskBlockSha256,
    domainGroups, reachedCount: result.reached.length, fanoutTruncated: result.fanoutTruncated });
}
traversals.sort((left, right) => left.taskRef.localeCompare(right.taskRef));
const domainReach = [...domainReachCounts].map(([domainGroupCandidate, taskCount]) => ({ domainGroupCandidate, taskCount }))
  .sort((left, right) => right.taskCount - left.taskCount || left.domainGroupCandidate.localeCompare(right.domainGroupCandidate));
const runtimeTraversalEdgeTypes = [...traversalEdgeTypes, 'DIRECTORY_DECLARED_RUNTIME_OWNER_CANDIDATE'];
const runtimeTraversalEvidenceStatuses = [...traversalEvidenceStatuses, 'DECLARED_OWNER_REGISTRY_AND_CURRENT_BYTES_ONLY'];
const runtimeTraversalIndex = createOpenSpecDomainCandidateTraversalIndexV1({ nodes: graph.nodes, edges: graph.edges,
  edgeTypes: runtimeTraversalEdgeTypes, evidenceStatuses: runtimeTraversalEvidenceStatuses });
const runtimeOwnerTraversals = [];
const runtimeOwnerReachCounts = new Map();
let runtimeFanoutTruncatedTaskCount = 0;
for (const taskNode of graph.nodes.filter(node => node.nodeType === 'TASK_CANDIDATE')) {
  const result = traverseOpenSpecDomainCandidateGraphV1({ index: runtimeTraversalIndex,
    startNodeKey: taskNode.nodeKey, maxHops: 3, maxFanout: 20 });
  if (result.fanoutTruncated) runtimeFanoutTruncatedTaskCount += 1;
  const runtimeOwners = result.reached.filter(node => node.nodeType === 'RUNTIME_OWNER_CANDIDATE')
    .map(node => node.nodeKey.slice('runtime-owner-candidate:'.length)).sort();
  for (const capabilityId of new Set(runtimeOwners)) runtimeOwnerReachCounts.set(capabilityId,
    (runtimeOwnerReachCounts.get(capabilityId) ?? 0) + 1);
  runtimeOwnerTraversals.push({ taskRef: taskNode.taskRef, taskBlockSha256: taskNode.taskBlockSha256,
    runtimeOwnerCapabilities: runtimeOwners, reachedCount: result.reached.length, fanoutTruncated: result.fanoutTruncated });
}
runtimeOwnerTraversals.sort((left, right) => left.taskRef.localeCompare(right.taskRef));
const runtimeOwnerReach = [...runtimeOwnerReachCounts].map(([capabilityId, taskCount]) => ({ capabilityId, taskCount }))
  .sort((left, right) => right.taskCount - left.taskCount || left.capabilityId.localeCompare(right.capabilityId));

const nodeFields = [
  ['ordinal', Int32], ['nodeKey', Utf8], ['nodeType', Utf8], ['relativePath', Utf8], ['sourceSha256', Utf8],
  ['ecosystem', Utf8], ['packageName', Utf8], ['identityStatus', Utf8], ['taskRef', Utf8], ['taskKey', Utf8],
  ['taskBlockSha256', Utf8], ['workspaceRevision', Utf8], ['domainGroupId', Utf8],
  ['directorySummarySha256', Utf8], ['directoryInputDigest', Utf8],
  ['ownerClassification', Utf8], ['capabilityId', Utf8], ['executionProven', Int32], ['sourceRevisionQualified', Int32],
];
const edgeFields = [
  ['sourceOrdinal', Int32], ['targetOrdinal', Int32], ['edgeType', Utf8], ['evidenceStatus', Utf8],
  ['sourcePath', Utf8], ['sourceSha256', Utf8], ['importSpecifier', Utf8], ['startByte', Int32], ['endByte', Int32],
  ['line1', Int32], ['installedVersion', Utf8], ['installedVersionStatus', Utf8], ['taskBlockSha256', Utf8],
  ['evidenceSha256', Utf8], ['evidenceStartByte', Int32], ['evidenceEndByte', Int32], ['targetSha256', Utf8],
  ['workspaceRevision', Utf8], ['summarySha256', Utf8], ['inputDigest', Utf8], ['domainGroupId', Utf8],
  ['candidateKind', Utf8], ['score', Int32], ['matchedPathTermsJson', Utf8], ['matchedPackageTermsJson', Utf8],
  ['capabilityId', Utf8], ['ownerClassification', Utf8], ['executionProven', Int32], ['sourceRevisionQualified', Int32],
];
const toArrow = (fields, values) => tableToIPC(new Table(Object.fromEntries(fields.map(([name, Type]) => [name,
  vectorFromArray(values.map(row => row[name] ?? (Type === Int32 ? 0 : '')), Type === Int32 ? new Int32() : new Utf8())]))), 'file');
const nodesBytes = toArrow(nodeFields, graph.nodes);
const edgesBytes = toArrow(edgeFields, graph.edges);
const traversalBytes = Buffer.from(`${JSON.stringify({
  schema: 'atlas.openspec-domain-candidate-traversals.v1', maxHops: 3, maxFanout: 20,
  allowedEvidenceStatuses: traversalEvidenceStatuses, excludedEdgeCount: traversalEvidenceExcludedEdgeCount,
  traversals, domainReach,
  fanoutTruncatedTaskCount,
  authorityStatus: 'ADVISORY_DOMAIN_CANDIDATE_TRAVERSAL_ONLY',
}, null, 2)}\n`, 'utf8');
const runtimeTraversalBytes = runtimeOwnerManifest ? Buffer.from(`${JSON.stringify({
  schema: 'atlas.openspec-runtime-owner-candidate-traversals.v1', maxHops: 3, maxFanout: 20,
  allowedEdgeTypes: runtimeTraversalEdgeTypes, allowedEvidenceStatuses: runtimeTraversalEvidenceStatuses,
  traversals: runtimeOwnerTraversals, runtimeOwnerReach, fanoutTruncatedTaskCount: runtimeFanoutTruncatedTaskCount,
  authorityStatus: 'ADVISORY_DECLARED_RUNTIME_OWNER_CANDIDATE_TRAVERSAL_ONLY', canonicalAuthority: false,
}, null, 2)}\n`, 'utf8') : null;
const edgeTypeCounts = Object.fromEntries([...new Set(graph.edges.map(edge => edge.edgeType))].sort()
  .map(type => [type, graph.edges.filter(edge => edge.edgeType === type).length]));
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', 'openspec-domain-candidate-graph', runId);
const availableBytes = statfsSync(root).bavail * statfsSync(root).bsize;
const requiredBytes = nodesBytes.byteLength + edgesBytes.byteLength + traversalBytes.byteLength + (runtimeTraversalBytes?.byteLength ?? 0) + 1_000_000;
if (availableBytes < requiredBytes * 2) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
mkdirSync(path.dirname(outputDir), { recursive: true });
mkdirSync(outputDir, { recursive: false });
const outputRows = [['nodes.arrow', nodesBytes], ['typed-edges.arrow', edgesBytes], ['task-domain-traversals.json', traversalBytes],
  ...(runtimeTraversalBytes ? [['task-runtime-owner-traversals.json', runtimeTraversalBytes]] : [])];
for (const [name, bytes] of outputRows) writeExclusive(path.join(outputDir, name), bytes);
const artifacts = Object.fromEntries(outputRows.map(([name, bytes]) => [name, {
  path: path.relative(root, path.join(outputDir, name)).replaceAll(path.sep, '/'), sha256: sha256(bytes), bytes: bytes.byteLength,
}]));
const body = {
  schema: 'atlas.openspec-domain-candidate-graph-manifest.v1', runId,
  status: runtimeOwnerManifest ? 'ADVISORY_TASK_FILE_DIRECTORY_DOMAIN_RUNTIME_CANDIDATE_GRAPH'
    : 'ADVISORY_TASK_FILE_DIRECTORY_DOMAIN_CANDIDATE_GRAPH', canonicalAuthority: false, workspaceRevision: null,
  inputs: {
    packageGraphManifestSha256: sha256(packageManifestBytes),
    packageGraphNodesSha256: packageManifest.artifacts['nodes.arrow'].sha256,
    packageGraphEdgesSha256: packageManifest.artifacts['typed-edges.arrow'].sha256,
    taskPathManifestBodySha256: taskPathManifest.manifestBodySha256,
    taskPathRowsSha256: taskPathManifest.rowsSha256,
    domainCandidateManifestBodySha256: domainManifest.manifestBodySha256,
    domainCandidateArtifactSha256: domainManifest.artifactSha256,
    directorySummaryManifestSha256: sha256(summaryManifestBytes),
    directorySummaryArtifactSha256: sha256(summaryBytes),
    domainVocabularySha256: sha256(vocabularyBytes),
    runtimeOwnerManifestSha256: runtimeOwnerManifestBytes ? sha256(runtimeOwnerManifestBytes) : null,
    runtimeOwnerManifestPath: runtimeOwnerManifestArg ?? null,
    runtimeOwnerArtifactSha256: runtimeOwnerManifest?.artifacts?.['runtime-owner-candidates.arrow']?.sha256 ?? null,
  },
  counts: {
    baseNodeCount: baseNodes.length, baseEdgeCount: baseEdges.length,
    exactTaskPathsBeforeCurrentChecks: taskPathManifest.resolvedExactRepoRootFiles,
    exactTaskPathsAfterCurrentChecks: currentTaskPathRows.length, rejectCounts,
    summaryDirectoryCount: summaryRows.length, domainCandidateRows: domainRows.length,
    taskDirectoryEdges: graph.edges.filter(edge => edge.edgeType === 'FILE_PARENT_DIRECTORY_CANDIDATE').length,
    directoryDomainCandidateEdges: graph.edges.filter(edge => edge.edgeType === 'DIRECTORY_DOMAIN_CANDIDATE').length,
    runtimeOwnerCandidateEdges: graph.edges.filter(edge => edge.edgeType === 'DIRECTORY_DECLARED_RUNTIME_OWNER_CANDIDATE').length,
    tasksWithRuntimeOwnerCandidates: runtimeOwnerTraversals.filter(row => row.runtimeOwnerCapabilities.length > 0).length,
    distinctRuntimeOwnerCandidatesReached: runtimeOwnerReach.length,
    runtimeFanoutTruncatedTaskCount,
    nodeCount: graph.nodes.length, edgeCount: graph.edges.length, edgeTypeCounts,
    tasksWithDomainCandidates: traversals.filter(row => row.domainGroups.length > 0).length,
    distinctDomainGroupsReached: domainReach.length, fanoutTruncatedTaskCount,
    traversalEvidenceExcludedEdgeCount,
  },
  traversal: { maxHops: 3, maxFanout: 20, allowedEvidenceStatuses: traversalEvidenceStatuses },
  runtimeTraversal: runtimeOwnerManifest ? { maxHops: 3, maxFanout: 20,
    allowedEdgeTypes: runtimeTraversalEdgeTypes, allowedEvidenceStatuses: runtimeTraversalEvidenceStatuses } : null,
  artifacts,
  limitations: [
    'OpenSpec literal paths and file-parent relationships are advisory candidates, not requirement or ownership proof.',
    'Directory domain assignments are lexical/package-derived proposals from existing summaries, not canonical ontology admissions.',
    'Declared runtime-owner paths are ownership candidates only; they do not prove runtime execution or traffic.',
    'Candidate group identifiers are namespaced run-local graph labels and do not create domain identities.',
    'Current worktree bytes are not bound to an admitted workspace revision; workspaceRevision remains null.',
    'This local graph does not establish canonical Graphify symbol edges, ACE eligibility, production retrieval, or GPU input qualification.',
    'No PostgreSQL, Qdrant, Neo4j, Valkey, Graphify authority, model, or production projection writes occurred.',
  ], writesPerformed: true, productionWrites: false,
};
const manifestBytes = Buffer.from(`${JSON.stringify({ ...body, manifestBodySha256: sha256(Buffer.from(canonical(body))) }, null, 2)}\n`, 'utf8');
writeExclusive(path.join(outputDir, 'manifest.json'), manifestBytes);
process.stdout.write(`${JSON.stringify({ runId, outputDir: path.relative(root, outputDir).replaceAll(path.sep, '/'),
  manifestSha256: sha256(manifestBytes), ...body.counts })}\n`);

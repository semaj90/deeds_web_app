#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tableFromIPC } from 'apache-arrow';

const [graphArg, packageArg, taskArg, domainArg] = process.argv.slice(2);
if (!graphArg || !packageArg || !taskArg || !domainArg) {
  throw new Error('USAGE: node scripts/atlas/audit-openspec-domain-candidate-graph-v1.mjs <graph-manifest> <package-manifest> <task-manifest> <domain-manifest>');
}
const root = process.cwd();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const inside = relative => {
  const absolute = path.resolve(root, relative);
  const rel = path.relative(root, absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('AUDIT_PATH_OUTSIDE_REPOSITORY');
  return absolute;
};
const arrowRows = bytes => {
  const table = tableFromIPC(bytes);
  return Array.from({ length: table.numRows }, (_, index) => Object.fromEntries(
    table.schema.fields.map(field => [field.name, table.getChild(field.name).get(index)])));
};
const readJson = relative => JSON.parse(readFileSync(inside(relative), 'utf8'));
const graphPath = inside(graphArg);
const graphBytes = readFileSync(graphPath);
const graphManifest = JSON.parse(graphBytes.toString('utf8'));
const graphBody = { ...graphManifest };
delete graphBody.manifestBodySha256;
if (graphManifest.schema !== 'atlas.openspec-domain-candidate-graph-manifest.v1'
  || sha256(Buffer.from(canonical(graphBody))) !== graphManifest.manifestBodySha256) throw new Error('GRAPH_MANIFEST_CHECKSUM_MISMATCH');
const readGraphArtifact = name => {
  const descriptor = graphManifest.artifacts[name];
  const bytes = readFileSync(inside(descriptor.path));
  if (bytes.byteLength !== descriptor.bytes || sha256(bytes) !== descriptor.sha256) throw new Error(`GRAPH_ARTIFACT_CHECKSUM_MISMATCH:${name}`);
  return bytes;
};
const nodes = arrowRows(readGraphArtifact('nodes.arrow'));
const edges = arrowRows(readGraphArtifact('typed-edges.arrow'));
const traversalBytes = readGraphArtifact('task-domain-traversals.json');
const traversalsArtifact = JSON.parse(traversalBytes.toString('utf8'));
const runtimeTraversalBytes = graphManifest.artifacts['task-runtime-owner-traversals.json']
  ? readGraphArtifact('task-runtime-owner-traversals.json') : null;
const runtimeTraversalsArtifact = runtimeTraversalBytes ? JSON.parse(runtimeTraversalBytes.toString('utf8')) : null;
const byKey = new Map();
const byOrdinal = new Map();
for (let index = 0; index < nodes.length; index += 1) {
  const node = nodes[index];
  if (node.ordinal !== index || byKey.has(node.nodeKey)) throw new Error('GRAPH_NODE_ORDINAL_OR_KEY_INVALID');
  byKey.set(node.nodeKey, node);
  byOrdinal.set(index, node);
}
for (const edge of edges) if (!byOrdinal.has(edge.sourceOrdinal) || !byOrdinal.has(edge.targetOrdinal)) throw new Error('GRAPH_EDGE_ENDPOINT_INVALID');

const packageManifestBytes = readFileSync(inside(packageArg));
const packageManifest = JSON.parse(packageManifestBytes.toString('utf8'));
const taskManifest = readJson(taskArg);
const domainManifest = readJson(domainArg);
const packageBody = { ...packageManifest };
delete packageBody.manifestBodySha256;
if (sha256(Buffer.from(canonical(packageBody))) !== packageManifest.manifestBodySha256
  || packageManifest.inputs.taskPathManifestBodySha256 !== taskManifest.manifestBodySha256
  || packageManifest.inputs.taskPathRowsSha256 !== taskManifest.rowsSha256
  || sha256(packageManifestBytes) !== graphManifest.inputs.packageGraphManifestSha256) throw new Error('GRAPH_INPUT_MANIFEST_BINDING_INVALID');
const domainBody = { ...domainManifest };
delete domainBody.manifestBodySha256;
if (sha256(Buffer.from(JSON.stringify(domainBody))) !== domainManifest.manifestBodySha256
  || graphManifest.inputs.domainCandidateManifestBodySha256 !== domainManifest.manifestBodySha256
  || graphManifest.inputs.domainCandidateArtifactSha256 !== domainManifest.artifactSha256) throw new Error('DOMAIN_INPUT_MANIFEST_BINDING_INVALID');
const summaryBytes = readFileSync(inside(domainManifest.inputs.directorySummaryPath));
const domainBytes = readFileSync(inside(domainManifest.artifactPath));
if (sha256(summaryBytes) !== graphManifest.inputs.directorySummaryArtifactSha256
  || sha256(domainBytes) !== graphManifest.inputs.domainCandidateArtifactSha256) throw new Error('DOMAIN_SOURCE_ARTIFACT_CHECKSUM_MISMATCH');
const summaryRows = arrowRows(summaryBytes);
const summaryByPath = new Map(summaryRows.map(row => [row.relativePath, row]));
if (summaryByPath.size !== summaryRows.length) throw new Error('DUPLICATE_SUMMARY_PATH');
let runtimeOwnerRows = [];
let runtimeOwnerByCapability = new Map();
if (graphManifest.inputs.runtimeOwnerManifestPath) {
  const runtimeManifestPath = inside(graphManifest.inputs.runtimeOwnerManifestPath);
  const runtimeManifestBytes = readFileSync(runtimeManifestPath);
  const runtimeManifest = JSON.parse(runtimeManifestBytes.toString('utf8'));
  const runtimeBody = { ...runtimeManifest };
  delete runtimeBody.receiptSha256;
  if (runtimeManifest.schema !== 'atlas.runtime-owner-directory-candidates.v1'
    || sha256(Buffer.from(canonical(runtimeBody))) !== runtimeManifest.receiptSha256
    || sha256(runtimeManifestBytes) !== graphManifest.inputs.runtimeOwnerManifestSha256
    || runtimeManifest.status !== 'DECLARED_OWNER_PATHS_ADVISORY_ONLY'
    || runtimeManifest.canonicalAuthority !== false || runtimeManifest.executionProven !== false
    || runtimeManifest.sourceRevisionQualified !== false
    || runtimeManifest.inventorySha256 !== JSON.parse(readFileSync(path.join(path.dirname(inside(domainManifest.inputs.directorySummaryPath)), 'manifest.json'), 'utf8')).sourceInventorySha256
    || runtimeManifest.directoryArtifactSha256 !== JSON.parse(readFileSync(path.join(path.dirname(inside(domainManifest.inputs.directorySummaryPath)), 'manifest.json'), 'utf8')).inputBindings.directoryRollupArtifactSha256) {
    throw new Error('RUNTIME_OWNER_GRAPH_MANIFEST_BINDING_INVALID');
  }
  const runtimeArtifactPath = inside(path.join(path.dirname(graphManifest.inputs.runtimeOwnerManifestPath), 'runtime-owner-candidates.arrow'));
  const runtimeBytes = readFileSync(runtimeArtifactPath);
  if (sha256(runtimeBytes) !== graphManifest.inputs.runtimeOwnerArtifactSha256
    || sha256(runtimeBytes) !== runtimeManifest.artifacts?.['runtime-owner-candidates.arrow']?.sha256) {
    throw new Error('RUNTIME_OWNER_GRAPH_ARTIFACT_BINDING_INVALID');
  }
  runtimeOwnerRows = arrowRows(runtimeBytes).map(row => ({
    ...row, executionProven: row.executionProven === 1, sourceRevisionQualified: row.sourceRevisionQualified === 1,
  }));
  if (runtimeOwnerRows.length !== runtimeManifest.ownerCandidates) throw new Error('RUNTIME_OWNER_GRAPH_ROW_COUNT_INVALID');
  for (const row of runtimeOwnerRows) {
    if (runtimeOwnerByCapability.has(row.capabilityId)) throw new Error('RUNTIME_OWNER_GRAPH_DUPLICATE_CAPABILITY');
    runtimeOwnerByCapability.set(row.capabilityId, row);
  }
}
const domainRows = arrowRows(domainBytes);
const vocabulary = readJson(domainManifest.inputs.vocabularyPath);
const groupIds = new Set(vocabulary.groups.map(group => group.group_id ?? group.id));
for (const row of domainRows) {
  const summary = summaryByPath.get(row.relativePath);
  if (!summary || summary.summarySha256 !== row.summarySha256 || summary.inputDigest !== row.inputDigest) {
    throw new Error(`DOMAIN_ROW_SUMMARY_LINEAGE_MISMATCH:${row.relativePath}`);
  }
  if (row.status === 'PROPOSAL_ONLY' && (!row.candidateGroupId || !groupIds.has(row.candidateGroupId))) {
    throw new Error(`DOMAIN_ROW_GROUP_UNRESOLVED:${row.relativePath}`);
  }
}
const candidateByKey = new Map(domainRows.filter(row => row.status === 'PROPOSAL_ONLY').map(row =>
  [`${row.relativePath}\0${row.candidateGroupId}\0${row.candidateKind}\0${row.score}`, row]));
const taskPathRows = readFileSync(inside(taskManifest.rowsPath), 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const taskPathByPath = new Map(taskPathRows.filter(row => row.resolutionStatus === 'EXACT_REPO_ROOT_FILE' && row.targetFileSha256)
  .map(row => [`${row.targetPath}\0${row.targetDirectoryPath}\0${row.targetFileSha256}`, row]));

const typeCounts = {};
const fileDigestCache = new Map();
let taskDirectoryVerified = 0;
let domainEdgesVerified = 0;
let runtimeOwnerEdgesVerified = 0;
for (const edge of edges) {
  const source = byOrdinal.get(edge.sourceOrdinal);
  const target = byOrdinal.get(edge.targetOrdinal);
  typeCounts[edge.edgeType] = (typeCounts[edge.edgeType] ?? 0) + 1;
  if (edge.edgeType === 'FILE_PARENT_DIRECTORY_CANDIDATE') {
    if (!source.relativePath || source.nodeType === 'DIRECTORY' || target.nodeType !== 'DIRECTORY'
      || source.relativePath !== edge.sourcePath || target.relativePath !== path.posix.dirname(edge.sourcePath)
      || edge.sourceSha256 !== source.sourceSha256) throw new Error('FILE_DIRECTORY_EDGE_SHAPE_INVALID');
    const pathRow = taskPathByPath.get(`${edge.sourcePath}\0${target.relativePath}\0${edge.sourceSha256}`);
    if (!pathRow || pathRow.targetDirectorySummarySha256 !== edge.summarySha256
      || pathRow.targetDirectoryInputDigest !== edge.inputDigest) throw new Error('FILE_DIRECTORY_EDGE_EVIDENCE_MISMATCH');
    const summary = summaryByPath.get(target.relativePath);
    if (!summary || summary.summarySha256 !== edge.summarySha256 || summary.inputDigest !== edge.inputDigest
      || target.directorySummarySha256 !== edge.summarySha256 || target.directoryInputDigest !== edge.inputDigest) {
      throw new Error('FILE_DIRECTORY_SUMMARY_LINEAGE_MISMATCH');
    }
    let bytes = fileDigestCache.get(edge.sourcePath);
    if (!bytes) {
      const filePath = inside(edge.sourcePath);
      const stat = lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('FILE_DIRECTORY_SOURCE_NOT_REGULAR');
      bytes = readFileSync(filePath);
      fileDigestCache.set(edge.sourcePath, bytes);
    }
    if (sha256(bytes) !== edge.sourceSha256) throw new Error('FILE_DIRECTORY_SOURCE_DIGEST_MISMATCH');
    taskDirectoryVerified += 1;
  }
  if (edge.edgeType === 'DIRECTORY_DOMAIN_CANDIDATE') {
    if (source.nodeType !== 'DIRECTORY' || target.nodeType !== 'DOMAIN_GROUP_CANDIDATE'
      || edge.domainGroupId !== target.domainGroupId || edge.sourcePath !== source.relativePath) throw new Error('DIRECTORY_DOMAIN_EDGE_SHAPE_INVALID');
    const candidate = candidateByKey.get(`${source.relativePath}\0${edge.domainGroupId}\0${edge.candidateKind}\0${edge.score}`);
    if (!candidate || candidate.summarySha256 !== edge.summarySha256 || candidate.inputDigest !== edge.inputDigest
      || candidate.matchedPathTermsJson !== edge.matchedPathTermsJson
      || candidate.matchedPackageTermsJson !== edge.matchedPackageTermsJson
      || edge.evidenceStatus !== 'SUMMARY_DERIVED_PROPOSAL_ONLY') throw new Error('DIRECTORY_DOMAIN_EDGE_EVIDENCE_MISMATCH');
    domainEdgesVerified += 1;
  }
  if (edge.edgeType === 'DIRECTORY_DECLARED_RUNTIME_OWNER_CANDIDATE') {
    const runtime = runtimeOwnerByCapability.get(edge.capabilityId);
    if (!runtime || source.nodeType !== 'DIRECTORY' || target.nodeType !== 'RUNTIME_OWNER_CANDIDATE'
      || source.relativePath !== runtime.parentDirectoryPath || edge.sourcePath !== runtime.ownerPath
      || edge.sourceSha256 !== runtime.ownerFileSha256 || target.relativePath !== runtime.ownerPath
      || target.sourceSha256 !== runtime.ownerFileSha256 || target.capabilityId !== runtime.capabilityId
      || edge.evidenceStatus !== 'DECLARED_OWNER_REGISTRY_AND_CURRENT_BYTES_ONLY'
      || edge.executionProven !== 0 || edge.sourceRevisionQualified !== 0
      || target.executionProven !== 0 || target.sourceRevisionQualified !== 0) throw new Error('RUNTIME_OWNER_GRAPH_EDGE_INVALID');
    const ownerPath = inside(runtime.ownerPath);
    const stat = lstatSync(ownerPath);
    if (!stat.isFile() || stat.isSymbolicLink() || sha256(readFileSync(ownerPath)) !== runtime.ownerFileSha256) {
      throw new Error('RUNTIME_OWNER_GRAPH_CURRENT_BYTES_MISMATCH');
    }
    runtimeOwnerEdgesVerified += 1;
  }
}
if (nodes.length !== graphManifest.counts.nodeCount || edges.length !== graphManifest.counts.edgeCount
  || canonical(typeCounts) !== canonical(graphManifest.counts.edgeTypeCounts)
  || taskDirectoryVerified !== graphManifest.counts.taskDirectoryEdges
  || domainEdgesVerified !== graphManifest.counts.directoryDomainCandidateEdges
  || runtimeOwnerEdgesVerified !== (graphManifest.counts.runtimeOwnerCandidateEdges ?? 0)
  || runtimeOwnerEdgesVerified !== runtimeOwnerRows.length) throw new Error('GRAPH_READBACK_COUNTS_MISMATCH');

const allowedTypes = new Set(['OPENSPEC_TASK_REFERENCES_PATH_CANDIDATE', 'FILE_PARENT_DIRECTORY_CANDIDATE', 'DIRECTORY_DOMAIN_CANDIDATE']);
const allowedEvidenceStatuses = [
  'EXACT_PATH_AND_TARGET_DIGEST_CAPTURED',
  'PATH_PARENT_AND_SUMMARY_DIGEST_MATCH_ADVISORY',
  'SUMMARY_DERIVED_PROPOSAL_ONLY',
];
if (JSON.stringify(traversalsArtifact.allowedEvidenceStatuses) !== JSON.stringify(allowedEvidenceStatuses)
  || graphManifest.traversal?.allowedEvidenceStatuses?.join('\0') !== allowedEvidenceStatuses.join('\0')) {
  throw new Error('TRAVERSAL_EVIDENCE_POLICY_MISMATCH');
}
const allowedStatusSet = new Set(allowedEvidenceStatuses);
const traversalEvidenceExcludedEdgeCount = edges.filter(edge => allowedTypes.has(edge.edgeType)
  && !allowedStatusSet.has(edge.evidenceStatus)).length;
if (traversalsArtifact.excludedEdgeCount !== traversalEvidenceExcludedEdgeCount
  || graphManifest.counts.traversalEvidenceExcludedEdgeCount !== traversalEvidenceExcludedEdgeCount) {
  throw new Error('TRAVERSAL_EVIDENCE_EXCLUSION_COUNT_MISMATCH');
}
const adjacency = new Map();
for (const edge of edges) {
  if (!allowedTypes.has(edge.edgeType) || !allowedStatusSet.has(edge.evidenceStatus)) continue;
  if (!adjacency.has(edge.sourceOrdinal)) adjacency.set(edge.sourceOrdinal, []);
  adjacency.get(edge.sourceOrdinal).push(edge);
}
for (const rows of adjacency.values()) rows.sort((left, right) => left.targetOrdinal - right.targetOrdinal
  || left.edgeType.localeCompare(right.edgeType) || left.startByte - right.startByte);
const taskNodes = nodes.filter(node => node.nodeType === 'TASK_CANDIDATE').sort((a, b) => a.taskRef.localeCompare(b.taskRef));
if (traversalsArtifact.traversals.length !== taskNodes.length) throw new Error('TRAVERSAL_TASK_COUNT_MISMATCH');
let traversalDomainTasks = 0;
let traversalTruncated = 0;
for (let index = 0; index < taskNodes.length; index += 1) {
  const task = taskNodes[index];
  const expected = traversalsArtifact.traversals[index];
  if (expected.taskRef !== task.taskRef || expected.taskBlockSha256 !== task.taskBlockSha256) throw new Error('TRAVERSAL_TASK_IDENTITY_MISMATCH');
  const queue = [{ ordinal: task.ordinal, hops: 0 }];
  const visited = new Set([task.ordinal]);
  const groups = new Set();
  let truncated = false;
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current.hops >= 3) continue;
    const neighbors = adjacency.get(current.ordinal) ?? [];
    if (neighbors.length > 20) truncated = true;
    for (const edge of neighbors.slice(0, 20)) {
      if (visited.has(edge.targetOrdinal)) continue;
      visited.add(edge.targetOrdinal);
      const target = byOrdinal.get(edge.targetOrdinal);
      if (target.nodeType === 'DOMAIN_GROUP_CANDIDATE') groups.add(target.nodeKey);
      queue.push({ ordinal: edge.targetOrdinal, hops: current.hops + 1 });
    }
  }
  const sortedGroups = [...groups].sort();
  if (JSON.stringify(sortedGroups) !== JSON.stringify(expected.domainGroups) || expected.fanoutTruncated !== truncated) {
    throw new Error(`TRAVERSAL_RESULT_MISMATCH:${task.taskRef}`);
  }
  if (sortedGroups.length) traversalDomainTasks += 1;
  if (truncated) traversalTruncated += 1;
}
if (traversalDomainTasks !== graphManifest.counts.tasksWithDomainCandidates
  || traversalTruncated !== graphManifest.counts.fanoutTruncatedTaskCount) throw new Error('TRAVERSAL_SUMMARY_MISMATCH');

let runtimeTraversalTaskCount = 0;
let runtimeTraversalTruncated = 0;
const runtimeReachCountByCapability = new Map();
if (runtimeTraversalsArtifact) {
  const expectedTypes = [...allowedTypes, 'DIRECTORY_DECLARED_RUNTIME_OWNER_CANDIDATE'];
  const expectedStatuses = [...allowedEvidenceStatuses, 'DECLARED_OWNER_REGISTRY_AND_CURRENT_BYTES_ONLY'];
  if (runtimeTraversalsArtifact.schema !== 'atlas.openspec-runtime-owner-candidate-traversals.v1'
    || runtimeTraversalsArtifact.authorityStatus !== 'ADVISORY_DECLARED_RUNTIME_OWNER_CANDIDATE_TRAVERSAL_ONLY'
    || runtimeTraversalsArtifact.canonicalAuthority !== false
    || JSON.stringify(runtimeTraversalsArtifact.allowedEdgeTypes) !== JSON.stringify(expectedTypes)
    || JSON.stringify(runtimeTraversalsArtifact.allowedEvidenceStatuses) !== JSON.stringify(expectedStatuses)
    || graphManifest.runtimeTraversal?.allowedEdgeTypes?.join('\0') !== expectedTypes.join('\0')
    || graphManifest.runtimeTraversal?.allowedEvidenceStatuses?.join('\0') !== expectedStatuses.join('\0')) {
    throw new Error('RUNTIME_TRAVERSAL_POLICY_MISMATCH');
  }
  const typeSet = new Set(expectedTypes);
  const statusSet = new Set(expectedStatuses);
  const runtimeAdjacency = new Map();
  for (const edge of edges) {
    if (!typeSet.has(edge.edgeType) || !statusSet.has(edge.evidenceStatus)) continue;
    if (!runtimeAdjacency.has(edge.sourceOrdinal)) runtimeAdjacency.set(edge.sourceOrdinal, []);
    runtimeAdjacency.get(edge.sourceOrdinal).push(edge);
  }
  for (const rows of runtimeAdjacency.values()) rows.sort((left, right) => left.targetOrdinal - right.targetOrdinal
    || left.edgeType.localeCompare(right.edgeType) || left.startByte - right.startByte);
  if (runtimeTraversalsArtifact.traversals.length !== taskNodes.length) throw new Error('RUNTIME_TRAVERSAL_TASK_COUNT_MISMATCH');
  for (let index = 0; index < taskNodes.length; index += 1) {
    const task = taskNodes[index];
    const expected = runtimeTraversalsArtifact.traversals[index];
    if (expected.taskRef !== task.taskRef || expected.taskBlockSha256 !== task.taskBlockSha256) throw new Error('RUNTIME_TRAVERSAL_TASK_IDENTITY_MISMATCH');
    const queue = [{ ordinal: task.ordinal, hops: 0 }];
    const visited = new Set([task.ordinal]);
    const capabilities = new Set();
    let truncated = false;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if (current.hops >= 3) continue;
      const neighbors = runtimeAdjacency.get(current.ordinal) ?? [];
      if (neighbors.length > 20) truncated = true;
      for (const edge of neighbors.slice(0, 20)) {
        if (visited.has(edge.targetOrdinal)) continue;
        visited.add(edge.targetOrdinal);
        const target = byOrdinal.get(edge.targetOrdinal);
        if (target.nodeType === 'RUNTIME_OWNER_CANDIDATE') capabilities.add(target.capabilityId);
        queue.push({ ordinal: edge.targetOrdinal, hops: current.hops + 1 });
      }
    }
    const sortedCapabilities = [...capabilities].sort();
    if (JSON.stringify(sortedCapabilities) !== JSON.stringify(expected.runtimeOwnerCapabilities)
      || expected.fanoutTruncated !== truncated) throw new Error(`RUNTIME_TRAVERSAL_RESULT_MISMATCH:${task.taskRef}`);
    if (sortedCapabilities.length) runtimeTraversalTaskCount += 1;
    if (truncated) runtimeTraversalTruncated += 1;
    for (const capabilityId of sortedCapabilities) runtimeReachCountByCapability.set(capabilityId,
      (runtimeReachCountByCapability.get(capabilityId) ?? 0) + 1);
  }
  const expectedReach = [...runtimeReachCountByCapability].map(([capabilityId, taskCount]) => ({ capabilityId, taskCount }))
    .sort((left, right) => right.taskCount - left.taskCount || left.capabilityId.localeCompare(right.capabilityId));
  if (JSON.stringify(expectedReach) !== JSON.stringify(runtimeTraversalsArtifact.runtimeOwnerReach)
    || runtimeTraversalTaskCount !== graphManifest.counts.tasksWithRuntimeOwnerCandidates
    || expectedReach.length !== graphManifest.counts.distinctRuntimeOwnerCandidatesReached
    || runtimeTraversalTruncated !== graphManifest.counts.runtimeFanoutTruncatedTaskCount) {
    throw new Error('RUNTIME_TRAVERSAL_SUMMARY_MISMATCH');
  }
}

const body = {
  schema: 'atlas.openspec-domain-candidate-graph-independent-readback.v1',
  runId: graphManifest.runId,
  status: 'INDEPENDENT_ADVISORY_GRAPH_READBACK_VERIFIED',
  canonicalAuthority: false,
  manifestBodySha256: graphManifest.manifestBodySha256,
  artifactSha256: Object.fromEntries(Object.entries(graphManifest.artifacts).map(([name, descriptor]) => [name, descriptor.sha256])),
  nodeCount: nodes.length,
  edgeCount: edges.length,
  edgeTypeCounts: typeCounts,
  taskDirectoryEdgesVerified: taskDirectoryVerified,
  directoryDomainEdgesVerified: domainEdgesVerified,
  runtimeOwnerEdgesVerified,
  traversalEvidenceStatuses: allowedEvidenceStatuses,
  traversalEvidenceExcludedEdgeCount,
  domainRowsLineageVerified: domainRows.length,
  currentSourceFilesRehashed: fileDigestCache.size,
  taskCount: taskNodes.length,
  tasksWithDomainCandidates: traversalDomainTasks,
  fanoutTruncatedTaskCount: traversalTruncated,
  runtimeOwnerTaskCount: runtimeTraversalTaskCount,
  distinctRuntimeOwnerCandidatesReached: runtimeReachCountByCapability.size,
  runtimeOwnerFanoutTruncatedTaskCount: runtimeTraversalTruncated,
  productionWrites: false,
};
const receiptBytes = Buffer.from(`${JSON.stringify({ ...body, receiptSha256: sha256(Buffer.from(canonical(body))) }, null, 2)}\n`, 'utf8');
const receiptPath = path.join(path.dirname(graphPath), 'independent-readback.json');
writeFileSync(receiptPath, receiptBytes, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ ...body, receiptPath: path.relative(root, receiptPath).replaceAll(path.sep, '/'), receiptFileSha256: sha256(receiptBytes) })}\n`);

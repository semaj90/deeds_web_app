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
}
if (nodes.length !== graphManifest.counts.nodeCount || edges.length !== graphManifest.counts.edgeCount
  || canonical(typeCounts) !== canonical(graphManifest.counts.edgeTypeCounts)
  || taskDirectoryVerified !== graphManifest.counts.taskDirectoryEdges
  || domainEdgesVerified !== graphManifest.counts.directoryDomainCandidateEdges) throw new Error('GRAPH_READBACK_COUNTS_MISMATCH');

const allowedTypes = new Set(['OPENSPEC_TASK_REFERENCES_PATH_CANDIDATE', 'FILE_PARENT_DIRECTORY_CANDIDATE', 'DIRECTORY_DOMAIN_CANDIDATE']);
const adjacency = new Map();
for (const edge of edges) {
  if (!allowedTypes.has(edge.edgeType)) continue;
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
  domainRowsLineageVerified: domainRows.length,
  currentSourceFilesRehashed: fileDigestCache.size,
  taskCount: taskNodes.length,
  tasksWithDomainCandidates: traversalDomainTasks,
  fanoutTruncatedTaskCount: traversalTruncated,
  productionWrites: false,
};
const receiptBytes = Buffer.from(`${JSON.stringify({ ...body, receiptSha256: sha256(Buffer.from(canonical(body))) }, null, 2)}\n`, 'utf8');
const receiptPath = path.join(path.dirname(graphPath), 'independent-readback.json');
writeFileSync(receiptPath, receiptBytes, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ ...body, receiptPath: path.relative(root, receiptPath).replaceAll(path.sep, '/'), receiptFileSha256: sha256(receiptBytes) })}\n`);

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { buildOpenSpecPackageCandidateGraphV1, traverseOpenSpecPackageCandidateGraphV1 } from './lib/openspec-package-candidate-graph-v1.mjs';

const [packageGraphManifestArg, taskPathManifestArg, runId] = process.argv.slice(2);
if (!packageGraphManifestArg || !taskPathManifestArg || !/^[a-zA-Z0-9][a-zA-Z0-9-]{2,63}$/.test(runId ?? '')) {
  throw new Error('USAGE: node scripts/atlas/build-openspec-package-candidate-graph-v1.mjs <package-graph-manifest.json> <task-path-manifest.json> <run-id>');
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
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('INPUT_PATH_OUTSIDE_REPOSITORY');
  return absolute;
};
const rowsFromArrow = table => Array.from({ length: table.numRows }, (_, index) => Object.fromEntries(
  table.schema.fields.map(field => [field.name, table.getChild(field.name).get(index)])));
const verifyPackageManifest = manifest => {
  const body = { ...manifest };
  delete body.receiptSha256;
  if (manifest.schema !== 'atlas.directory-package-graph-candidate.v1'
    || sha256(Buffer.from(canonical(body))) !== manifest.receiptSha256) throw new Error('PACKAGE_GRAPH_MANIFEST_INVALID');
};
const packageManifestPath = resolveInsideRoot(packageGraphManifestArg);
const packageManifestBytes = readFileSync(packageManifestPath);
const packageManifest = JSON.parse(packageManifestBytes.toString('utf8'));
verifyPackageManifest(packageManifest);
const baseNodesBytes = readFileSync(resolveInsideRoot(path.relative(root, path.resolve(root, packageManifest.artifacts['nodes.arrow'].path))));
const baseEdgesBytes = readFileSync(resolveInsideRoot(path.relative(root, path.resolve(root, packageManifest.artifacts['typed-edges.arrow'].path))));
if (sha256(baseNodesBytes) !== packageManifest.artifacts['nodes.arrow'].sha256
  || sha256(baseEdgesBytes) !== packageManifest.artifacts['typed-edges.arrow'].sha256) throw new Error('PACKAGE_GRAPH_ARTIFACT_CHECKSUM_MISMATCH');
const packageNodes = rowsFromArrow(tableFromIPC(baseNodesBytes));
const rawPackageEdges = rowsFromArrow(tableFromIPC(baseEdgesBytes));
if (packageNodes.length !== packageManifest.nodeCount || rawPackageEdges.length !== packageManifest.edgeCount) throw new Error('PACKAGE_GRAPH_ARTIFACT_COUNT_MISMATCH');

const taskPathManifestPath = resolveInsideRoot(taskPathManifestArg);
const taskPathManifestBytes = readFileSync(taskPathManifestPath);
const taskPathManifest = JSON.parse(taskPathManifestBytes.toString('utf8'));
const pathBody = { ...taskPathManifest };
delete pathBody.manifestBodySha256;
if (taskPathManifest.schema !== 'atlas.openspec-source-path-edge-manifest.v1'
  || sha256(Buffer.from(JSON.stringify(pathBody))) !== taskPathManifest.manifestBodySha256) throw new Error('TASK_PATH_MANIFEST_INVALID');
const taskPathReadbackPath = path.join(path.dirname(taskPathManifestPath), 'independent-readback.json');
const taskPathReadbackBytes = readFileSync(taskPathReadbackPath);
const taskPathReadback = JSON.parse(taskPathReadbackBytes.toString('utf8'));
if (taskPathReadback.status !== 'VERIFIED_ADVISORY_REFERENCE_EDGES'
  || taskPathReadback.rowsSha256 !== taskPathManifest.rowsSha256
  || taskPathReadback.candidateRows !== taskPathManifest.rowCount
  || taskPathReadback.taskRefsVerified !== taskPathManifest.rowCount) throw new Error('TASK_PATH_INDEPENDENT_READBACK_INVALID');
const taskPathRowsBytes = readFileSync(resolveInsideRoot(taskPathManifest.rowsPath));
if (sha256(taskPathRowsBytes) !== taskPathManifest.rowsSha256) throw new Error('TASK_PATH_ROWS_CHECKSUM_MISMATCH');
const taskPathRows = taskPathRowsBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
if (taskPathRows.length !== taskPathManifest.rowCount) throw new Error('TASK_PATH_ROW_COUNT_MISMATCH');

const packageFileBytes = new Map();
const byteCheckedPackageEdges = [];
const packageEdgeRejectCounts = { SOURCE_NOT_REGULAR: 0, SOURCE_DIGEST_MISMATCH: 0, IMPORT_SPAN_MISMATCH: 0 };
for (const edge of rawPackageEdges) {
  if (edge.edgeType !== 'USES_PACKAGE_CANDIDATE') {
    byteCheckedPackageEdges.push(edge);
    continue;
  }
  let bytes = packageFileBytes.get(edge.sourcePath);
  if (!bytes) {
    try {
      const sourcePath = resolveInsideRoot(edge.sourcePath);
      const stat = lstatSync(sourcePath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('SOURCE_NOT_REGULAR');
      bytes = readFileSync(sourcePath);
      packageFileBytes.set(edge.sourcePath, bytes);
    } catch (error) {
      packageEdgeRejectCounts.SOURCE_NOT_REGULAR += 1;
      continue;
    }
  }
  if (sha256(bytes) !== edge.sourceSha256) {
    packageEdgeRejectCounts.SOURCE_DIGEST_MISMATCH += 1;
    continue;
  }
  if (bytes.subarray(edge.startByte, edge.endByte).toString('utf8') !== edge.importSpecifier) {
    packageEdgeRejectCounts.IMPORT_SPAN_MISMATCH += 1;
    continue;
  }
  byteCheckedPackageEdges.push({ ...edge, evidenceStatus: 'CURRENT_BYTES_AND_EXACT_IMPORT_SPAN_MATCH_ADVISORY' });
}

const currentTaskPathRows = [];
const taskPathRejectCounts = { TARGET_NOT_REGULAR: 0, TARGET_SIZE_CHANGED: 0, TARGET_DIGEST_MISMATCH: 0 };
for (const row of taskPathRows) {
  if (row.resolutionStatus !== 'EXACT_REPO_ROOT_FILE') continue;
  try {
    const target = resolveInsideRoot(row.targetPath);
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      taskPathRejectCounts.TARGET_NOT_REGULAR += 1;
      continue;
    }
    if (stat.size !== row.targetFileBytes) {
      taskPathRejectCounts.TARGET_SIZE_CHANGED += 1;
      continue;
    }
    if (row.targetFileSha256) {
      const bytes = readFileSync(target);
      if (sha256(bytes) !== row.targetFileSha256) {
        taskPathRejectCounts.TARGET_DIGEST_MISMATCH += 1;
        continue;
      }
    }
    currentTaskPathRows.push(row);
  } catch {
    taskPathRejectCounts.TARGET_NOT_REGULAR += 1;
  }
}
const graph = buildOpenSpecPackageCandidateGraphV1({ packageNodes, packageEdges: byteCheckedPackageEdges,
  taskPathRows: currentTaskPathRows });

const traversals = [];
const packageReachCounts = new Map();
let traversalFanoutTruncated = 0;
for (const taskNode of graph.nodes.filter(node => node.nodeType === 'TASK_CANDIDATE')) {
  const result = traverseOpenSpecPackageCandidateGraphV1({ nodes: graph.nodes, edges: graph.edges,
    startNodeKey: taskNode.nodeKey, maxHops: 2, maxFanout: 20 });
  if (result.fanoutTruncated) traversalFanoutTruncated += 1;
  const packages = result.reached.filter(node => node.nodeType === 'PACKAGE').map(node => node.nodeKey).sort();
  for (const packageKey of new Set(packages)) packageReachCounts.set(packageKey, (packageReachCounts.get(packageKey) ?? 0) + 1);
  traversals.push({ taskRef: taskNode.taskRef, taskBlockSha256: taskNode.taskBlockSha256,
    packages, reachedCount: result.reached.length, fanoutTruncated: result.fanoutTruncated });
}
traversals.sort((a, b) => a.taskRef.localeCompare(b.taskRef));
const packageReach = [...packageReachCounts].map(([packageKey, taskCount]) => ({ packageKey, taskCount }))
  .sort((a, b) => b.taskCount - a.taskCount || a.packageKey.localeCompare(b.packageKey));

const nodeFields = [
  ['ordinal', 'int32'], ['nodeKey', 'utf8'], ['nodeType', 'utf8'], ['relativePath', 'utf8'], ['sourceSha256', 'utf8'],
  ['ecosystem', 'utf8'], ['packageName', 'utf8'], ['identityStatus', 'utf8'], ['taskRef', 'utf8'], ['taskKey', 'utf8'],
  ['taskBlockSha256', 'utf8'], ['workspaceRevision', 'utf8'],
];
const edgeFields = [
  ['sourceOrdinal', 'int32'], ['targetOrdinal', 'int32'], ['edgeType', 'utf8'], ['evidenceStatus', 'utf8'],
  ['sourcePath', 'utf8'], ['sourceSha256', 'utf8'], ['importSpecifier', 'utf8'], ['startByte', 'int32'], ['endByte', 'int32'],
  ['line1', 'int32'], ['installedVersion', 'utf8'], ['installedVersionStatus', 'utf8'], ['taskBlockSha256', 'utf8'],
  ['evidenceSha256', 'utf8'], ['evidenceStartByte', 'int32'], ['evidenceEndByte', 'int32'], ['targetSha256', 'utf8'],
  ['workspaceRevision', 'utf8'],
];
const toArrow = (fields, values) => tableToIPC(new Table(Object.fromEntries(fields.map(([name, type]) => [name,
  vectorFromArray(values.map(row => row[name] ?? (type === 'int32' ? 0 : '')),
    type === 'int32' ? new Int32() : new Utf8())]))), 'file');
const nodesBytes = toArrow(nodeFields, graph.nodes);
const edgesBytes = toArrow(edgeFields, graph.edges);
const traversalBytes = Buffer.from(`${JSON.stringify({
  schema: 'atlas.openspec-package-candidate-traversals.v1', maxHops: 2, maxFanout: 20,
  traversals, packageReach,
  fanoutTruncatedTaskCount: traversalFanoutTruncated,
  authorityStatus: 'ADVISORY_CANDIDATE_TRAVERSAL_ONLY',
}, null, 2)}\n`, 'utf8');
const edgeTypeCounts = Object.fromEntries([...new Set(graph.edges.map(edge => edge.edgeType))].sort()
  .map(type => [type, graph.edges.filter(edge => edge.edgeType === type).length]));
const intersectionPaths = new Set(byteCheckedPackageEdges.filter(edge => edge.edgeType === 'USES_PACKAGE_CANDIDATE').map(edge => edge.sourcePath));
const taskPathToPackagePathCount = currentTaskPathRows.filter(row => intersectionPaths.has(row.targetPath)).length;
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', 'openspec-package-candidate-graph', runId);
mkdirSync(path.dirname(outputDir), { recursive: true });
const minimumFreeBytes = nodesBytes.byteLength + edgesBytes.byteLength + traversalBytes.byteLength + 1_000_000;
const fsStats = statfsSync(root);
if (fsStats.bavail * fsStats.bsize < minimumFreeBytes * 2) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
mkdirSync(outputDir, { recursive: false });
const artifactRows = [['nodes.arrow', nodesBytes], ['typed-edges.arrow', edgesBytes], ['task-traversals.json', traversalBytes]];
for (const [name, bytes] of artifactRows) writeExclusive(path.join(outputDir, name), bytes);
const artifacts = Object.fromEntries(artifactRows.map(([name, bytes]) => [name, {
  path: path.relative(root, path.join(outputDir, name)).replaceAll(path.sep, '/'),
  sha256: sha256(bytes), bytes: bytes.byteLength,
}]));
const body = {
  schema: 'atlas.openspec-package-candidate-graph-manifest.v1',
  runId,
  status: 'ADVISORY_TASK_FILE_PACKAGE_CANDIDATE_GRAPH',
  canonicalAuthority: false,
  workspaceRevision: null,
  inputs: {
    packageGraphReceiptSha256: packageManifest.receiptSha256,
    packageGraphNodesSha256: packageManifest.artifacts['nodes.arrow'].sha256,
    packageGraphEdgesSha256: packageManifest.artifacts['typed-edges.arrow'].sha256,
    taskPathManifestBodySha256: taskPathManifest.manifestBodySha256,
    taskPathRowsSha256: taskPathManifest.rowsSha256,
    taskPathIndependentReadbackSha256: sha256(taskPathReadbackBytes),
  },
  counts: {
    basePackageGraphNodes: packageNodes.length,
    basePackageGraphEdges: rawPackageEdges.length,
    packageEdgesRetainedAfterCurrentByteSpanChecks: byteCheckedPackageEdges.filter(edge => edge.edgeType === 'USES_PACKAGE_CANDIDATE').length,
    packageEdgeRejectCounts,
    taskPathExactRowsBeforeCurrentChecks: taskPathManifest.resolvedExactRepoRootFiles,
    taskPathExactRowsAfterCurrentChecks: currentTaskPathRows.length,
    taskPathRejectCounts,
    taskPathTargetsJoinedToPackageFiles: taskPathToPackagePathCount,
    taskNodes: graph.nodes.filter(node => node.nodeType === 'TASK_CANDIDATE').length,
    fileNodes: graph.nodes.filter(node => ['FILE', 'FILE_CANDIDATE'].includes(node.nodeType)).length,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    edgeTypeCounts,
    tasksWithPackageCandidates: traversals.filter(row => row.packages.length > 0).length,
    distinctPackagesReached: packageReach.length,
    fanoutTruncatedTaskCount: traversalFanoutTruncated,
  },
  traversal: { maxHops: 2, maxFanout: 20 },
  artifacts,
  limitations: [
    'TASK-to-file edges are literal OpenSpec path references, not semantic dependency or requirement-authority edges.',
    'Package edges remain import-span candidates even after current-byte and exact-span verification.',
    'Task, file, package, and ordinal labels are run-local candidates; no canonical identities are created.',
    'No workspace revision is admitted; this graph cannot authorize ACE, production retrieval, or projection.',
    'No production database, cache, Graphify, Neo4j, or model writes occurred.',
  ],
  writesPerformed: true,
  productionWrites: false,
};
const receiptBytes = Buffer.from(`${JSON.stringify({ ...body, manifestBodySha256: sha256(Buffer.from(canonical(body))) }, null, 2)}\n`, 'utf8');
const manifestPath = path.join(outputDir, 'manifest.json');
writeExclusive(manifestPath, receiptBytes);
process.stdout.write(`${JSON.stringify({ runId, outputDir: path.relative(root, outputDir).replaceAll(path.sep, '/'), manifestSha256: sha256(receiptBytes), ...body.counts })}\n`);

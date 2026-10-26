#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tableFromIPC } from 'apache-arrow';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const [manifestArg] = process.argv.slice(2);
if (!manifestArg) throw new Error('USAGE: node scripts/atlas/audit-openspec-package-candidate-graph-v1.mjs <manifest.json>');
const root = process.cwd();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const resolveInsideRoot = relative => {
  const absolute = path.resolve(root, relative);
  const rel = path.relative(root, absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('ARTIFACT_PATH_OUTSIDE_REPOSITORY');
  return absolute;
};
const rowsFromArrow = table => Array.from({ length: table.numRows }, (_, index) => Object.fromEntries(
  table.schema.fields.map(field => [field.name, table.getChild(field.name).get(index)])));
const manifestPath = resolveInsideRoot(manifestArg);
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const body = { ...manifest };
delete body.manifestBodySha256;
if (manifest.schema !== 'atlas.openspec-package-candidate-graph-manifest.v1'
  || sha256(Buffer.from(canonical(body))) !== manifest.manifestBodySha256) throw new Error('OVERLAY_MANIFEST_CHECKSUM_MISMATCH');
const readArtifact = name => {
  const descriptor = manifest.artifacts[name];
  const bytes = readFileSync(resolveInsideRoot(descriptor.path));
  if (sha256(bytes) !== descriptor.sha256 || bytes.byteLength !== descriptor.bytes) throw new Error(`OVERLAY_ARTIFACT_CHECKSUM_MISMATCH:${name}`);
  return bytes;
};
const nodes = rowsFromArrow(tableFromIPC(readArtifact('nodes.arrow')));
const edges = rowsFromArrow(tableFromIPC(readArtifact('typed-edges.arrow')));
const traversalBytes = readArtifact('task-traversals.json');
const traversal = JSON.parse(traversalBytes.toString('utf8'));
if (nodes.length !== manifest.counts.nodeCount || edges.length !== manifest.counts.edgeCount) throw new Error('OVERLAY_NODE_EDGE_COUNT_MISMATCH');
const byOrdinal = new Map();
const byKey = new Map();
for (let index = 0; index < nodes.length; index += 1) {
  const node = nodes[index];
  if (node.ordinal !== index || byOrdinal.has(index) || byKey.has(node.nodeKey)) throw new Error('OVERLAY_NODE_ORDINAL_INVALID');
  byOrdinal.set(index, node);
  byKey.set(node.nodeKey, node);
}
for (const edge of edges) if (!byOrdinal.has(edge.sourceOrdinal) || !byOrdinal.has(edge.targetOrdinal)) throw new Error('OVERLAY_EDGE_ENDPOINT_INVALID');
const bytesByPath = new Map();
const readCurrentFile = relative => {
  let bytes = bytesByPath.get(relative);
  if (bytes) return bytes;
  const filePath = resolveInsideRoot(relative);
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`SOURCE_NOT_REGULAR:${relative}`);
  bytes = readFileSync(filePath);
  bytesByPath.set(relative, bytes);
  return bytes;
};
let taskEdgesVerified = 0;
let packageEdgesVerified = 0;
const taskNodeRefs = new Set();
for (const edge of edges) {
  const sourceNode = byOrdinal.get(edge.sourceOrdinal);
  const targetNode = byOrdinal.get(edge.targetOrdinal);
  if (edge.edgeType === 'OPENSPEC_TASK_REFERENCES_PATH_CANDIDATE') {
    const taskRef = sourceNode.taskRef;
    if (sourceNode.nodeType !== 'TASK_CANDIDATE' || targetNode.nodeType === 'PACKAGE'
      || !taskRef || sourceNode.taskBlockSha256 !== edge.taskBlockSha256) throw new Error('TASK_EDGE_NODE_BINDING_INVALID');
    const [sourcePath, lineRef] = taskRef.split('#L');
    const line = Number(lineRef);
    const sourceBytes = readCurrentFile(sourcePath);
    if (`sha256:${sha256(sourceBytes)}` !== edge.sourceSha256 || sourceNode.sourceSha256 !== edge.sourceSha256) throw new Error(`TASK_SOURCE_DIGEST_MISMATCH:${taskRef}`);
    const text = sourceBytes.toString('utf8');
    const taskBlockLines = taskBlock(text.split(/\r?\n/), line - 1);
    if (blockHash(taskBlockLines) !== edge.taskBlockSha256) throw new Error(`TASK_BLOCK_DIGEST_MISMATCH:${taskRef}`);
    const span = sourceBytes.subarray(edge.evidenceStartByte, edge.evidenceEndByte);
    if (sha256(span) !== edge.evidenceSha256 || span.toString('utf8').replaceAll('\\', '/') !== targetNode.relativePath) throw new Error(`TASK_REFERENCE_SPAN_MISMATCH:${taskRef}`);
    if (edge.targetSha256) {
      const targetBytes = readCurrentFile(targetNode.relativePath);
      if (sha256(targetBytes) !== edge.targetSha256 || targetNode.sourceSha256 !== edge.targetSha256) throw new Error(`TASK_TARGET_DIGEST_MISMATCH:${targetNode.relativePath}`);
    }
    taskNodeRefs.add(taskRef);
    taskEdgesVerified += 1;
  }
  if (edge.edgeType === 'USES_PACKAGE_CANDIDATE') {
    const sourceBytes = readCurrentFile(edge.sourcePath);
    if (sha256(sourceBytes) !== edge.sourceSha256 || sourceNode.relativePath !== edge.sourcePath) throw new Error(`PACKAGE_SOURCE_DIGEST_MISMATCH:${edge.sourcePath}`);
    if (sourceBytes.subarray(edge.startByte, edge.endByte).toString('utf8') !== edge.importSpecifier) throw new Error(`PACKAGE_IMPORT_SPAN_MISMATCH:${edge.sourcePath}`);
    packageEdgesVerified += 1;
  }
}

const adjacency = new Map();
for (const edge of edges) {
  if (!adjacency.has(edge.sourceOrdinal)) adjacency.set(edge.sourceOrdinal, []);
  adjacency.get(edge.sourceOrdinal).push(edge);
}
for (const rows of adjacency.values()) rows.sort((a, b) => a.targetOrdinal - b.targetOrdinal || a.edgeType.localeCompare(b.edgeType)
  || (a.evidenceStartByte || a.startByte || 0) - (b.evidenceStartByte || b.startByte || 0));
let computedFanoutTruncated = 0;
let computedTasksWithPackages = 0;
const computedPackageReach = new Map();
for (const taskNode of nodes.filter(node => node.nodeType === 'TASK_CANDIDATE')) {
  const queue = [{ ordinal: taskNode.ordinal, hops: 0 }];
  const visited = new Set([taskNode.ordinal]);
  const reachedPackages = new Set();
  let wasTruncated = false;
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current.hops >= traversal.maxHops) continue;
    const neighbors = adjacency.get(current.ordinal) ?? [];
    if (neighbors.length > traversal.maxFanout) wasTruncated = true;
    for (const edge of neighbors.slice(0, traversal.maxFanout)) {
      if (visited.has(edge.targetOrdinal)) continue;
      visited.add(edge.targetOrdinal);
      const nextNode = byOrdinal.get(edge.targetOrdinal);
      queue.push({ ordinal: edge.targetOrdinal, hops: current.hops + 1 });
      if (nextNode.nodeType === 'PACKAGE') reachedPackages.add(nextNode.nodeKey);
    }
  }
  if (wasTruncated) computedFanoutTruncated += 1;
  if (reachedPackages.size) computedTasksWithPackages += 1;
  for (const packageKey of reachedPackages) computedPackageReach.set(packageKey, (computedPackageReach.get(packageKey) ?? 0) + 1);
}
const expectedReach = [...computedPackageReach].map(([packageKey, taskCount]) => ({ packageKey, taskCount }))
  .sort((a, b) => b.taskCount - a.taskCount || a.packageKey.localeCompare(b.packageKey));
if (JSON.stringify(expectedReach) !== JSON.stringify(traversal.packageReach)
  || computedTasksWithPackages !== manifest.counts.tasksWithPackageCandidates
  || computedFanoutTruncated !== traversal.fanoutTruncatedTaskCount) throw new Error('OVERLAY_TRAVERSAL_READBACK_MISMATCH');
const edgeTypeCounts = Object.fromEntries([...new Set(edges.map(edge => edge.edgeType))].sort()
  .map(type => [type, edges.filter(edge => edge.edgeType === type).length]));
if (JSON.stringify(edgeTypeCounts) !== JSON.stringify(manifest.counts.edgeTypeCounts)
  || taskEdgesVerified !== manifest.counts.taskPathExactRowsAfterCurrentChecks
  || packageEdgesVerified !== manifest.counts.packageEdgesRetainedAfterCurrentByteSpanChecks) throw new Error('OVERLAY_EDGE_COUNTS_MISMATCH');
const readback = {
  schema: 'atlas.openspec-package-candidate-graph-readback.v1',
  runId: manifest.runId,
  status: 'ADVISORY_GRAPH_READBACK_VERIFIED',
  manifestBodySha256: manifest.manifestBodySha256,
  nodeCount: nodes.length,
  edgeCount: edges.length,
  edgeTypeCounts,
  taskNodesVerified: taskNodeRefs.size,
  exactTaskPathEdgesVerified: taskEdgesVerified,
  currentByteImportSpansVerified: packageEdgesVerified,
  independentlyRecomputedTasksWithPackageCandidates: computedTasksWithPackages,
  independentlyRecomputedPackageReach: expectedReach,
  fanoutTruncatedTaskCount: computedFanoutTruncated,
  workspaceRevision: null,
  canonicalAuthority: false,
  productionWrites: false,
};
const readbackPath = path.join(path.dirname(manifestPath), 'independent-readback.json');
writeFileSync(readbackPath, `${JSON.stringify(readback, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ ...readback, readbackPath: path.relative(root, readbackPath).replaceAll(path.sep, '/'), readbackSha256: sha256(readFileSync(readbackPath)) })}\n`);

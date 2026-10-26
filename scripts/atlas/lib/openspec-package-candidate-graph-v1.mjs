import { traverseDirectoryPackageGraphV1 } from './directory-package-graph-v1.mjs';

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function buildOpenSpecPackageCandidateGraphV1({ packageNodes, packageEdges, taskPathRows }) {
  if (!Array.isArray(packageNodes) || !Array.isArray(packageEdges) || !Array.isArray(taskPathRows)) {
    throw new TypeError('OPENSPEC_PACKAGE_GRAPH_INPUT_INVALID');
  }
  const nodes = new Map();
  const packageNodeByOrdinal = new Map();
  for (const row of packageNodes) {
    if (!Number.isInteger(row.ordinal) || typeof row.nodeKey !== 'string' || !row.nodeKey
      || nodes.has(row.nodeKey) || packageNodeByOrdinal.has(row.ordinal)) throw new Error('PACKAGE_GRAPH_NODE_INVALID');
    nodes.set(row.nodeKey, { ...row, identityStatus: row.identityStatus || 'RUN_LOCAL_CANDIDATE_NOT_CANONICAL_ID' });
    packageNodeByOrdinal.set(row.ordinal, row);
  }
  const edges = [];
  for (const row of packageEdges) {
    const source = packageNodeByOrdinal.get(row.sourceOrdinal);
    const target = packageNodeByOrdinal.get(row.targetOrdinal);
    if (!source || !target) throw new Error('PACKAGE_GRAPH_EDGE_ENDPOINT_INVALID');
    edges.push({ ...row, sourceNode: source.nodeKey, targetNode: target.nodeKey });
  }
  for (const row of taskPathRows) {
    if (row.resolutionStatus !== 'EXACT_REPO_ROOT_FILE') continue;
    if (typeof row.taskRef !== 'string' || typeof row.taskKey !== 'string'
      || typeof row.taskBlockSha256 !== 'string' || typeof row.taskFileSha256 !== 'string'
      || typeof row.targetPath !== 'string' || typeof row.evidenceSha256 !== 'string'
      || !Number.isInteger(row.evidenceStartByte) || !Number.isInteger(row.evidenceEndByte)
      || row.evidenceEndByte <= row.evidenceStartByte) throw new Error('TASK_PATH_EDGE_EVIDENCE_INVALID');
    const taskKey = `task:${row.taskRef}`;
    const fileKey = `file:${row.targetPath}`;
    const taskNode = nodes.get(taskKey);
    if (taskNode && (taskNode.taskKey !== row.taskKey || taskNode.taskBlockSha256 !== row.taskBlockSha256
      || taskNode.sourceSha256 !== row.taskFileSha256)) throw new Error('TASK_NODE_REVISION_CONFLICT');
    if (!taskNode) nodes.set(taskKey, {
      nodeKey: taskKey,
      nodeType: 'TASK_CANDIDATE',
      relativePath: row.taskRef.split('#L')[0],
      sourceSha256: row.taskFileSha256,
      taskRef: row.taskRef,
      taskKey: row.taskKey,
      taskBlockSha256: row.taskBlockSha256,
      workspaceRevision: null,
      identityStatus: 'WORKTREE_TASK_REFERENCE_NOT_CANONICAL_ID',
    });
    const fileNode = nodes.get(fileKey);
    if (fileNode && row.targetFileSha256 && fileNode.sourceSha256 && row.targetFileSha256 !== fileNode.sourceSha256) {
      throw new Error('TASK_TARGET_PACKAGE_SOURCE_DIGEST_CONFLICT');
    }
    if (!fileNode) nodes.set(fileKey, {
      nodeKey: fileKey,
      nodeType: 'FILE_CANDIDATE',
      relativePath: row.targetPath,
      sourceSha256: row.targetFileSha256 ?? '',
      identityStatus: 'RUN_LOCAL_PATH_NOT_CANONICAL_ID',
    });
    edges.push({
      sourceNode: taskKey,
      targetNode: fileKey,
      edgeType: 'OPENSPEC_TASK_REFERENCES_PATH_CANDIDATE',
      evidenceStatus: row.targetFileSha256 ? 'EXACT_PATH_AND_TARGET_DIGEST_CAPTURED' : 'EXACT_PATH_NO_TARGET_DIGEST',
      sourcePath: row.taskRef.split('#L')[0],
      sourceSha256: row.taskFileSha256,
      taskBlockSha256: row.taskBlockSha256,
      evidenceSha256: row.evidenceSha256,
      evidenceStartByte: row.evidenceStartByte,
      evidenceEndByte: row.evidenceEndByte,
      line1: row.evidenceLine,
      targetSha256: row.targetFileSha256 ?? '',
      workspaceRevision: null,
    });
  }
  const nodeRows = [...nodes.values()].sort((a, b) => compare(a.nodeKey, b.nodeKey));
  const ordinalByKey = new Map(nodeRows.map((node, ordinal) => [node.nodeKey, ordinal]));
  const uniqueEdges = new Map();
  for (const edge of edges) {
    const sourceOrdinal = ordinalByKey.get(edge.sourceNode);
    const targetOrdinal = ordinalByKey.get(edge.targetNode);
    if (sourceOrdinal === undefined || targetOrdinal === undefined) throw new Error('OVERLAY_EDGE_ENDPOINT_MISSING');
    const row = { ...edge, sourceOrdinal, targetOrdinal };
    const key = JSON.stringify([sourceOrdinal, targetOrdinal, row.edgeType, row.evidenceStartByte ?? row.startByte ?? 0,
      row.evidenceEndByte ?? row.endByte ?? 0]);
    if (!uniqueEdges.has(key)) uniqueEdges.set(key, row);
  }
  const edgeRows = [...uniqueEdges.values()].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal
    || a.targetOrdinal - b.targetOrdinal || compare(a.edgeType, b.edgeType)
    || (a.evidenceStartByte ?? a.startByte ?? 0) - (b.evidenceStartByte ?? b.startByte ?? 0));
  return {
    nodes: nodeRows.map((node, ordinal) => ({ ...node, ordinal })),
    edges: edgeRows,
  };
}

export function traverseOpenSpecPackageCandidateGraphV1({ nodes, edges, startNodeKey, maxHops = 2, maxFanout = 20 }) {
  const result = traverseDirectoryPackageGraphV1({ nodes, edges, startNodeKey, maxHops, maxFanout });
  return {
    ...result,
    authorityStatus: 'ADVISORY_CANDIDATE_TRAVERSAL_ONLY',
    canonicalAuthority: false,
    workspaceRevision: null,
  };
}

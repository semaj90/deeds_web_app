const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function buildOpenSpecDomainCandidateGraphV1({ baseNodes, baseEdges, taskPathRows, summaryRows, domainRows,
  runtimeOwnerRows = [] }) {
  if (![baseNodes, baseEdges, taskPathRows, summaryRows, domainRows, runtimeOwnerRows].every(Array.isArray)) {
    throw new TypeError('DOMAIN_GRAPH_INPUT_INVALID');
  }

  const nodes = new Map();
  const nodeByOrdinal = new Map();
  for (const node of baseNodes) {
    if (!Number.isInteger(node.ordinal) || typeof node.nodeKey !== 'string' || !node.nodeKey
      || nodes.has(node.nodeKey) || nodeByOrdinal.has(node.ordinal)) throw new Error('BASE_GRAPH_NODE_INVALID');
    nodes.set(node.nodeKey, { ...node });
    nodeByOrdinal.set(node.ordinal, node.nodeKey);
  }

  const edges = [];
  for (const edge of baseEdges) {
    const sourceNode = nodeByOrdinal.get(edge.sourceOrdinal);
    const targetNode = nodeByOrdinal.get(edge.targetOrdinal);
    if (!sourceNode || !targetNode) throw new Error('BASE_GRAPH_EDGE_ENDPOINT_INVALID');
    edges.push({ ...edge, sourceNode, targetNode });
  }

  const summaryByPath = new Map();
  for (const summary of summaryRows) {
    if (typeof summary.relativePath !== 'string' || !summary.relativePath
      || !/^[a-f0-9]{64}$/i.test(summary.summarySha256 ?? '')
      || !/^[a-f0-9]{64}$/i.test(summary.inputDigest ?? '') || summaryByPath.has(summary.relativePath)) {
      throw new Error('DIRECTORY_SUMMARY_ROW_INVALID');
    }
    summaryByPath.set(summary.relativePath, summary);
  }

  const candidatesByDirectory = new Map();
  for (const row of domainRows) {
    if (!summaryByPath.has(row.relativePath)) throw new Error('DOMAIN_CANDIDATE_SUMMARY_MISSING');
    const summary = summaryByPath.get(row.relativePath);
    if (summary.summarySha256 !== row.summarySha256 || summary.inputDigest !== row.inputDigest) {
      throw new Error('DOMAIN_CANDIDATE_SUMMARY_LINEAGE_MISMATCH');
    }
    if (row.status !== 'PROPOSAL_ONLY') continue;
    if (typeof row.candidateGroupId !== 'string' || !row.candidateGroupId
      || !['DIRECT_MATCH', 'INHERITED_PARENT_CANDIDATE'].includes(row.candidateKind)
      || !Number.isFinite(row.score) || row.score < 0) throw new Error('DOMAIN_CANDIDATE_ROW_INVALID');
    if (!candidatesByDirectory.has(row.relativePath)) candidatesByDirectory.set(row.relativePath, []);
    candidatesByDirectory.get(row.relativePath).push(row);
  }

  const taskPaths = new Map();
  for (const row of taskPathRows) {
    if (row.resolutionStatus !== 'EXACT_REPO_ROOT_FILE') continue;
    if (typeof row.targetPath !== 'string' || !row.targetPath || typeof row.targetDirectoryPath !== 'string'
      || !row.targetDirectoryPath || !/^[a-f0-9]{64}$/i.test(row.targetFileSha256 ?? '')
      || !/^[a-f0-9]{64}$/i.test(row.targetDirectorySummarySha256 ?? '')
      || !/^[a-f0-9]{64}$/i.test(row.targetDirectoryInputDigest ?? '')) throw new Error('TASK_PATH_CANDIDATE_INVALID');
    const summary = summaryByPath.get(row.targetDirectoryPath);
    if (!summary || summary.summarySha256 !== row.targetDirectorySummarySha256
      || summary.inputDigest !== row.targetDirectoryInputDigest) throw new Error('TASK_DIRECTORY_SUMMARY_LINEAGE_MISMATCH');
    const fileKey = `file:${row.targetPath}`;
    const fileNode = nodes.get(fileKey);
    if (!fileNode || !['FILE', 'FILE_CANDIDATE'].includes(fileNode.nodeType)) throw new Error('TASK_FILE_GRAPH_NODE_MISSING');
    if (fileNode.sourceSha256 && fileNode.sourceSha256 !== row.targetFileSha256) throw new Error('TASK_FILE_DIGEST_CONFLICT');
    const prior = taskPaths.get(row.targetPath);
    if (prior && (prior.targetDirectoryPath !== row.targetDirectoryPath
      || prior.targetFileSha256 !== row.targetFileSha256)) throw new Error('TASK_FILE_PARENT_CONFLICT');
    taskPaths.set(row.targetPath, row);
  }

  const domainGroupIds = new Set();
  for (const rows of candidatesByDirectory.values()) for (const row of rows) domainGroupIds.add(row.candidateGroupId);
  const groupNodes = new Map([...domainGroupIds].sort(compare).map(groupId => [groupId, {
    nodeKey: `domain-candidate:${groupId}`,
    nodeType: 'DOMAIN_GROUP_CANDIDATE',
    relativePath: '',
    sourceSha256: '',
    domainGroupId: groupId,
    identityStatus: 'VOCABULARY_LABEL_CANDIDATE_NOT_CANONICAL_ID',
  }]));

  for (const [filePath, row] of [...taskPaths].sort(([left], [right]) => compare(left, right))) {
    const directoryKey = `dir:${row.targetDirectoryPath}`;
    const summary = summaryByPath.get(row.targetDirectoryPath);
    const existingDirectory = nodes.get(directoryKey);
    if (existingDirectory && existingDirectory.nodeType !== 'DIRECTORY') throw new Error('DIRECTORY_NODE_TYPE_CONFLICT');
    if (!existingDirectory) nodes.set(directoryKey, {
      nodeKey: directoryKey,
      nodeType: 'DIRECTORY',
      relativePath: row.targetDirectoryPath,
      sourceSha256: '',
      identityStatus: 'PATH_DERIVED_DIRECTORY_CANDIDATE_NOT_CANONICAL_ID',
    });
    const directoryNode = nodes.get(directoryKey);
    if (directoryNode.directorySummarySha256 && directoryNode.directorySummarySha256 !== summary.summarySha256) {
      throw new Error('DIRECTORY_SUMMARY_DIGEST_CONFLICT');
    }
    directoryNode.directorySummarySha256 = summary.summarySha256;
    directoryNode.directoryInputDigest = summary.inputDigest;
    edges.push({ sourceNode: `file:${filePath}`, targetNode: directoryKey,
      edgeType: 'FILE_PARENT_DIRECTORY_CANDIDATE', evidenceStatus: 'PATH_PARENT_AND_SUMMARY_DIGEST_MATCH_ADVISORY',
      sourcePath: filePath, sourceSha256: row.targetFileSha256, summarySha256: summary.summarySha256,
      inputDigest: summary.inputDigest, workspaceRevision: '' });

    for (const candidate of candidatesByDirectory.get(row.targetDirectoryPath) ?? []) {
      const groupKey = `domain-candidate:${candidate.candidateGroupId}`;
      if (!nodes.has(groupKey)) nodes.set(groupKey, groupNodes.get(candidate.candidateGroupId));
      edges.push({ sourceNode: directoryKey, targetNode: groupKey,
        edgeType: 'DIRECTORY_DOMAIN_CANDIDATE', evidenceStatus: 'SUMMARY_DERIVED_PROPOSAL_ONLY',
        sourcePath: row.targetDirectoryPath, summarySha256: candidate.summarySha256,
        inputDigest: candidate.inputDigest, domainGroupId: candidate.candidateGroupId,
        candidateKind: candidate.candidateKind, score: candidate.score,
        matchedPathTermsJson: candidate.matchedPathTermsJson ?? '[]',
        matchedPackageTermsJson: candidate.matchedPackageTermsJson ?? '[]', workspaceRevision: '' });
    }
  }

  const runtimeCapabilityIds = new Set();
  for (const row of runtimeOwnerRows) {
    if (typeof row.capabilityId !== 'string' || !row.capabilityId || runtimeCapabilityIds.has(row.capabilityId)
      || typeof row.ownerPath !== 'string' || !/^[a-f0-9]{64}$/.test(row.ownerFileSha256 ?? '')
      || row.parentDirectoryPath !== (row.ownerPath.includes('/') ? row.ownerPath.slice(0, row.ownerPath.lastIndexOf('/')) : '.')
      || row.evidenceKind !== 'DECLARED_RUNTIME_OWNER_PATH_CANDIDATE' || row.executionProven !== false
      || row.sourceRevisionQualified !== false) throw new Error('RUNTIME_OWNER_GRAPH_ROW_INVALID');
    runtimeCapabilityIds.add(row.capabilityId);
    const directoryKey = `dir:${row.parentDirectoryPath}`;
    if (!nodes.has(directoryKey)) nodes.set(directoryKey, {
      nodeKey: directoryKey,
      nodeType: 'DIRECTORY',
      relativePath: row.parentDirectoryPath,
      sourceSha256: '',
      identityStatus: 'PATH_DERIVED_DIRECTORY_CANDIDATE_NOT_CANONICAL_ID',
    });
    const runtimeKey = `runtime-owner-candidate:${row.capabilityId}`;
    if (nodes.has(runtimeKey)) throw new Error('RUNTIME_OWNER_GRAPH_NODE_COLLISION');
    nodes.set(runtimeKey, {
      nodeKey: runtimeKey,
      nodeType: 'RUNTIME_OWNER_CANDIDATE',
      relativePath: row.ownerPath,
      sourceSha256: row.ownerFileSha256,
      ownerClassification: row.ownerClassification ?? 'UNCLASSIFIED',
      capabilityId: row.capabilityId,
      identityStatus: 'DECLARED_CAPABILITY_LABEL_NOT_RUNTIME_ID',
      executionProven: false,
      sourceRevisionQualified: false,
    });
    edges.push({
      sourceNode: directoryKey,
      targetNode: runtimeKey,
      edgeType: 'DIRECTORY_DECLARED_RUNTIME_OWNER_CANDIDATE',
      evidenceStatus: 'DECLARED_OWNER_REGISTRY_AND_CURRENT_BYTES_ONLY',
      sourcePath: row.ownerPath,
      sourceSha256: row.ownerFileSha256,
      capabilityId: row.capabilityId,
      ownerClassification: row.ownerClassification ?? 'UNCLASSIFIED',
      executionProven: false,
      sourceRevisionQualified: false,
      workspaceRevision: '',
    });
  }

  const nodeRows = [...nodes.values()].sort((left, right) => compare(left.nodeKey, right.nodeKey))
    .map((node, ordinal) => ({ ...node, ordinal }));
  const ordinalByKey = new Map(nodeRows.map(node => [node.nodeKey, node.ordinal]));
  const uniqueEdges = new Map();
  for (const edge of edges) {
    const sourceOrdinal = ordinalByKey.get(edge.sourceNode);
    const targetOrdinal = ordinalByKey.get(edge.targetNode);
    if (sourceOrdinal === undefined || targetOrdinal === undefined) throw new Error('DOMAIN_GRAPH_EDGE_ENDPOINT_MISSING');
    const row = { ...edge, sourceOrdinal, targetOrdinal };
    const key = JSON.stringify([sourceOrdinal, targetOrdinal, row.edgeType, row.sourcePath ?? '', row.sourceSha256 ?? '',
      row.importSpecifier ?? '', row.startByte ?? 0, row.endByte ?? 0, row.evidenceSha256 ?? '',
      row.evidenceStartByte ?? 0, row.evidenceEndByte ?? 0, row.taskBlockSha256 ?? '',
      row.summarySha256 ?? '', row.domainGroupId ?? '', row.candidateKind ?? '', row.capabilityId ?? '']);
    uniqueEdges.set(key, row);
  }
  const edgeRows = [...uniqueEdges.values()].sort((left, right) => left.sourceOrdinal - right.sourceOrdinal
    || left.targetOrdinal - right.targetOrdinal || compare(left.edgeType, right.edgeType));
  return { nodes: nodeRows, edges: edgeRows };
}

export function createOpenSpecDomainCandidateTraversalIndexV1({ nodes, edges, edgeTypes, evidenceStatuses }) {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new TypeError('DOMAIN_GRAPH_INDEX_INPUT_INVALID');
  if (edgeTypes !== undefined && (!Array.isArray(edgeTypes) || edgeTypes.some(type => typeof type !== 'string')))
    throw new TypeError('DOMAIN_GRAPH_INDEX_EDGE_TYPES_INVALID');
  if (evidenceStatuses !== undefined && (!Array.isArray(evidenceStatuses)
    || evidenceStatuses.some(status => typeof status !== 'string')))
    throw new TypeError('DOMAIN_GRAPH_INDEX_EVIDENCE_STATUSES_INVALID');
  const allowedEdgeTypes = edgeTypes ? new Set(edgeTypes) : null;
  const allowedEvidenceStatuses = evidenceStatuses ? new Set(evidenceStatuses) : null;
  const nodesByKey = new Map(nodes.map(node => [node.nodeKey, node]));
  if (nodesByKey.size !== nodes.length) throw new Error('DOMAIN_GRAPH_INDEX_DUPLICATE_NODE');
  const adjacency = new Map();
  for (const edge of edges) {
    if (allowedEdgeTypes && !allowedEdgeTypes.has(edge.edgeType)) continue;
    if (allowedEvidenceStatuses && !allowedEvidenceStatuses.has(edge.evidenceStatus)) continue;
    const sourceNode = edge.sourceNode ?? nodes[edge.sourceOrdinal]?.nodeKey;
    const targetNode = edge.targetNode ?? nodes[edge.targetOrdinal]?.nodeKey;
    if (!nodesByKey.has(sourceNode) || !nodesByKey.has(targetNode)) throw new Error('DOMAIN_GRAPH_INDEX_EDGE_ENDPOINT_MISSING');
    if (!adjacency.has(sourceNode)) adjacency.set(sourceNode, []);
    adjacency.get(sourceNode).push({ edge, targetNode });
  }
  for (const neighbors of adjacency.values()) neighbors.sort((left, right) =>
    (left.edge.targetOrdinal ?? 0) - (right.edge.targetOrdinal ?? 0)
      || compare(left.edge.edgeType ?? '', right.edge.edgeType ?? '')
      || (left.edge.startByte ?? 0) - (right.edge.startByte ?? 0));
  return { nodesByKey, adjacency,
    allowedEdgeTypes: allowedEdgeTypes ? [...allowedEdgeTypes].sort(compare) : null,
    allowedEvidenceStatuses: allowedEvidenceStatuses ? [...allowedEvidenceStatuses].sort(compare) : null };
}

export function traverseOpenSpecDomainCandidateGraphV1({ index, nodes, edges, startNodeKey, maxHops = 3, maxFanout = 20,
  edgeTypes, evidenceStatuses }) {
  const traversalIndex = index ?? createOpenSpecDomainCandidateTraversalIndexV1({ nodes, edges, edgeTypes, evidenceStatuses });
  if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 4
    || !Number.isInteger(maxFanout) || maxFanout < 1 || maxFanout > 100) throw new Error('TRAVERSAL_BOUNDS_INVALID');
  if (!traversalIndex.nodesByKey.has(startNodeKey)) throw new Error('TRAVERSAL_START_NODE_MISSING');
  const queue = [{ nodeKey: startNodeKey, hops: 0, path: [startNodeKey], edgePath: [] }];
  const visited = new Set([startNodeKey]);
  const reached = [];
  let fanoutTruncated = false;
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current.hops >= maxHops) continue;
    const neighbors = traversalIndex.adjacency.get(current.nodeKey) ?? [];
    if (neighbors.length > maxFanout) fanoutTruncated = true;
    for (const { edge, targetNode } of neighbors.slice(0, maxFanout)) {
      if (visited.has(targetNode)) continue;
      visited.add(targetNode);
      const next = { nodeKey: targetNode, hops: current.hops + 1,
        path: [...current.path, targetNode], edgePath: [...current.edgePath, edge.edgeType] };
      reached.push({ ...next, nodeType: traversalIndex.nodesByKey.get(targetNode)?.nodeType ?? 'UNKNOWN' });
      queue.push(next);
    }
  }
  const result = { startNodeKey, maxHops, maxFanout, reached, fanoutTruncated,
    allowedEdgeTypes: traversalIndex.allowedEdgeTypes ?? null,
    allowedEvidenceStatuses: traversalIndex.allowedEvidenceStatuses ?? null,
    status: fanoutTruncated ? 'BOUNDED_CANDIDATE_TRAVERSAL_TRUNCATED' : 'BOUNDED_CANDIDATE_TRAVERSAL_COMPLETE' };
  return { ...result, authorityStatus: 'ADVISORY_DOMAIN_CANDIDATE_TRAVERSAL_ONLY', canonicalAuthority: false,
    workspaceRevision: null };
}

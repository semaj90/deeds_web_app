const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function buildDirectoryPackageGraphV1({ directories, references }) {
  if (!Array.isArray(directories) || !Array.isArray(references)) throw new TypeError('GRAPH_INPUT_INVALID');
  const directorySet = new Set(directories.map(row => row.directoryPath));
  const nodes = new Map();
  const edges = [];
  const sourceDigests = new Map();
  const addNode = (key, type, fields = {}) => {
    const previous = nodes.get(key);
    if (previous && previous.nodeType !== type) throw new Error('GRAPH_NODE_TYPE_CONFLICT');
    nodes.set(key, { nodeKey: key, nodeType: type, ...previous, ...fields });
  };

  for (const reference of references) {
    if (!reference.sourcePath || !/^[a-f0-9]{64}$/.test(reference.sourceSha256 ?? '')
      || !Number.isInteger(reference.startByte) || !Number.isInteger(reference.endByte)
      || reference.startByte < 0 || reference.endByte <= reference.startByte
      || !['npm', 'pypi'].includes(reference.ecosystem) || !reference.packageName) {
      throw new Error('PACKAGE_REFERENCE_EVIDENCE_INVALID');
    }
    const oldDigest = sourceDigests.get(reference.sourcePath);
    if (oldDigest && oldDigest !== reference.sourceSha256) throw new Error('SOURCE_REVISION_CONFLICT');
    sourceDigests.set(reference.sourcePath, reference.sourceSha256);
    const sourceNode = `file:${reference.sourcePath}`;
    const packageNode = `package:${reference.ecosystem}:${reference.packageName}`;
    addNode(sourceNode, 'FILE', { relativePath: reference.sourcePath, sourceSha256: reference.sourceSha256,
      identityStatus: 'PATH_AND_CONTENT_DIGEST_CANDIDATE_NOT_CANONICAL_SOURCE_ID' });
    addNode(packageNode, 'PACKAGE', { ecosystem: reference.ecosystem, packageName: reference.packageName,
      identityStatus: 'RUN_LOCAL_PACKAGE_LABEL_NOT_CANONICAL_PACKAGE_ID' });
    edges.push({ sourceNode, targetNode: packageNode, edgeType: 'USES_PACKAGE_CANDIDATE',
      evidenceStatus: reference.evidenceStatus ?? 'UNQUALIFIED_PACKAGE_REFERENCE', sourcePath: reference.sourcePath,
      sourceSha256: reference.sourceSha256, importSpecifier: reference.importSpecifier ?? '',
      startByte: reference.startByte, endByte: reference.endByte, line1: reference.line1 ?? 0,
      installedVersion: reference.installedVersion ?? '', installedVersionStatus: reference.installedVersionStatus ?? '' });

    let parent = reference.sourcePath.includes('/') ? reference.sourcePath.slice(0, reference.sourcePath.lastIndexOf('/')) : '.';
    const chain = [];
    while (parent && parent !== '.') {
      if (!directorySet.has(parent)) throw new Error('SOURCE_PARENT_NOT_IN_DIRECTORY_SNAPSHOT');
      chain.push(parent);
      const next = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : '.';
      if (next === parent) throw new Error('DIRECTORY_ANCESTRY_LOOP');
      parent = next;
    }
    if (!directorySet.has('.')) throw new Error('ROOT_DIRECTORY_NOT_IN_SNAPSHOT');
    addNode('dir:.', 'DIRECTORY', { relativePath: '.', identityStatus: 'RUN_LOCAL_PATH_NOT_CANONICAL_ID' });
    for (const directory of chain) addNode(`dir:${directory}`, 'DIRECTORY', {
      relativePath: directory, identityStatus: 'RUN_LOCAL_PATH_NOT_CANONICAL_ID',
    });
    const childFile = sourceNode;
    let childPath = reference.sourcePath;
    let currentParent = reference.sourcePath.includes('/') ? reference.sourcePath.slice(0, reference.sourcePath.lastIndexOf('/')) : '.';
    edges.push({ sourceNode: `dir:${currentParent}`, targetNode: childFile, edgeType: 'CONTAINS',
      evidenceStatus: 'PATH_DERIVED_CANDIDATE', sourcePath: childPath, sourceSha256: reference.sourceSha256,
      importSpecifier: '', startByte: 0, endByte: 0, line1: 0, installedVersion: '', installedVersionStatus: '' });
    while (currentParent !== '.') {
      const parentPath = currentParent.includes('/') ? currentParent.slice(0, currentParent.lastIndexOf('/')) : '.';
      edges.push({ sourceNode: `dir:${parentPath}`, targetNode: `dir:${currentParent}`, edgeType: 'CONTAINS',
        evidenceStatus: 'PATH_DERIVED_CANDIDATE', sourcePath: currentParent, sourceSha256: '',
        importSpecifier: '', startByte: 0, endByte: 0, line1: 0, installedVersion: '', installedVersionStatus: '' });
      currentParent = parentPath;
    }
  }

  const nodeRows = [...nodes.values()].sort((a, b) => compare(a.nodeKey, b.nodeKey));
  const ordinalByKey = new Map(nodeRows.map((node, ordinal) => [node.nodeKey, ordinal]));
  const uniqueEdges = new Map();
  for (const edge of edges) {
    const row = { ...edge, sourceOrdinal: ordinalByKey.get(edge.sourceNode), targetOrdinal: ordinalByKey.get(edge.targetNode) };
    const key = JSON.stringify([row.sourceOrdinal, row.targetOrdinal, row.edgeType, row.startByte, row.endByte]);
    uniqueEdges.set(key, row);
  }
  const edgeRows = [...uniqueEdges.values()].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal
    || a.targetOrdinal - b.targetOrdinal || compare(a.edgeType, b.edgeType)
    || a.startByte - b.startByte || a.endByte - b.endByte);
  return { nodes: nodeRows.map((node, ordinal) => ({ ...node, ordinal })), edges: edgeRows };
}

export function traverseDirectoryPackageGraphV1({ nodes, edges, startNodeKey, maxHops = 2, maxFanout = 20 }) {
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Number.isInteger(maxHops) || maxHops < 1 || maxHops > 4
    || !Number.isInteger(maxFanout) || maxFanout < 1 || maxFanout > 100) throw new Error('TRAVERSAL_BOUNDS_INVALID');
  const byKey = new Map(nodes.map(node => [node.nodeKey, node]));
  if (!byKey.has(startNodeKey)) throw new Error('TRAVERSAL_START_NODE_MISSING');
  const adjacency = new Map();
  for (const edge of edges) {
    const sourceNode = edge.sourceNode ?? edge.sourceNodeKey ?? nodes[edge.sourceOrdinal]?.nodeKey;
    const targetNode = edge.targetNode ?? edge.targetNodeKey ?? nodes[edge.targetOrdinal]?.nodeKey;
    if (!byKey.has(sourceNode) || !byKey.has(targetNode)) throw new Error('TRAVERSAL_EDGE_ENDPOINT_MISSING');
    if (!adjacency.has(sourceNode)) adjacency.set(sourceNode, []);
    adjacency.get(sourceNode).push({ ...edge, sourceNode, targetNode });
  }
  for (const neighbors of adjacency.values()) neighbors.sort((a, b) => a.targetOrdinal - b.targetOrdinal
    || compare(a.edgeType, b.edgeType) || a.startByte - b.startByte);
  const queue = [{ nodeKey: startNodeKey, hops: 0, path: [startNodeKey], edgePath: [] }];
  const visited = new Set([startNodeKey]);
  const reached = [];
  let fanoutTruncated = false;
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current.hops >= maxHops) continue;
    const neighbors = adjacency.get(current.nodeKey) ?? [];
    if (neighbors.length > maxFanout) fanoutTruncated = true;
    for (const edge of neighbors.slice(0, maxFanout)) {
      if (visited.has(edge.targetNode)) continue;
      visited.add(edge.targetNode);
      const next = { nodeKey: edge.targetNode, hops: current.hops + 1,
        path: [...current.path, edge.targetNode], edgePath: [...current.edgePath, edge.edgeType] };
      reached.push({ ...next, nodeType: byKey.get(edge.targetNode)?.nodeType ?? 'UNKNOWN' });
      queue.push(next);
    }
  }
  return { startNodeKey, maxHops, maxFanout, reached, fanoutTruncated,
    status: fanoutTruncated ? 'BOUNDED_CANDIDATE_TRAVERSAL_TRUNCATED' : 'BOUNDED_CANDIDATE_TRAVERSAL_COMPLETE' };
}

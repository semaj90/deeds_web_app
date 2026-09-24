/** Read-only Parent Atlas taxonomy invariant calculation. */
export function evaluateTaxonomyForestV1(nodes, typedEdges = []) {
  const byKey = new Map();
  const duplicateKeys = new Set();
  for (const node of nodes) {
    if (byKey.has(node.node_key)) duplicateKeys.add(node.node_key);
    else byKey.set(node.node_key, node);
  }

  const missingParents = nodes.filter((node) => node.parent_key != null && node.parent_key !== '' && !byKey.has(node.parent_key));
  const cycleStarts = new Set();
  const complete = new Set();
  for (const node of byKey.values()) {
    const chain = new Set();
    let current = node.node_key;
    while (current && byKey.has(current) && !complete.has(current)) {
      if (chain.has(current)) {
        cycleStarts.add(node.node_key);
        break;
      }
      chain.add(current);
      current = byKey.get(current).parent_key;
    }
    for (const key of chain) complete.add(key);
  }

  const multiParentTargets = new Map();
  for (const edge of typedEdges) {
    const key = `${edge.relation}\u0000${edge.target_key}`;
    if (!multiParentTargets.has(key)) multiParentTargets.set(key, new Set());
    multiParentTargets.get(key).add(edge.source_key);
  }
  const typedRelationMultiParentCounts = {};
  const typedRelationDag = {};
  const edgesByRelation = new Map();
  for (const edge of typedEdges) {
    if (!edgesByRelation.has(edge.relation)) edgesByRelation.set(edge.relation, []);
    edgesByRelation.get(edge.relation).push(edge);
  }
  for (const [key, parents] of multiParentTargets) {
    if (parents.size < 2) continue;
    const relation = key.split('\u0000', 1)[0];
    typedRelationMultiParentCounts[relation] = (typedRelationMultiParentCounts[relation] ?? 0) + 1;
  }
  for (const [relation, edges] of edgesByRelation) {
    const outgoing = new Map();
    const inDegree = new Map();
    for (const edge of edges) {
      if (!outgoing.has(edge.source_key)) outgoing.set(edge.source_key, new Set());
      if (!outgoing.has(edge.target_key)) outgoing.set(edge.target_key, new Set());
      if (!outgoing.get(edge.source_key).has(edge.target_key)) {
        outgoing.get(edge.source_key).add(edge.target_key);
        inDegree.set(edge.target_key, (inDegree.get(edge.target_key) ?? 0) + 1);
        if (!inDegree.has(edge.source_key)) inDegree.set(edge.source_key, 0);
      }
    }
    const ready = [...inDegree].filter(([, degree]) => degree === 0).map(([key]) => key);
    let visited = 0;
    while (ready.length) {
      const source = ready.pop();
      visited += 1;
      for (const target of outgoing.get(source) ?? []) {
        const degree = inDegree.get(target) - 1;
        inDegree.set(target, degree);
        if (degree === 0) ready.push(target);
      }
    }
    typedRelationDag[relation] = {
      nodeCount: inDegree.size,
      edgeCount: [...outgoing.values()].reduce((sum, targets) => sum + targets.size, 0),
      isDag: visited === inDegree.size,
      multiParentTargetCount: typedRelationMultiParentCounts[relation] ?? 0,
    };
  }

  const roots = nodes.filter((node) => node.parent_key == null || node.parent_key === '').length;
  const cycleCount = cycleStarts.size;
  return {
    nodeCount: nodes.length,
    uniqueNodeCount: byKey.size,
    rootCount: roots,
    duplicateNodeKeyCount: duplicateKeys.size,
    missingParentCount: missingParents.length,
    cycleStartCount: cycleCount,
    maxParentChainLength: Math.max(0, ...[...byKey.keys()].map((key) => {
      let depth = 0;
      let current = key;
      const seen = new Set();
      while (current && byKey.has(current) && !seen.has(current)) {
        seen.add(current);
        depth += 1;
        current = byKey.get(current).parent_key;
      }
      return depth;
    })),
    typedRelationMultiParentCounts,
    typedRelationDag,
    isBranchingForest: duplicateKeys.size === 0 && missingParents.length === 0 && cycleCount === 0,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

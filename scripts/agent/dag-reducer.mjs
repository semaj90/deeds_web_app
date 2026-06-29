#!/usr/bin/env node
/**
 * DAG Reducer — Collapse Event Graph into Current Blockers
 *
 * Input: 50+ noisy log events
 * Process:
 *   - Group by feature_id/source_ref
 *   - Merge duplicates
 *   - Keep highest severity/latest
 *   - Compute transitive closure (what blocks what)
 * Output: 3-7 current blockers (mutable state to act on)
 */

export class DagReducer {
  constructor() {
    this.events = [];
    this.edges = [];
    this.nodeIndex = new Map();
  }

  /**
   * Add event to DAG
   */
  addEvent(event) {
    const key = `${event.source}:${event.event_type}`;

    if (this.nodeIndex.has(key)) {
      const existing = this.nodeIndex.get(key);
      // Keep highest severity
      const severityRank = { error: 0, warning: 1, info: 2 };
      if (severityRank[event.severity] < severityRank[existing.severity]) {
        Object.assign(existing, event);
      }
    } else {
      this.nodeIndex.set(key, event);
      this.events.push(event);
    }
  }

  /**
   * Define blocking relationship (A blocks B)
   */
  addBlocker(fromKey, toKey) {
    this.edges.push({ from: fromKey, to: toKey, relation: 'blocks' });
  }

  /**
   * Compute transitive closure via DFS
   * Returns: Map of node → depth (distance to root blocker)
   */
  computeDepth() {
    const depth = new Map();
    const visited = new Set();

    const dfs = (key, d) => {
      if (visited.has(key)) return;
      visited.add(key);
      depth.set(key, Math.max(depth.get(key) || 0, d));

      // Find all edges FROM this node (what does it block?)
      const outgoing = this.edges.filter(e => e.from === key);
      for (const edge of outgoing) {
        dfs(edge.to, d + 1);
      }
    };

    // Find root blockers (no incoming edges)
    const incoming = new Set(this.edges.map(e => e.to));
    const roots = Array.from(this.nodeIndex.keys()).filter(k => !incoming.has(k));

    for (const root of roots) {
      dfs(root, 0);
    }

    return depth;
  }

  /**
   * Reduce to top N blockers by severity + depth
   */
  reduce(maxCount = 7) {
    const severityScore = { error: 0, warning: 1, info: 2 };
    const depth = this.computeDepth();

    const scored = Array.from(this.nodeIndex.values()).map(node => {
      const key = `${node.source}:${node.event_type}`;
      const nodeDepth = depth.get(key) || 0;
      const severity = severityScore[node.severity];

      return {
        ...node,
        score: severity * 100 + (10 - nodeDepth) // Lower severity = higher score (error=0), deeper = higher priority
      };
    });

    return scored.sort((a, b) => a.score - b.score).slice(0, maxCount);
  }
}

/**
 * Example usage
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const reducer = new DagReducer();

  // Add example events
  reducer.addEvent({
    source: 'logs',
    event_type: 'gpu_initialization',
    title: 'GPU worker pool initialized',
    severity: 'info',
    body: 'tensorrt-worker-pool.ts: 4 threads'
  });

  reducer.addEvent({
    source: 'git',
    event_type: 'repo_dirty',
    title: '3 modified files',
    severity: 'info',
    body: 'src/lib/gpu/tensorrt-worker.js, som-clustering-cuda.ts, ...'
  });

  reducer.addEvent({
    source: 'reports',
    event_type: 'startup_chain',
    title: 'Valkey connection verified',
    severity: 'info',
    body: 'Semantic cache WARM (24,896 keys)'
  });

  // Blocking relationships
  reducer.addBlocker('reports:startup_chain', 'reports:phase85_integration');

  // Reduce
  const blockers = reducer.reduce();
  console.log(`Top ${blockers.length} blockers:`);
  blockers.forEach((b, i) => {
    console.log(`  ${i + 1}. ${b.title} (${b.severity})`);
  });
}

export default DagReducer;

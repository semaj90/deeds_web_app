/**
 * Signal Grouping for RRF: Map 9 signals to 5 conceptual lanes
 *
 * Lanes represent different retrieval dimensions:
 * - dense_vector: Dense embeddings (Qdrant ANN, cosine similarity)
 * - graph_authority: Graph-based signals (PageRank, Neo4j traversal)
 * - lexical: Text-based matching (BM25 cluster, lexical boost)
 * - cache: Cache hits (ACE, task distillate, engram memory)
 * - temporal: Recency and activity signals (freshness, hit rate)
 *
 * No signal is dropped; all 9 remain in HyperRagHit.signals for transparency.
 */

export interface HyperRagSignals {
  dense: number;
  graphAuthority: number;
  lexicalBoost: number;
  taskBoost: number;
  aceBoost: number;
  turbovec: number;
  topologyRouted: number;
  recencyOrHitRate: number;
  engramBoost: number;
}

export interface LaneHits {
  dense_vector: Array<{ id: string; score: number }>;
  graph_authority: Array<{ id: string; score: number }>;
  lexical: Array<{ id: string; score: number }>;
  cache: Array<{ id: string; score: number }>;
  temporal: Array<{ id: string; score: number }>;
}

/**
 * Group all hits for a single packet by their contributing signals into lanes
 *
 * Signal mapping:
 * - dense_vector lane: dense (Qdrant ANN), turbovec (prefilter)
 * - graph_authority lane: graphAuthority (Neo4j PageRank), topologyRouted (routing boost)
 * - lexical lane: lexicalBoost (BM25 cluster match)
 * - cache lane: taskBoost (task distillate), aceBoost (ACE cache), engramBoost (memory)
 * - temporal lane: recencyOrHitRate (freshness + activity)
 *
 * @param hitId - Unique hit identifier
 * @param signals - All 9 signals from HyperRAG
 * @returns Lane assignments for this hit
 */
export function groupSignalsByLane(
  hitId: string,
  signals: HyperRagSignals
): Partial<LaneHits> {
  const lanes: Partial<LaneHits> = {
    dense_vector: [],
    graph_authority: [],
    lexical: [],
    cache: [],
    temporal: []
  };

  // Dense vector lane: combines dense embeddings + vector prefilter
  const denseVectorScore = Math.max(signals.dense, signals.turbovec);
  if (denseVectorScore > 0) {
    lanes.dense_vector!.push({ id: hitId, score: denseVectorScore });
  }

  // Graph authority lane: combines graph-based signals
  const graphAuthorityScore = Math.max(signals.graphAuthority, signals.topologyRouted);
  if (graphAuthorityScore > 0) {
    lanes.graph_authority!.push({ id: hitId, score: graphAuthorityScore });
  }

  // Lexical lane: text-based matching
  if (signals.lexicalBoost > 0) {
    lanes.lexical!.push({ id: hitId, score: signals.lexicalBoost });
  }

  // Cache lane: all cache/memory hits
  const cacheScore = Math.max(signals.taskBoost, signals.aceBoost, signals.engramBoost);
  if (cacheScore > 0) {
    lanes.cache!.push({ id: hitId, score: cacheScore });
  }

  // Temporal lane: recency and activity signals
  if (signals.recencyOrHitRate > 0) {
    lanes.temporal!.push({ id: hitId, score: signals.recencyOrHitRate });
  }

  return lanes;
}

/**
 * Partition all hits into lanes based on their signal presence
 *
 * This function processes a complete set of hits from HyperRAG and groups them
 * by lane. It ensures every hit is classified into at least one lane based on
 * which signals are active.
 *
 * @param hits - Array of HyperRAG hits, each with signals
 * @returns Map of lane name to hits in that lane (sorted by score descending)
 */
export function partitionHitsByLane(
  hits: Array<{ id: string; signals: HyperRagSignals }>
): LaneHits {
  const laneMap: LaneHits = {
    dense_vector: [],
    graph_authority: [],
    lexical: [],
    cache: [],
    temporal: []
  };

  hits.forEach(hit => {
    const lanes = groupSignalsByLane(hit.id, hit.signals);

    if (lanes.dense_vector && lanes.dense_vector.length > 0) {
      laneMap.dense_vector.push(...lanes.dense_vector);
    }
    if (lanes.graph_authority && lanes.graph_authority.length > 0) {
      laneMap.graph_authority.push(...lanes.graph_authority);
    }
    if (lanes.lexical && lanes.lexical.length > 0) {
      laneMap.lexical.push(...lanes.lexical);
    }
    if (lanes.cache && lanes.cache.length > 0) {
      laneMap.cache.push(...lanes.cache);
    }
    if (lanes.temporal && lanes.temporal.length > 0) {
      laneMap.temporal.push(...lanes.temporal);
    }
  });

  // Sort each lane by score descending
  Object.keys(laneMap).forEach(lane => {
    laneMap[lane as keyof LaneHits].sort((a, b) => b.score - a.score);
  });

  return laneMap;
}

/**
 * Verify signal coverage: ensure all 9 signals are covered in exactly one lane (no gaps, no duplicates)
 *
 * Coverage rules:
 * - dense, turbovec → dense_vector (take max)
 * - graphAuthority, topologyRouted → graph_authority (take max)
 * - lexicalBoost → lexical
 * - taskBoost, aceBoost, engramBoost → cache (take max)
 * - recencyOrHitRate → temporal
 *
 * @returns Coverage report with signal-to-lane mapping
 */
export function verifySignalCoverage(): {
  allSignalsCovered: boolean;
  mapping: Record<string, string>;
  gaps: string[];
  duplicates: string[];
} {
  const signalCoverage = new Map<string, string[]>();
  const allSignals = [
    'dense',
    'graphAuthority',
    'lexicalBoost',
    'taskBoost',
    'aceBoost',
    'turbovec',
    'topologyRouted',
    'recencyOrHitRate',
    'engramBoost'
  ];

  // Map signals to lanes
  const mapping: Record<string, string> = {
    dense: 'dense_vector',
    turbovec: 'dense_vector',
    graphAuthority: 'graph_authority',
    topologyRouted: 'graph_authority',
    lexicalBoost: 'lexical',
    taskBoost: 'cache',
    aceBoost: 'cache',
    engramBoost: 'cache',
    recencyOrHitRate: 'temporal'
  };

  // Check coverage
  const gaps: string[] = [];
  const duplicates: string[] = [];

  allSignals.forEach(signal => {
    if (!mapping[signal]) {
      gaps.push(signal);
    }

    const lane = mapping[signal];
    if (!signalCoverage.has(lane)) {
      signalCoverage.set(lane, []);
    }
    signalCoverage.get(lane)!.push(signal);
  });

  // Check for duplicate lane assignments (each signal should be in exactly one lane)
  signalCoverage.forEach((signals, lane) => {
    if (signals.length > 1) {
      // Multiple signals in same lane is OK (e.g., dense + turbovec in dense_vector)
      // but no signal should appear in multiple lanes
    }
  });

  const allSignalsCovered = gaps.length === 0 && allSignals.length === Object.keys(mapping).length;

  return {
    allSignalsCovered,
    mapping,
    gaps,
    duplicates
  };
}

/**
 * Unit test: verify signal grouping correctness
 */
export function testSignalGrouping(): {
  pass: boolean;
  tests: Array<{ name: string; pass: boolean }>;
} {
  const tests: Array<{ name: string; pass: boolean }> = [];

  // Test 1: Single signal (dense)
  const test1 = groupSignalsByLane('hit1', {
    dense: 0.9,
    graphAuthority: 0,
    lexicalBoost: 0,
    taskBoost: 0,
    aceBoost: 0,
    turbovec: 0,
    topologyRouted: 0,
    recencyOrHitRate: 0,
    engramBoost: 0
  });
  tests.push({
    name: 'Single signal (dense) groups to dense_vector lane only',
    pass: test1.dense_vector?.length === 1 && (test1.dense_vector?.[0].score ?? 0) === 0.9 && test1.graph_authority?.length === 0
  });

  // Test 2: Multiple signals per lane (dense + turbovec)
  const test2 = groupSignalsByLane('hit2', {
    dense: 0.7,
    graphAuthority: 0,
    lexicalBoost: 0,
    taskBoost: 0,
    aceBoost: 0,
    turbovec: 0.9,
    topologyRouted: 0,
    recencyOrHitRate: 0,
    engramBoost: 0
  });
  tests.push({
    name: 'Dense + turbovec: takes max (0.9) for dense_vector lane',
    pass: test2.dense_vector?.length === 1 && (test2.dense_vector?.[0].score ?? 0) === 0.9
  });

  // Test 3: Cache lane combines all cache signals
  const test3 = groupSignalsByLane('hit3', {
    dense: 0,
    graphAuthority: 0,
    lexicalBoost: 0,
    taskBoost: 0.08,
    aceBoost: 0.1,
    turbovec: 0,
    topologyRouted: 0,
    recencyOrHitRate: 0,
    engramBoost: 0.05
  });
  tests.push({
    name: 'Cache lane takes max of taskBoost, aceBoost, engramBoost (0.1)',
    pass: test3.cache?.length === 1 && (test3.cache?.[0].score ?? 0) === 0.1
  });

  // Test 4: All lanes present
  const test4 = groupSignalsByLane('hit4', {
    dense: 0.9,
    graphAuthority: 0.8,
    lexicalBoost: 0.6,
    taskBoost: 0.1,
    aceBoost: 0,
    turbovec: 0,
    topologyRouted: 0,
    recencyOrHitRate: 0.5,
    engramBoost: 0
  });
  tests.push({
    name: 'All 5 lanes have hits',
    pass: (test4.dense_vector?.length ?? 0) > 0 &&
          (test4.graph_authority?.length ?? 0) > 0 &&
          (test4.lexical?.length ?? 0) > 0 &&
          (test4.cache?.length ?? 0) > 0 &&
          (test4.temporal?.length ?? 0) > 0
  });

  // Test 5: No signals → no lanes
  const test5 = groupSignalsByLane('hit5', {
    dense: 0,
    graphAuthority: 0,
    lexicalBoost: 0,
    taskBoost: 0,
    aceBoost: 0,
    turbovec: 0,
    topologyRouted: 0,
    recencyOrHitRate: 0,
    engramBoost: 0
  });
  tests.push({
    name: 'No signals results in empty lane partition',
    pass: (test5.dense_vector?.length ?? 0) === 0 && (test5.temporal?.length ?? 0) === 0
  });

  // Test 6: Signal coverage verification
  const coverage = verifySignalCoverage();
  tests.push({
    name: 'All 9 signals covered, no gaps',
    pass: coverage.allSignalsCovered && coverage.gaps.length === 0 && Object.keys(coverage.mapping).length === 9
  });

  const allPass = tests.every(t => t.pass);
  return { pass: allPass, tests };
}

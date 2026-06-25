/**
 * Cognitive Smart Router for ACE Retrieval Lanes
 *
 * Routes queries into specialized retrieval lanes before full-file reads:
 * 1. Lexical (BM25/rg/pg_trgm)
 * 2. Vector ANN (Qdrant/TurboVec)
 * 3. Topology (SOM/clustering/prefilter)
 * 4. Graph (KAG/DAG/Neo4j)
 * 5. Inverse-RAG (error traces → packet lookup)
 *
 * Decision order: cheap signals first (regex/NLP) → plan → execute → ACE pack.
 */

import { z } from 'zod';

export const routerIntentSchema = z.enum([
  'debug',      // error trace / stack / build failure
  'locate',     // file path / exact symbol / export name
  'graph',      // depends-on / imports / relationships / topology
  'topology',   // cluster / SOM / neighbors / centroid
  'semantic',   // natural language / concept match (default)
]);

export type RouterIntent = z.infer<typeof routerIntentSchema>;

export const retrievalLaneSchema = z.enum([
  'bm25',       // Lexical: pg_trgm trigram / Fuse.js FTS
  'ann',        // Vector: Qdrant / TurboVec dense search
  'som',        // Topology: SOM cell + Moore radius neighbors
  'graph',      // Graph: Neo4j Cypher + CouchDB PageRank
  'inverse',    // Inverse-RAG: error/trace → parent_atlas lookup
  'all',        // Hybrid: run multiple lanes in parallel
]);

export type RetrievalLane = z.infer<typeof retrievalLaneSchema>;

export const routerOutputSchema = z.object({
  intent: routerIntentSchema,
  lanes: z.array(retrievalLaneSchema),
  topK: z.number().int().positive().default(20),
  clusterBudget: z.number().int().positive().default(5),
  readFiles: z.boolean().default(false),
  readFilesMaxChars: z.number().int().positive().default(0).optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1).default(0.8),
});

export type RouterOutput = z.infer<typeof routerOutputSchema>;

/**
 * Analyze query for cheap signals (regex/NLP patterns)
 * Order matters: check specific first, then fallback to generic
 */
function analyzeQuerySignals(query: string) {
  const q = query.toLowerCase();

  return {
    // File path pattern: src/lib/... or scripts/...
    hasPath: /\b(?:src|scripts|docs|routes|lib|tests|packages)\/[\w/.-]+(?:\.\w+)?/i.test(query),

    // Exact symbol: functionName() or CLASS or export default
    hasSymbol: /\b[A-Za-z_$][\w$]+\(\)|\b(?:export\s+(?:default|const|function|class)|import\s+\w+)/i.test(
      query
    ),

    // Error/exception/stack/build failure
    hasError: /\b(?:error|failed|exception|stack|cannot find|typeerror|referenceerror|syntaxerror|build\s+fail|crash|panic)\b/i.test(
      query
    ),

    // Graph: depends-on, calls, imports, relationships, topology, neo4j, kag, dag
    wantsGraph: /\b(?:depends\s+on|calls|imports|used\s+by|relationship|connected|graph|kag|dag|neo4j)\b/i.test(
      query
    ),

    // Topology: cluster, som, neighbors, adjacent, centroid, prefilter
    wantsTopology: /\b(?:cluster|som|neighbor|adjacent|centroid|topology|prefilter|near|similar\s+cluster)\b/i.test(
      query
    ),

    // Concept/semantic: natural language (default fallback)
    isNaturalLanguage: query.length > 5 && !/[^a-z\s'"-]/i.test(query.replace(/[()[\]{}]/g, '')),
  };
}

/**
 * Main router: decide lanes based on query intent
 *
 * Decision tree:
 * 1. Error traces → inverse-RAG + BM25
 * 2. File paths / exact symbols → BM25 + ANN
 * 3. Graph questions → graph + ANN
 * 4. Topology questions → SOM + ANN
 * 5. Natural language → ANN + BM25 (default)
 */
export function routeQuery(query: string): RouterOutput {
  const signals = analyzeQuerySignals(query);

  // Tier 1: Debug / Error Traces (highest priority)
  if (signals.hasError) {
    return {
      intent: 'debug',
      lanes: ['inverse', 'bm25', 'graph'],
      topK: 30,
      clusterBudget: 5,
      readFiles: false,
      reason:
        'Query mentions error/exception/crash. Using inverse-RAG (error → packet lookup) + BM25 + graph expansion.',
      confidence: 0.95,
    };
  }

  // Tier 2: Locate (file path or exact symbol)
  if (signals.hasPath || signals.hasSymbol) {
    return {
      intent: 'locate',
      lanes: ['bm25', 'ann'],
      topK: 20,
      clusterBudget: 0,
      readFiles: false,
      reason:
        'Query contains file path or symbol name. Using lexical search (BM25/pg_trgm) + ANN for fallback.',
      confidence: 0.9,
    };
  }

  // Tier 3: Graph (depends-on, imports, relationships)
  if (signals.wantsGraph) {
    return {
      intent: 'graph',
      lanes: ['graph', 'ann'],
      topK: 30,
      clusterBudget: 10,
      readFiles: false,
      reason:
        'Query asks about relationships/dependencies. Using Neo4j graph traversal + ANN for candidate filtering.',
      confidence: 0.85,
    };
  }

  // Tier 4: Topology (clusters, SOM, neighbors)
  if (signals.wantsTopology) {
    return {
      intent: 'topology',
      lanes: ['som', 'ann'],
      topK: 30,
      clusterBudget: 5,
      readFiles: false,
      reason: 'Query asks about clusters/topology. Using SOM prefilter + ANN within Moore neighborhood.',
      confidence: 0.8,
    };
  }

  // Tier 5: Semantic (default, natural language)
  return {
    intent: 'semantic',
    lanes: ['ann', 'bm25'],
    topK: 20,
    clusterBudget: 0,
    readFiles: false,
    reason: 'Natural language query. Using ANN (Qdrant/TurboVec) + BM25 fallback.',
    confidence: 0.7,
  };
}

/**
 * Validate router output before passing to retrieval orchestrator
 */
export function validateRouterOutput(output: RouterOutput): RouterOutput {
  try {
    return routerOutputSchema.parse(output);
  } catch (error) {
    throw new Error(
      `Invalid router output: ${error instanceof z.ZodError ? error.errors.map((e) => e.message).join('; ') : String(error)}`
    );
  }
}

/**
 * Get lane execution order based on intent
 * Order matters for efficiency and relevance
 */
export function getLaneExecutionOrder(intent: RouterIntent): RetrievalLane[] {
  const orders: Record<RouterIntent, RetrievalLane[]> = {
    debug: ['inverse', 'bm25', 'graph', 'ann', 'som'],
    locate: ['bm25', 'ann', 'som', 'graph'],
    graph: ['graph', 'ann', 'som', 'bm25'],
    topology: ['som', 'ann', 'graph', 'bm25'],
    semantic: ['ann', 'bm25', 'som', 'graph'],
  };

  return orders[intent] ?? orders.semantic;
}

/**
 * Estimate query complexity to decide if parallel execution is safe
 * Simple heuristic: longer queries or questions tend to be cheaper (intent is clear)
 */
export function shouldParallelExecute(query: string, lanes: RetrievalLane[]): boolean {
  // Don't parallelize if only 1 lane
  if (lanes.length <= 1) return false;

  // Parallelize if query is clear and lanes are complimentary (not just fallback order)
  const isComplex = query.length > 50;
  const hasComplementaryLanes =
    (lanes.includes('graph') && lanes.includes('ann')) ||
    (lanes.includes('som') && lanes.includes('ann')) ||
    (lanes.includes('inverse') && lanes.includes('bm25'));

  return isComplex && hasComplementaryLanes;
}

/**
 * Convert router intent + lanes into a retrieval plan
 * Used by the ACE context assembler to decide which retrieval methods to call
 */
export interface RetrievalPlan {
  query: string;
  intent: RouterIntent;
  lanes: RetrievalLane[];
  parallel: boolean;
  topK: number;
  clusterBudget: number;
  readFiles: boolean;
  readFilesMaxChars?: number;
  reason: string;
  confidence: number;
}

export function buildRetrievalPlan(query: string, routerOutput: RouterOutput): RetrievalPlan {
  const parallel = shouldParallelExecute(query, routerOutput.lanes);

  return {
    query,
    intent: routerOutput.intent,
    lanes: routerOutput.lanes,
    parallel,
    topK: routerOutput.topK,
    clusterBudget: routerOutput.clusterBudget,
    readFiles: routerOutput.readFiles,
    readFilesMaxChars: routerOutput.readFilesMaxChars,
    reason: routerOutput.reason,
    confidence: routerOutput.confidence,
  };
}

/**
 * OpenCode / Gemma4 rule:
 * Never read full files first.
 *
 * 1. Call cognitive router with query
 * 2. Execute retrieval lanes (no file reads)
 * 3. Inspect compact ACE packets
 * 4. Only read exact line ranges needed for patching
 *
 * This keeps context window focused on retrieval signals, not file cruft.
 */
export function formatRouterInstructions(): string {
  return `\
# Cognitive Router + Retrieval Gates (OpenCode Rule)

Never read full files first. For every repo question:

1. **Call cognitive router** with the query
2. **Execute retrieval lanes** (BM25/ANN/graph/topology/inverse)
3. **Inspect compact ACE packets** (summary + tags only)
4. **Only read exact line ranges** needed for patching/analysis
5. **Never load whole files** unless explicitly requested

## Search Order (by lane execution priority)
1. rg / pg_trgm exact match (lexical)
2. parent_atlas packet lookup (identity)
3. TurboVec/Qdrant ANN (768d semantic)
4. SOM centroid expansion (topology)
5. Neo4j KAG/DAG (graph structure)
6. LibTorch rerank (GPU attention)
7. ACE packet assembly (final context)

## Query Intent Detection (cheap signals first)
- Error? → debug (inverse-RAG)
- File path or symbol? → locate (lexical)
- Graph question? → graph (Neo4j)
- Topology/cluster? → topology (SOM)
- Natural language? → semantic (ANN, default)

This stops OpenCode from filling context with file reads and makes Gemma4 function-call your retrieval engine first.
`;
}
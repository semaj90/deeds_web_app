/**
 * @fileoverview Defines the canonical data structures and schemas for the Atlas Search feature.
 * This contract governs all inputs and outputs for the new /api/atlas/search endpoint.
 */

/**
 * @typedef {"semantic" | "graph" | "telemetry" | "tricubic" | "diagnostic"} AtlasSearchMode
 * @typedef {"fix_error" | "diagnose" | "find_todo" | "trace_telemetry" | "retrieve_memory" | "hybrid_search"} AtlasIntent
 * @typedef {"caseId" | "sourceType" | "tags"} AtlasFilterKey
 * 
/**
 * @typedef {object} AtlasSearchRequest
 * @property {string} query - The natural language query or error message.
 * @property {AtlasIntent} intent - The primary goal of the search (e.g., "fix_error", "diagnose").
 * @property {AtlasSearchMode} mode - The primary search mode (e.g., "semantic", "graph", "tricubic").
 * @property {string[]} [scope] - Optional list of directories or modules to limit the search to.
 * @property {string[]} [signals] - Optional list of signals to prioritize (e.g., "error", "todo").
 * @property {number} [topK] - Maximum number of results to return.
 * @property {number} [traversalDepth] - Maximum graph traversal depth to consider.
 * @property {Record<AtlasFilterKey, any>} [filters] - Filters to narrow the search scope (e.g., caseId, sourceType).
 */

/**
 * @typedef {object} AtlasSearchResult
 * @property {string} id - Unique identifier for the result.
 * @property {string} title - The title or primary name of the source.
 * @property {string} snippet - A short, relevant text snippet from the source.
 * @property {string} sourceRef - The canonical source reference (e.g., file:path/to/file.ts).
 * @property {number} score - The overall relevance score.
 * @property {object} scores - Detailed component scores used for final ranking.
 * @property {number} scores.vector - Semantic embedding score (0.0 to 1.0).
 * @property {number} scores.graph - Graph authority score (0.0 to 1.0).
 * @property {number} scores.telemetry - Runtime telemetry match score (0.0 to 1.0).
 * @property {number} scores.recency - How recently the source was active (0.0 to 1.0).
 * @property {number} scores.validation - Score based on passing validation gates (0.0 to 1.0).
 * @property {string} rankReason - A human-readable explanation for the result's high rank.
 * @property {string[]} [traversalPath] - The sequence of nodes/edges leading to this result.
 * @property {string[]} [telemetrySignals] - Specific telemetry signals that contributed to the match.
 * @property {Record<string, unknown>} [provenance] - Detailed provenance metadata.
 */

/**
 * @typedef {object} AtlasSearchResponse
 * @property {string} query - The original query text.
 * @property {AtlasIntent} intent - The intent used for the search.
 * @property {AtlasSearchMode} mode - The mode used for the search.
 * @property {AtlasSearchResult[]} results - The list of ranked, structured results.
 * @property {object} meta - Metadata about the search execution.
 * @property {number} meta.topK - The requested top K.
 * @property {number} meta.traversalDepth - The depth used for graph traversal.
 * @property {number} meta.elapsedMs - Time taken for the search.
 * @property {"validated-atlas"} meta.service - The source of truth for the response.
 */

// Exporting types for use in the service layer and API handlers
export type AtlasSearchRequest = {
  query: string;
  intent: "fix_error" | "diagnose" | "find_todo" | "trace_telemetry" | "retrieve_memory" | "hybrid_search";
  mode: "semantic" | "graph" | "telemetry" | "tricubic";
  scope?: string[];
  signals?: string[];
  topK?: number;
  traversalDepth?: number;
  filters?: {
    caseId?: string;
    sourceType?: string;
    tags?: string[];
  };
};

export type AtlasSearchResult = {
  id: string;
  title: string;
  snippet: string;
  sourceRef: string;
  score: number;
  scores: {
    vector: number;
    graph: number;
    telemetry: number;
    recency: number;
    validation: number;
  };
  rankReason: string;
  traversalPath?: string[];
  telemetrySignals?: string[];
  provenance?: Record<string, unknown>;
};

export type AtlasSearchResponse = {
  query: string;
  intent: "fix_error" | "diagnose" | "find_todo" | "trace_telemetry" | "retrieve_memory" | "hybrid_search";
  mode: "semantic" | "graph" | "telemetry" | "tricubic";
  results: AtlasSearchResult[];
  meta: {
    topK: number;
    traversalDepth: number;
    elapsedMs: number;
    service: "validated-atlas";
  };
};
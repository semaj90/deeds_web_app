/**
 * TRACE Subagent Registry
 * 
 * Defines the ontology and interface for modular subagents within the 
 * Triage-Retrieve-Align-Compose-Encode pipeline.
 */

export type TraceSubagentName =
  | 'ontology_sortation'
  | 'chunk_stream_indexing'
  | 'cluster_mapping'
  | 'ranking'
  | 'llm_synthesis'
  | 'memory_encoding'
  | 'topology_update';

export type TraceSubagentStatus = 'ok' | 'skipped' | 'failed' | 'running';

export type TraceSubagentResult<T = any> = {
  agent: TraceSubagentName;
  status: TraceSubagentStatus;
  durationMs: number;
  output?: T;
  error?: string;
  metadata?: Record<string, any>;
};

export type TraceSubagentContext = {
  runId: string;
  repoRoot?: string;
  query?: string;
  filePaths?: string[];
  ontology?: any[];
  chunks?: any[];
  clusters?: any[];
  rankedEvidence?: any[];
  synthesis?: any;
  memoryDecision?: any;
};

export interface TraceSubagent {
  name: TraceSubagentName;
  run(ctx: TraceSubagentContext): Promise<TraceSubagentResult>;
}

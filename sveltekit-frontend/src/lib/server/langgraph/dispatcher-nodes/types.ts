/**
 * Dispatcher Node Types & State Machine
 * Shared types for all 9 LangGraph dispatcher nodes
 */

export interface DispatcherState {
  // Input from retrieval orchestrator
  query: string;
  candidates: CandidatePacket[];
  identity_lane: 'canonical' | 'recoverable' | 'quarantine';
  parity_status: 'aligned' | 'diverged' | 'unknown';

  // Decision & routing
  dispatch_decision: DispatchDecision;
  dispatch_node?: string;
  dispatch_tool?: string;
  dispatch_confidence: number;

  // Execution path
  synthesis_path: string[]; // breadcrumb trail of nodes executed
  tool_calls: ToolCall[];
  errors: string[];

  // Timing
  latency_ms: number;
  start_time?: number;

  // Output
  action: 'success' | 'failed' | 'degraded' | 'escalated';
  reason?: string;
  result?: any;
}

export type DispatchDecision =
  | 'quarantine'
  | 'recover'
  | 'validate'
  | 'sync_qdrant'
  | 'sync_neo4j'
  | 'expand_graph'
  | 'rerank'
  | 'synthesize'
  | 'escalate';

export interface CandidatePacket {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  summary?: string;
  confidence: number;
  identity_lane: string;
}

export interface ToolCall {
  tool_name: string;
  params: Record<string, any>;
  result?: any;
  error?: string;
  duration_ms: number;
}

export interface NodeContext {
  state: DispatcherState;
  mcpClient: any; // MCP client injected at runtime
  postgres: any; // DB client
  redis: any; // Cache client
  qdrant: any; // Vector DB client
  neo4j: any; // Graph client
}

export interface NodeOutput {
  state: DispatcherState;
  status: 'pass' | 'fail';
}

/**
 * ACE Packet Types
 *
 * ACE = Authenticated Candidate Evidence
 * ACE packets are the canonical evidence envelope used across:
 * - Offline batch processing
 * - Redis/Valkey cache hits
 * - Gemma4 prompt assembly
 * - Injection validation
 * - Replay/eval reports
 *
 * ACE is NOT client-only. It is a server-side contract layer between
 * retrieval (HyperRAG), cache (Valkey), validation, and synthesis (Gemma4).
 */

export interface ACEPacket {
  // Required canonical identity
  packet_key: string; // e.g., "ace:packet:auth:001" or "hyperrag:src/lib/server/db/client.ts"
  feature_id: string; // e.g., "auth.sessions" or "db.postgres"
  source_ref: string; // e.g., "src/lib/server/db/client.ts" or "feature:auth"

  // Required content
  summary: string; // 1-2 sentence summary of the packet
  evidence_text?: string; // Raw evidence (code snippet, docs, etc.)

  // Optional enrichment
  metadata?: Record<string, unknown>;
  cluster_id?: string | number; // GPU cluster assignment
  som_cluster?: string | number; // SOM cell BMU
  kmeans_cluster?: string | number; // KMeans cluster
  domain?: string; // "source" | "feature" | "test" | "docs" | etc.
  trace_id?: string; // Correlation ID for logging
  created_at?: string; // ISO timestamp
  community_id?: string | number; // Semantic community membership
}

export interface ACEPacketValidationResult {
  packet_key: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  injection_detected: boolean; // True if suspicious patterns found
  injection_patterns_found?: string[];
}

export interface ACEContextAssemblerOutput {
  packets: ACEPacket[];
  packet_keys_used: string[];
  feature_ids_used: string[];
  total_tokens_estimate: number;
  cache_hit_count: number;
  validation_results: ACEPacketValidationResult[];
}

export interface Gemma4SynthesisOutput {
  answer: string;
  packet_keys_used: string[];
  feature_ids_used: string[];
  uncertainty: "low" | "medium" | "high";
  injection_detected: boolean;
  tool_calls_requested?: unknown[];
  tool_calls_blocked?: unknown[];
}

export interface ACEOfflineBatchResult {
  timestamp: string;
  packet_count: number;
  valid_packets: number;
  invalid_packets: number;
  injection_detections: number;
  packets_created: ACEPacket[];
  validation_report: ACEPacketValidationResult[];
  cache_warmed: boolean;
  cache_entries_written: number;
}

export interface ACEPromptInjectionTest {
  test_id: string;
  payload: string;
  description: string;
  should_detect_injection: boolean;
}

export interface RetrievalAccelerationTiming {
  stage: string;
  duration_ms: number;
  count?: number;
  throughput_per_sec?: number;
}

export interface RetrievalAccelerationReport {
  timestamp: string;
  query_count: number;
  total_duration_ms: number;
  stages: RetrievalAccelerationTiming[];
  cpu_worker_stages: string[];
  gpu_vram_candidates: string[];
  gemma4_stage_duration_ms: number;
  cache_hit_rate: number;
  estimated_token_savings: number;
}

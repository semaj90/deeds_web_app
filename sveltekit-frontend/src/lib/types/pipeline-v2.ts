/**
 * Legal-AI Pipeline V2 Data Contracts
 *
 * Core types for Redis Pipeline architecture with stable IDs and caching.
 */

// Canonical Chunk Record (Postgres/Redis)
export type ChunkRecord = {
  doc_id: string;
  case_id: string;           // critical for scoped retrieval
  chunk_id: string;          // stable across runs = sha256(doc_id + chunk_index + offsets + chunk_text_sha)
  source: 'pdf'|'ocr'|'web'|'user';
  text: string;
  sha256: string;            // dedupe + cache key seed
  priority: number;          // 0..255 (normalized for NES priority system)
  tags: string[];
  created_at: string;        // ISO
  version?: number;
  offsets?: { start: number; end: number }; // optional
};

// Qdrant Vector Payload (Search Filters)
export type QdrantPayload = {
  doc_id: string;
  chunk_id: string;
  tags: string[];
  priority: number;
  created_at: string;
  sha256: string;
  case_id?: string;
  evidence_id?: string;
  mime?: string;
  source?: string;
  text?: string;
};

// Retrieved Fragment (for Context Pack)
export type ContextFragment = {
  chunk_id: string;
  text: string;
  score: number;
  tags: string[];
  doc_id: string;
};

// Context Pack: The Input for Synthesis (ACE Format)
export type ContextPack = {
  context_pack_version: "2.0";
  pack_id: string;              // sha256 of key fields (stable)
  created_at: string;

  model: {
    synth: "gemma3-legal:latest";
    embed: "embeddinggemma:latest"
  };

  cache_keys: {
    retrieval_key: string;       // hash(query+filters+collection+top_k)
    prompt_key: string;          // hash(template+model+pack_id)
    output_key: string;          // hash(prompt_key+final_answer)
  };

  memory_tiers: {
    stable: ContextFragment[];
    recent: ContextFragment[];
    task: ContextFragment[];
  };

  citations: Array<{
    chunk_id: string;            // stable citation anchor
    doc_id: string;
    sha256: string;
    source: string;
  }>;

  summary: {
    executive: string;
    key_points: string[];
    risks: string[];
  };

  answer: string;               // final assistant response
};

// Pipeline API Response Types
export interface PipelineRunResponse {
  job_id: string;
  status: 'queued' | 'processing';
  events_url: string; // SSE endpoint
}

export interface PipelineHealth {
  redis: boolean;
  qdrant: boolean;
  postgres: boolean;
  minio: boolean;
  gpu?: {
    available: boolean;
    device_name?: string;
  };
}

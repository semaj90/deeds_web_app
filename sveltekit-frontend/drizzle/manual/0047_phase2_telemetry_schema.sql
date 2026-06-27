-- Session 84: Phase 2 Telemetry Schema
--
-- New table: phase_2_telemetry
-- Captures packet-centric context for EVERY retrieval + RPC call
--
-- 8 Phase 2 fields: packet_id, feature_id, som_cell, schema_version,
--                   embedding_version, tool_version, gpu_kernel_version, rpc_transport

CREATE TABLE IF NOT EXISTS phase_2_telemetry (
  id BIGSERIAL PRIMARY KEY,

  -- Standard retrieval context
  query_hash VARCHAR(64),
  retrieval_strategy VARCHAR(32),
  latency_ms INT,
  vector_hits INT DEFAULT 0,
  cache_hit BOOLEAN DEFAULT FALSE,

  -- Phase 2: Packet-centric context (8 mandatory fields)
  packet_id VARCHAR(255),           -- Primary packet identifier
  feature_id VARCHAR(255),           -- Feature classification
  som_cell VARCHAR(32),              -- SOM routing coordinates (e.g., '5,3')
  schema_version INT DEFAULT 1,      -- Packet schema version
  embedding_version VARCHAR(64),     -- Embedding model version
  tool_version VARCHAR(64),          -- MCP/tool version
  gpu_kernel_version VARCHAR(64),    -- GPU kernel version
  rpc_transport VARCHAR(32),         -- RPC transport (jsonrpc, http, grpc, mcp)

  -- Complete event payload (for rich analysis)
  payload JSONB,

  -- Housekeeping
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT phase_2_telemetry_packet_id_check CHECK (packet_id IS NOT NULL OR feature_id IS NOT NULL)
);

-- Index for fast packet_id lookups (Phase 2 primary use case)
CREATE INDEX IF NOT EXISTS phase_2_telemetry_packet_id_idx ON phase_2_telemetry(packet_id);

-- Index for feature_id aggregations
CREATE INDEX IF NOT EXISTS phase_2_telemetry_feature_id_idx ON phase_2_telemetry(feature_id);

-- Index for SOM cell analysis (retrieval behavior by cluster)
CREATE INDEX IF NOT EXISTS phase_2_telemetry_som_cell_idx ON phase_2_telemetry(som_cell);

-- Index for time-series analysis (latest events first)
CREATE INDEX IF NOT EXISTS phase_2_telemetry_created_at_idx ON phase_2_telemetry(created_at DESC);

-- Compound index for retrieval strategy + packet_id (common query pattern)
CREATE INDEX IF NOT EXISTS phase_2_telemetry_strategy_packet_idx ON phase_2_telemetry(retrieval_strategy, packet_id);

-- GIN index for rich JSONB payload queries
CREATE INDEX IF NOT EXISTS phase_2_telemetry_payload_gin ON phase_2_telemetry USING GIN(payload);

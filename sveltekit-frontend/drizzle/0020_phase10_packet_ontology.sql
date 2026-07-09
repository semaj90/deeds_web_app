-- Phase 10: Packet Ontology Registry (Unified Ontology + Telemetry Infrastructure)
-- ==================================================================================
-- Adds packet_type enum, ontology fields to atlas_packets and tool_registry
-- Creates tool_execution_log table and materialized view for telemetry
-- Enables schema-aware routing and operational feedback loop

-- Step 1: Create packet_type enum
-- ==============================
CREATE TYPE public.packet_type AS ENUM (
  'code',      -- source code file or chunk
  'test',      -- test file or chunk
  'doc',       -- documentation
  'prompt',    -- AI prompt or template
  'tool',      -- tool registry entry
  'schema',    -- data schema (Zod, JSON, OpenAPI)
  'api',       -- API endpoint or RPC definition
  'spec'       -- specification or design document
);

-- Step 2: Extend atlas_packets with ontology and telemetry fields
-- ===============================================================
ALTER TABLE public.atlas_packets
  ADD COLUMN IF NOT EXISTS packet_type public.packet_type DEFAULT 'code',
  ADD COLUMN IF NOT EXISTS packet_ontology jsonb DEFAULT '{"capabilities":[],"constraints":{},"examples":{},"tags":[]}',
  ADD COLUMN IF NOT EXISTS parent_packet_key text,
  ADD COLUMN IF NOT EXISTS related_packets text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS telemetry jsonb DEFAULT '{"execution_count":0,"success_count":0,"failure_count":0,"avg_latency_ms":0}';

-- Add index on packet_type for fast filtering
CREATE INDEX IF NOT EXISTS idx_atlas_packets_type ON public.atlas_packets (packet_type);

-- Add GIN index on packet_ontology for rich queries
CREATE INDEX IF NOT EXISTS idx_atlas_packets_ontology_gin ON public.atlas_packets USING GIN (packet_ontology);

-- Step 3: Extend tool_registry with ontology fields
-- =================================================
ALTER TABLE public.tool_registry
  ADD COLUMN IF NOT EXISTS tool_capabilities jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tool_constraints jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tool_examples jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tool_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS failure_modes jsonb DEFAULT '{"timeouts":0,"schema_mismatch":0,"rate_limit":0,"api_failure":0,"unknown":0}',
  ADD COLUMN IF NOT EXISTS timeout_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schema_mismatch_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS false_positive_rate real DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rolling_success_rate_7d real DEFAULT 0;

-- Add indexes on tool ontology fields
CREATE INDEX IF NOT EXISTS idx_tool_registry_capabilities_gin ON public.tool_registry USING GIN (tool_capabilities);
CREATE INDEX IF NOT EXISTS idx_tool_registry_tags ON public.tool_registry USING GIN (tool_tags);
CREATE INDEX IF NOT EXISTS idx_tool_registry_rolling_rate ON public.tool_registry (rolling_success_rate_7d DESC);

-- Step 4: Create tool_execution_log table for telemetry
-- ===================================================
CREATE TABLE IF NOT EXISTS public.tool_execution_log (
  id bigserial NOT NULL PRIMARY KEY,
  tool_id text NOT NULL,
  query text,
  success integer NOT NULL,  -- 1 = success, 0 = failure
  latency_ms integer,
  error_type text,           -- timeout, schema_mismatch, api_failure, rate_limit, unknown
  timestamp timestamp with time zone NOT NULL DEFAULT now()
);

-- Add indexes for efficient stats computation
CREATE INDEX IF NOT EXISTS idx_tool_exec_log_tool_id ON public.tool_execution_log (tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_exec_log_timestamp ON public.tool_execution_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tool_exec_log_tool_timestamp ON public.tool_execution_log (tool_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tool_exec_log_success ON public.tool_execution_log (success);

-- Step 5: Create materialized view for rolling 7-day stats
-- ========================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.tool_execution_stats_7d AS
SELECT
  tool_id,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END)::integer AS success_count,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END)::integer AS failure_count,
  COALESCE(AVG(latency_ms)::real, 0)::real AS avg_latency_ms,
  SUM(CASE WHEN error_type = 'timeout' THEN 1 ELSE 0 END)::integer AS timeout_count,
  SUM(CASE WHEN error_type = 'schema_mismatch' THEN 1 ELSE 0 END)::integer AS schema_mismatch_count,
  (
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END)::real /
    NULLIF(COUNT(*)::real, 0)
  )::real AS rolling_success_rate,
  now() AS last_refreshed_at
FROM public.tool_execution_log
WHERE timestamp > NOW() - interval '7 days'
GROUP BY tool_id;

-- Create index on materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_stats_7d_tool_id ON public.tool_execution_stats_7d (tool_id);

-- Step 6: Grant permissions (if needed)
-- ===================================
-- Uncomment if using role-based access control
-- GRANT SELECT ON public.tool_execution_log TO app_user;
-- GRANT SELECT ON public.tool_execution_stats_7d TO app_user;

-- Step 7: Insert into atlas_packets.related_packets index if needed
-- ================================================================
-- Note: related_packets starts empty and will be populated by Phase 10b enrichment

-- End of Phase 10 Ontology Registry Migration
-- ============================================
-- Next steps:
-- 1. Wire telemetry emission in selectTool() → RabbitMQ queue
-- 2. Create RabbitMQ consumer to log events to tool_execution_log
-- 3. Schedule hourly refresh of tool_execution_stats_7d materialized view
-- 4. Update tool embeddings with richer context (schemas, examples, domains)
-- 5. Backfill packet_type for priority packets (code, test)

-- Fixes real schema drift found live 2026-08-22 (same ACE end-to-end proof pass
-- as codebase_chunk_index_routing_tier_columns.sql). fetchACPKnowledgeResults()'s
-- fast-path telemetry INSERT (features/ai/ace/context-assembler.ts, ~line 2131)
-- writes route, query_hash, ..., raw, packet_version, source_ref_quality — all
-- three exist in Drizzle's schema/route_runtime_packets.ts but not on the live
-- table, so every ACE request's fire-and-forget telemetry write silently fails
-- (caught, logged as "[Fast-Path Telemetry Query Error]", non-fatal to the
-- response but a real observability gap).
--
-- NOTE: route_runtime_packets has substantially more schema drift than these 3
-- columns (Drizzle also declares treeNodeId, promptHash, reward, packetUuid,
-- routeState, featureId, supersedesPacketUuid, supersededBy, gitSha,
-- gitDiffRank, repairReason, repairMethod — none present live either). Only
-- fixing the 3 columns this specific, confirmed-live-broken INSERT actually
-- uses; the rest is real but out of scope here — flagging, not blind-fixing
-- an entire table's worth of unverified drift.
--
-- Idempotent (IF NOT EXISTS) per this repo's Drizzle Safety Rule.

ALTER TABLE route_runtime_packets
  ADD COLUMN IF NOT EXISTS raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS packet_version integer,
  ADD COLUMN IF NOT EXISTS source_ref_quality numeric;

CREATE INDEX IF NOT EXISTS idx_rrp_raw_gin ON route_runtime_packets USING gin (raw);
CREATE INDEX IF NOT EXISTS idx_rrp_packet_version ON route_runtime_packets (packet_version);
CREATE INDEX IF NOT EXISTS idx_rrp_source_ref_quality ON route_runtime_packets (source_ref_quality);

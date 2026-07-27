--+
-- Migration: Phase 109 - Unknown Packet Conceptual Tracking Schema
-- This migration introduces the 'unknown_packets_audit' audit table to track
-- packets discovered across multiple sources but lacking a single canonical
-- schema definition, supporting the necessary cross-store proof matrix.
--+
CREATE TABLE IF NOT EXISTS unknown_packets_audit (
    packet_key TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    qdrant_point_id TEXT NOT NULL UNIQUE,
    content_hash TEXT DEFAULT NULL,
    ontology_version TEXT DEFAULT 'UNKNOWN' NOT NULL,
    qdrant_status TEXT DEFAULT 'UNKNOWN' NOT NULL,
    workspace_id TEXT DEFAULT NULL,
    last_validated_at TIMESTAMP DEFAULT NOW(),
    feature_id TEXT DEFAULT NULL,
    domain_class TEXT DEFAULT NULL,
    PRIMARY KEY (packet_key, source_ref)
);

-- Index for faster lookup on source_ref
CREATE INDEX idx_unknown_packets_source_ref ON unknown_packets_audit (source_ref);

-- We also update the main atlas_packets table's JSONB metadata to optionally store a reference/status
-- to the corresponding entry in this audit table, linking the two concepts.
ALTER TABLE atlas_packets
ADD COLUMN unknown_packet_audit_ref uuid REFERENCES unknown_packets_audit (qdrant_point_id)
AFTER metadata;
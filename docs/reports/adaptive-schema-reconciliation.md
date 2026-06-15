# Adaptive Schema Reconciliation Report

**Generated**: 2026-06-15T04:38:09.764Z

## Summary

- **Extensions Missing**: 0
- **Tables Missing**: 0
- **Columns Missing**: 2
- **Indexes Missing**: 4
- **Constraints Missing**: 3
- **Safe Operations**: 6

## Recommendations

### COLUMN: error_text
- **Status**: missing
- **Reason**: Missing resource
- **Action**: `ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS error_text text;`

### COLUMN: error_embedding
- **Status**: missing
- **Reason**: Missing resource
- **Action**: `ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS error_embedding vector;`

### INDEX: idx_atlas_packets_packet_key
- **Status**: missing
- **Reason**: Missing resource
- **Action**: `CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_packets_packet_key ON atlas_packets (packet_key);`

### INDEX: idx_atlas_packets_source_ref
- **Status**: missing
- **Reason**: Missing resource
- **Action**: `CREATE  INDEX IF NOT EXISTS idx_atlas_packets_source_ref ON atlas_packets (source_ref);`

### INDEX: idx_atlas_topology_packet_key
- **Status**: missing
- **Reason**: Missing resource
- **Action**: `CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_topology_packet_key ON atlas_topology_index (packet_key);`

### INDEX: idx_atlas_topology_authority
- **Status**: missing
- **Reason**: Missing resource
- **Action**: `CREATE  INDEX IF NOT EXISTS idx_atlas_topology_authority ON atlas_topology_index (w_authority);`

### CONSTRAINT: pk_atlas_packets
- **Status**: missing
- **Reason**: Primary key missing on atlas_packets

### CONSTRAINT: pk_atlas_topology
- **Status**: missing
- **Reason**: Primary key missing on atlas_topology_index

### CONSTRAINT: pk_error_logs
- **Status**: missing
- **Reason**: Primary key missing on error_logs

## Checks Performed

### Extensions
- pgcrypto: ✅ installed
- vector: ✅ installed
- pg_trgm: ✅ installed
- btree_gin: ✅ installed
- unaccent: ✅ installed

### Row Counts
- atlas_packets: 0 rows
- atlas_tree_nodes: 8823 rows
- atlas_topology_index: 3251 rows
- error_logs: 0 rows

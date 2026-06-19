# Adaptive Schema Reconciliation Report

**Generated**: 2026-06-19T17:55:08.049Z

## Summary

- **Extensions Missing**: 0
- **Tables Missing**: 0
- **Columns Missing**: 0
- **Indexes Missing**: 2
- **Constraints Missing**: 3
- **Safe Operations**: 2

## Recommendations

### INDEX: idx_atlas_packets_packet_key
- **Status**: missing
- **Reason**: Missing resource
- **Action**: `CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_packets_packet_key ON atlas_packets (packet_key);`

### INDEX: idx_atlas_packets_source_ref
- **Status**: missing
- **Reason**: Missing resource
- **Action**: `CREATE  INDEX IF NOT EXISTS idx_atlas_packets_source_ref ON atlas_packets (source_ref);`

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
- atlas_packets: 17985 rows
- atlas_tree_nodes: 8823 rows
- atlas_topology_index: 3251 rows
- error_logs: 5 rows

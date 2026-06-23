# GDS/SOM Topology Backfill Report

Generated: 2026-06-23T18:50:12.068Z
Mode: **DRY-RUN**
Input File: `.tmp/addressable-packets.enriched.ndjson`

## Executive Summary

This report captures the results of the Graph Data Science (GDS) and Self-Organizing Map (SOM) topology enrichment pass. Packet structures now carry community partitioning, graph centrality ranks, and SOM BMU grid projections directly inside the validated `topology` envelope.

## Statistics

| Metric | Count | Percentage |
|:---|:---|:---|
| **Total Processed** | 10 | 100% |
| **Success Updates** | 10 | 100.0% |
| **Neo4j GDS Enriched** | 9 | 90.0% |
| **SOM BMU Coords Enriched** | 0 | 0.0% |
| **Errors** | 0 | 0.0% |

## Component Status

- **Neo4j GDS**: ✅ REACHABLE (Scored nodes: 8804, Resolved matches: 9)
- **SOM BMU Coordinates**: ✅ LOADED (Assigned cells: 9372)

## Errors List

*No errors encountered.*

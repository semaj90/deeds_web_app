# Runtime Packet Backfill Plan

Generated: 2026-06-05T21:50:20.966Z

## Inputs

- runtime packet density: docs\reports\runtime-packet-density-report.json
- feature lineage: docs\reports\feature-lineage-report.json
- hidden packet pathmap: docs\reports\hidden-packet-pathmap-report.json
- route_runtime_packets: reachable

## Summary

- analyzed packets: 33
- empty-pointer packets: 1
- optimal packets: 32
- average hydration ratio: 88.38%
- packet tail requiring replay: 1
- packet tail recoverable without replay: 32

## Field Classification

| Field | Missing | Classification | Sample packets | Notes |
| --- | ---: | --- | --- | --- |
| sourceRefs | 3 | RECOVERABLE_FROM_QDRANT_HIT | 16, 4, 1 | Packet 1 is empty-pointer and still needs replay; the rest can be reconstructed from Qdrant hits and pathmap/parent-atlas joins. |
| featureIds | 3 | RECOVERABLE_FROM_FEATURE_LABELS | 16, 4, 1 | Packet 1 is empty-pointer and still needs replay; the other missing feature IDs can be derived from feature labels/pathmap. |
| qdrantHits | 1 | NEEDS_REPLAY | 1 | The empty-pointer packet has no source/feature anchors, so the missing Qdrant hit must be replayed. |
| redisKeys | 1 | NEEDS_REPLAY | 1 | The empty-pointer packet cannot reconstruct Redis hot keys without replay. |
| parentAtlasDocuments | 23 | RECOVERABLE_FROM_PARENT_ATLAS | 31, 28, 27, 24, 23, 20 | Parent Atlas rows are present and the sourceRef/featureId spine is complete, so this is a join/backfill repair rather than ingest. |
| somCluster | 32 | RECOVERABLE_FROM_QDRANT_HIT | 33, 32, 31, 30, 29, 28 | SOM cluster backfill should come from Qdrant hit metadata when available; only the empty-pointer packet lacks enough anchors for replay-free repair. |
| glyphRecord | 33 | RECOVERABLE_FROM_PARENT_ATLAS | 33, 32, 31, 30, 29, 28 | Glyph records are a materialization/backfill concern, not a broad re-ingest problem. |
| neo4jNode | 33 | RECOVERABLE_FROM_PARENT_ATLAS | 33, 32, 31, 30, 29, 28 | Neo4j nodes can be reconstructed from the sourceRef/featureId spine and graph-truth joins once the graph lane is available. |
| rankedCards | 33 | NEEDS_REPLAY | 33, 32, 31, 30, 29, 28 | Ranked cards on the empty-pointer packet require replay. |

## Packet Tail

| Packet | Backfill class | Missing fields | Suggested actions |
| --- | --- | --- | --- |
| 33 | RECOVERABLE_FROM_PARENT_ATLAS | somCluster, glyphRecord, neo4jNode, rankedCards | derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |
| 32 | RECOVERABLE_FROM_PARENT_ATLAS | somCluster, glyphRecord, neo4jNode, rankedCards | derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |
| 31 | RECOVERABLE_FROM_PARENT_ATLAS | parentAtlasDocuments, somCluster, glyphRecord, neo4jNode, rankedCards | refresh parent atlas join rows; derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |
| 30 | RECOVERABLE_FROM_PARENT_ATLAS | somCluster, glyphRecord, neo4jNode, rankedCards | derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |
| 29 | RECOVERABLE_FROM_PARENT_ATLAS | somCluster, glyphRecord, neo4jNode, rankedCards | derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |
| 28 | RECOVERABLE_FROM_PARENT_ATLAS | parentAtlasDocuments, somCluster, glyphRecord, neo4jNode, rankedCards | refresh parent atlas join rows; derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |
| 27 | RECOVERABLE_FROM_PARENT_ATLAS | parentAtlasDocuments, somCluster, glyphRecord, neo4jNode, rankedCards | refresh parent atlas join rows; derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |
| 26 | RECOVERABLE_FROM_PARENT_ATLAS | somCluster, glyphRecord, neo4jNode, rankedCards | derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |
| 25 | RECOVERABLE_FROM_PARENT_ATLAS | somCluster, glyphRecord, neo4jNode, rankedCards | derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |
| 24 | RECOVERABLE_FROM_PARENT_ATLAS | parentAtlasDocuments, somCluster, glyphRecord, neo4jNode, rankedCards | refresh parent atlas join rows; derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |
| 23 | RECOVERABLE_FROM_PARENT_ATLAS | parentAtlasDocuments, somCluster, glyphRecord, neo4jNode, rankedCards | refresh parent atlas join rows; derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |
| 22 | RECOVERABLE_FROM_PARENT_ATLAS | somCluster, glyphRecord, neo4jNode, rankedCards | derive SOM cluster from qdrant hit / parent atlas mapping; materialize glyph record from higher-hop atlas state; rebuild Neo4j node from sourceRef/featureId spine; replay downstream ranking stage |

## Notes

- The planner keeps Parent Atlas and Graphify as utility tooling for semantic indexing and ACE quick hits.
- The packet tail is small; the empty-pointer packet is the only one that clearly requires replay.
- Higher-hop fields are still a materialization/backfill problem, not a broad re-ingest problem.

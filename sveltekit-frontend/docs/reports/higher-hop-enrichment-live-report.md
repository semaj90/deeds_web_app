# Higher-Hop Enrichment Live Audit

Generated: 2026-06-14T21:08:33.026Z

## Summary

- feature-lineage sourceRef coverage: 100%
- feature-lineage featureId coverage: 100%
- runtime selected_concepts coverage: 100%
- runtime retrieved_packets coverage: 100%
- Neo4j available: yes
- supernode thresholds: concept>500, feature>1000, community>2000

## Join-Hint Guidance

- Anchor traversals on bounded roots: packet_key, source_ref_key, or qdrant_point_id.
- Avoid starting from Concept / Feature / Community supernodes.
- Use USING JOIN ON p when joining separate packet and concept branches.
- Split fan-out traversals into subqueries when node degree is high.
- Keep Neo4j for explanation and topology; keep Postgres/Qdrant for truth and recall.

## Safe Start Nodes

- packet_key
- source_ref_key
- qdrant_point_id

## Supernodes

| Label | Threshold | Count Above Threshold | Top Degree | State |
|-------|-----------|-----------------------|------------|-------|
| Concept | 500 | 14 | 3358 | SUPERNODE_RISK |
| Feature | 1000 | 2 | 1591 | SUPERNODE_RISK |
| Community | 2000 | 1 | 4621 | SUPERNODE_RISK |

## Notes

- This audit is read-only.
- It complements the existing higher-hop coverage report by adding live graph risk guidance.
- When the Neo4j graph is unavailable, the audit still writes a report with unavailable status.

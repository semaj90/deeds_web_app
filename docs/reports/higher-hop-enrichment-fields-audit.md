# Higher-Hop Enrichment Fields Audit

**Timestamp**: 2026-06-15T08:25:25.778Z
**Status**: PASS

## Overview

Audits availability of five enrichment fields across mirrors:
- somCluster (Postgres + Qdrant)
- glyphRecord (atlas_svg_glyphs)
- qdrantHit (Qdrant payload)
- redisHotKey (Redis cache)
- neo4jNode (Neo4j graph)

## Coverage Summary

| Field | Coverage | Percent |
|-------|----------|---------|
| somCluster | 50/50 | 100.0% |
| glyphRecord | 50/50 | 100.0% |
| qdrantHit | 92/100 | 92.0% |
| redisHotKey | 50/50 | 100.0% |
| neo4jNode | 50/50 | 100.0% |

## Pass Condition

✅ Average coverage ≥70% (higher-hop enrichment ready)


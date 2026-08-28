# Higher-Hop Enrichment Fields Audit

**Timestamp**: 2026-08-28T18:42:47.355Z
**Status**: WARN

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
| somCluster | 49/50 | 98.0% |
| glyphRecord | 0/50 | 0.0% |
| qdrantHit | 100/100 | 100.0% |
| redisHotKey | 50/50 | 100.0% |
| neo4jNode | 17/50 | 34.0% |

## Pass Condition

✅ Average coverage ≥70% (higher-hop enrichment ready)


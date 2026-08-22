# Atlas Analyze Skill

Deep analysis of a retrieved packet: lineage, mirrors, relationships.

## Usage

```
@atlas analyze "packet_key"
```

## Examples

- `@atlas analyze "ace:packet:auth:001"`
- `@atlas analyze "src/lib/server/gpu/libtorch-bridge.ts"`

## Parameters

- `identifier` (required): packet_key or file path

## Description

Returns the full identity chain, Postgres canonical row, Qdrant payload, Neo4j USED_CONCEPT edges, Redis cache status, and cold-storage manifest (if applicable).

Verifies lineage contract and reports any orphaned mirrors.

---
name: CouchDB MapReduce Atlas Ingestion
description: CouchDB rollup layer for directory wiki docs, cluster summaries, and feature cards.
type: project
tags:
  - couchdb
  - mapreduce
  - atlas
---

# CouchDB MapReduce Atlas Ingestion

CouchDB stores wiki-style rollups and derived summary documents.
It is a replicated review and offline-view layer, not the canonical owner of
workflow state, embeddings, or graph authority.

## Doc Types

- `directory_wiki`
- `cluster_summary`
- `feature_card`
- `route_card`
- `engram_memory`
- `review_note`
- `offline_annotation`

## Views

- `by_type`
- `by_workspace`
- `by_cluster`
- `by_feature`
- `by_route`
- `by_tag`
- `by_updated_at`

## Boundary Rules

- Use CouchDB for replicated JSON documents, review notes, and offline views.
- Do not treat CouchDB as canonical truth for embeddings, KNN indexes, or workflow acceptance.
- Emit compact work messages through MsgPack or queue envelopes instead of storing large tensors here.
- Use Arrow IPC or Parquet for analytic batches; use DuckDB to reduce them before promotion back to Postgres.

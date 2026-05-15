# SurrealDB Multi-Store Consolidation Note

> Captured 2026-05-14 after revisiting the stack checklist and the current multi-store layout.

## Context

The codebase currently spreads responsibilities across Postgres, Redis, Qdrant, Neo4j, CouchDB, MinIO, and Ollama/TurboQuant sidecars. That is workable, but it increases operational surface area and makes dependency tracking harder across dev, test, and prod.

## Why SurrealDB came up

SurrealDB could theoretically collapse some document + graph + vector lookups into a smaller number of stores. That makes it attractive as a consolidation experiment when the goal is reducing the number of live backends the team has to coordinate.

## Current stance

- Treat SurrealDB as a research spike only.
- Do not replace Postgres, Qdrant, or Neo4j with it yet.
- Keep the current specialized stores canonical until a concrete migration plan proves out.
- If evaluated, compare it against the exact queries we run today, not generic feature lists.

## Checklist

- [ ] Map the top 10 cross-store queries that currently need Postgres + Qdrant + Neo4j.
- [ ] Measure whether SurrealDB would actually remove code, or just move it.
- [ ] Check licensing, backup, and migration implications before any prototype.
- [ ] Compare query latency and write complexity against the current stack.
- [ ] Keep this as a note unless a real consolidation bottleneck appears.

## Summary

SurrealDB may help with store consolidation in theory, but right now it is better documented as a research option than adopted as infrastructure. The current stack already has enough moving parts; any consolidation has to prove it reduces operational load without weakening graph, vector, or relational workflows.

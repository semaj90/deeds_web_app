---
type: index
title: OKF Knowledge Graph Index
id: index
status: active
owners:
  - legal-ai-team
updated: 2026-07-20
---

# OKF Knowledge Graph — Deep Research & Canonical Packet Architecture

This directory contains curated knowledge concepts for the deeds-web-app legal AI platform. Each concept is a portable Markdown export of canonical Parent Atlas knowledge—not a second database or vector storage.

## Directory Structure

- **systems/**: Core architectural systems (HyperRAG, deep research orchestration, packet identity)
- **pipelines/**: Data flow and orchestration pipelines (content ingestion, retrieval, ranking, synthesis)
- **datasets/**: Corpus and data definitions (legal knowledge bases, training labels, references)
- **tools/**: Agentic tools and integrations (MCP servers, ML sidecars, synthesis models)
- **runbooks/**: Operational guides and setup procedures
- **concepts/**: Domain knowledge and decision records

## Key Concepts

### Knowledge Layer Boundaries
- ✅ **In OKF**: Curated stable concepts (architecture decisions, service ownership, data contracts, runbooks, metric definitions, API semantics, constraints, features, acceptance criteria)
- ❌ **NOT in OKF**: Source files, Qdrant points, event logs, raw embeddings, generated summaries, workflow events, tensor artifacts

### Identity Model
- Paths are identity: `/systems/hyperrag.md` → `id: system/hyperrag`
- Markdown with YAML frontmatter: human-readable, portable, version-controllable
- Source refs connect to canonical Parent Atlas (Postgres packet_key, source_ref)

### Canonical Authority
Postgres 18 remains the single source of truth for:
- Packet identity (58,304 packets, 40,754 code chunks)
- Embeddings (768-dim via embeddinggemma)
- Qdrant mirroring (40,568 points)
- Neo4j topology mirrors
- Valkey/Redis cache layers
- Audit logs and decision traces

OKF serves as curated knowledge export, not replacement.

## Related Documents

- [Parent Atlas Canonical Architecture](../docs/architecture/CANONICAL-PACKET-WIRING-BLUEPRINT.md)
- [Deep Research Infrastructure](../docs/DEEP-RESEARCH-INDEX.md)
- [HyperRAG Control Panel Guide](../docs/architecture/trace-kag-web-development-guide.md)

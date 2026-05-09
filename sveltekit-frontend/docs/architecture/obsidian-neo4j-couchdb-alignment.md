---
name: Obsidian + Neo4j + CouchDB Alignment
description: How the Obsidian vault, Neo4j graph, optional CouchDB MapReduce views, Postgres truth store, and Qdrant vector index keep one another in sync — and which one is canonical for which kind of question.
type: project
tags:
  - obsidian
  - neo4j
  - couchdb
  - postgres
  - qdrant
  - alignment
  - graphrag
---

# Obsidian + Neo4j + CouchDB Alignment

Five stores, one truth. The trap is duplicate canonicality — two stores
both claiming to own the same fact, drifting silently. This doc fixes
each store's job and the **direction of replication** between them.

## Roles (canonical)

| Store | Owns | Never owns |
|-------|------|-----------|
| **Postgres** (Drizzle) | typed truth: cases, evidence, users, JSONB envelopes, retrieval traces, manifold4, audit logs | embeddings, dense vectors, raw markdown, free-form graph traversal |
| **Qdrant** | dense embeddings + metadata payloads for ANN recall (`codebase_chunks_768`, `evidence_items`, `legal_documents`, …) | typed truth — payloads are denormalized derivatives |
| **Neo4j** | graph relationships, PageRank, community detection, `SIMILAR_TOPOLOGY`, ACE pathing | row-level truth; if Neo4j and Postgres disagree, Postgres wins |
| **Redis** | hot cache: signed URLs, retrieval traces, `wiki:note:dir:*`, `gpu:karpathy:*`, ACE topo-byte cache | durable storage |
| **CouchDB** *(optional)* | cached MapReduce views: `couchdb:pagerank_scores`, `graph_recommendations`, replicated operator dashboards | canonical truth, embeddings, anything Postgres already owns |
| **Obsidian vault** | human-readable wiki — pathway cards, feature cards, timeline cards, AGENTS.md, daily notes | machine-canonical anything; the vault is a *projection*, not a source |

Reading this table in one sentence: **Postgres is canonical truth,
Qdrant is canonical recall, Neo4j is canonical graph, Redis is hot
cache, CouchDB is replicated views, Obsidian is the printed
encyclopedia.**

## Direction of replication

```
                  Postgres (truth)
                      │
            ┌─────────┼─────────┬────────────┐
            ▼         ▼         ▼            ▼
         Qdrant     Neo4j    CouchDB      Redis
        (vectors)  (graph)   (views)     (cache)
                      │
                      ▼
                Obsidian vault
              (human-readable)
```

- **Postgres → Qdrant:** evidence/document/legal pipelines write
  embeddings + payloads after Postgres commits. Qdrant payload includes
  `pg_id` so a vector hit can resolve back to the typed row.
- **Postgres → Neo4j:** `code_relations`, `directory_context_bindings`,
  `agent_context_files`, FK edges, and authority blends sync via
  scheduled jobs (`graphify:authority`, `graphify:gds`, the standalone
  `run-pagerank.ts` / `run-hypergraph.ts` pipelines).
- **Postgres + Neo4j → CouchDB:** *only* materialized views. CouchDB
  rows are derivative; rebuilding them must always be possible from
  Postgres+Neo4j alone.
- **Postgres + Neo4j + Qdrant → Obsidian:** vault notes are generated
  by `graphify:daily` and the AGENTS.md pipeline. The vault never
  writes back.

The arrows never reverse. If a tool is reaching for "let me update
Postgres from CouchDB," that's the bug.

## When to ask which store

| Question | Ask | Why |
|----------|-----|-----|
| "What is the current status of evidence X?" | Postgres | typed truth |
| "Which 10 chunks are most semantically similar to this query?" | Qdrant | dense ANN |
| "Which files share authority and topology with `redis.ts`?" | Neo4j | graph traversal |
| "What's the PageRank score for `db/client.ts`?" | Redis (`gpu:karpathy:scores`) → CouchDB (`couchdb:pagerank_scores`) → Neo4j re-run | hot → warm → cold |
| "What does the human note for `src/lib/server/cache/` say?" | Obsidian (`wiki:note:dir:src/lib/server/cache`) | the wiki *is* the answer here |
| "Has the AGENTS.md for this directory drifted from the resolved bindings?" | Postgres `agent_context_files` + `directory_context_bindings` | typed audit |

## Card types and where they live

The "printing press" produces three card types and all of them have a
home in Postgres + a projection in Obsidian:

| Card type | Postgres table | Obsidian path | Neo4j node | Qdrant collection |
|-----------|---------------|---------------|------------|-------------------|
| **Pathway card** | `graph_pathway_cards` | `vault/pathways/<id>.md` | `:Pathway` | (none — these are graph-shaped) |
| **Feature card** | `feature_cards` (planned) | `vault/features/<slug>.md` | `:Feature` | `feature_cards_768` (planned) |
| **Timeline card** | `context_timeline` | `vault/timeline/<date>/<event_id>.md` | `:TimelineEvent` | `chat_messages` (when conversational) |
| **Wiki note** | `wiki_md_index` | `vault/notes/<dir>/index.md` | (linked via `MENTIONED_IN`) | `vault_md_join` (view) |
| **AGENTS.md** | `agent_context_files` | `<dir>/AGENTS.md` (in repo, not vault) | (linked via `directory_context_bindings`) | (indexed for retrieval) |

Two rules keep these from going stale:

1. **One writer per row.** A pathway card is written by the pathway
   builder. The Obsidian projection is regenerated, never edited
   in-place by a script.
2. **`content_hash` everywhere.** Every card carries a sha256 of its
   normalized body. Re-runs are idempotent and stale projections are
   detectable in seconds.

## CouchDB: scope and non-scope

CouchDB is **optional**. We use it for two things:

- **`couchdb:pagerank_scores`** — JSON-serialized PageRank output cached
  with 6h TTL. Read by ACE Stage A0 and the Karpathy blend. Rebuilt by
  `scripts/run-pagerank.ts` from Neo4j.
- **`graph_recommendations`** — AI-generated missing-import
  recommendations, ~8 docs at last count, surfaced by
  `scripts/show-recommendations.mjs`.

CouchDB views are appealing because the JS map function emits
key/value rows and CouchDB maintains the B-tree index incrementally.
That property fits "operator dashboard" and "offline-replicable
read-only summary" use cases — but it does **not** make CouchDB a
replacement for Postgres. Reduce values must stay small (CouchDB
guidance), which mirrors the notecard/card-summary shape we already
write.

CouchDB **is not**:

- a place to store evidence binaries (use the planned object-storage
  layer — see the next-steps `2026-05-09_object-storage-seaweedfs.md`
  proposal),
- a place to store typed truth,
- a target for arbitrary writes from agents.

## Obsidian vault: scope and non-scope

The vault is a *human-facing projection*. It's allowed to be slightly
stale — that's fine. What it is **not** allowed to be is:

- a write source: no script reads from `vault/*.md` to update Postgres;
- a place where humans hand-edit machine-generated cards (those have
  a `generated: true` frontmatter that the regenerator overwrites);
- the canonical answer for "what's the current state of X" — that's
  Postgres.

What the vault is great for:

- weekly review (open the daily timeline page, scan rl_adapt + summary
  events at a glance);
- onboarding (pathway cards explain *why* a chunk of the codebase
  exists);
- offline / air-gapped operator review (the vault + a CouchDB replica
  is enough to read the system without booting Postgres).

## Avoiding duplicate truth

Three smells to watch for in PRs:

1. **A new write path that targets two stores in the same commit.**
   If you're writing the same fact to Postgres *and* Neo4j *and*
   Obsidian in one place, one of those is wrong. Pick the canonical
   owner and let the projection job pick it up next run.
2. **An MCP tool that reads from CouchDB to answer a question
   Postgres also knows.** CouchDB is the cache, not the source.
   Reading the cache is fine; *trusting it as truth* is the bug.
3. **A vault note that has no Postgres row backing it.** The
   regenerator will overwrite it on the next run; whatever the human
   typed there is lost. Promote the content to a card type or to
   AGENTS.md instead.

## Validator hooks (planned)

- `G34 alignment:projection-freshness` — every Obsidian projection
  references a `content_hash` that matches its Postgres source.
- `G35 alignment:pagerank-cache-fresh` — CouchDB
  `couchdb:pagerank_scores` is ≤24h old or absent (not stale-and-trusted).
- `G36 alignment:fk-graph-mirror` — every FK edge in Postgres has a
  corresponding edge type in Neo4j (or is on the explicit
  not-mirrored allow-list).

These ride on top of `trace.alignment_check` from
[claude-code-agent-os.md](claude-code-agent-os.md).

# REL-01A8 — Independent Source-Span/Revision Validation

**Read-only.** Zero Postgres/Qdrant/Neo4j/Valkey writes. Generated: 2026-09-16T00:28:19.005Z
Repository HEAD: `d4b5a3dcff328615f20c110eea1fe9a4d0b996db`
Input receipt workspace revision: `sha256:927ed41118a45a4b88fdaf15229f8e94358a375bd5b3ea19421ea42d2fa5bad3`

## Status: **FRESH_EXTRACTION_INCOMPLETE**

Next gate: `RE_EXTRACT_STALE_SOURCES_BEFORE_HUMAN_REVIEW`

## Per-source revision check (4 sources, 202 candidates)

| Source | Verdict | Candidates | Claimed revision | Live revision |
|---|---|---|---|---|
| `sveltekit-frontend/src/lib/server/ai/langgraph-research.ts` | SOURCE_REVISION_CURRENT | 50 | `sha256:73299f8bc02d95075697fb9df5f4faf56eac2ce97c4adb38de993e2c621f4b1a` | `sha256:73299f8bc02d95075697fb9df5f4faf56eac2ce97c4adb38de993e2c621f4b1a` |
| `sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts` | SOURCE_REVISION_CURRENT | 50 | `sha256:e2421bd70077b7b52c75d3a7ff706eec5227c3a2cd0719a34cd386ca2e4e6ada` | `sha256:e2421bd70077b7b52c75d3a7ff706eec5227c3a2cd0719a34cd386ca2e4e6ada` |
| `sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts` | SOURCE_REVISION_CURRENT | 51 | `sha256:1840825b32ee43669794fb4f8647ca6468e2033304d39a3019a224b7dc49f215` | `sha256:1840825b32ee43669794fb4f8647ca6468e2033304d39a3019a224b7dc49f215` |
| `sveltekit-frontend/src/lib/server/ai/langgraph-client.ts` | SOURCE_REVISION_CURRENT | 51 | `sha256:86d5275cfd5b097ff23e548af21bbe78e10b4815f173a798903f2b122f0ec896` | `sha256:86d5275cfd5b097ff23e548af21bbe78e10b4815f173a798903f2b122f0ec896` |

## Span verdict counts

- `NO_SPAN_CLAIMED`: 197
- `SPAN_IN_BOUNDS`: 5

## Source revision verdict counts

- `SOURCE_REVISION_CURRENT`: 4

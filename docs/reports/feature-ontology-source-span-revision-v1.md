# REL-01A8 — Independent Source-Span/Revision Validation

**Read-only.** Zero Postgres/Qdrant/Neo4j/Valkey writes. Generated: 2026-09-09T00:54:02.858Z
Repository HEAD: `8fdbcb53619b5ef5551c097948906ebdd6b01188`
Input receipt workspace revision: `sha256:927ed41118a45a4b88fdaf15229f8e94358a375bd5b3ea19421ea42d2fa5bad3`

## Status: **SOURCE_REVISION_DRIFT_DETECTED**

Next gate: `RE_EXTRACT_STALE_SOURCES_BEFORE_HUMAN_REVIEW`

## Per-source revision check (6 sources, 304 candidates)

| Source | Verdict | Candidates | Claimed revision | Live revision |
|---|---|---|---|---|
| `sveltekit-frontend/src/lib/server/ai/langgraph-research.ts` | SOURCE_REVISION_CURRENT | 50 | `sha256:73299f8bc02d95075697fb9df5f4faf56eac2ce97c4adb38de993e2c621f4b1a` | `sha256:73299f8bc02d95075697fb9df5f4faf56eac2ce97c4adb38de993e2c621f4b1a` |
| `sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts` | SOURCE_REVISION_CURRENT | 50 | `sha256:e2421bd70077b7b52c75d3a7ff706eec5227c3a2cd0719a34cd386ca2e4e6ada` | `sha256:e2421bd70077b7b52c75d3a7ff706eec5227c3a2cd0719a34cd386ca2e4e6ada` |
| `sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts` | SOURCE_REVISION_CURRENT | 51 | `sha256:1840825b32ee43669794fb4f8647ca6468e2033304d39a3019a224b7dc49f215` | `sha256:1840825b32ee43669794fb4f8647ca6468e2033304d39a3019a224b7dc49f215` |
| `sveltekit-frontend/src/lib/server/ai/langgraph-client.ts` | SOURCE_REVISION_CURRENT | 51 | `sha256:86d5275cfd5b097ff23e548af21bbe78e10b4815f173a798903f2b122f0ec896` | `sha256:86d5275cfd5b097ff23e548af21bbe78e10b4815f173a798903f2b122f0ec896` |
| `sveltekit-frontend/src/lib/server/retrieval/cross-encoder-reranker.ts` | SOURCE_REVISION_STALE | 51 | `sha256:dd7aef6f31761d9827afde6a0bbbdec502f9b50917ed008f8ec17a434a35bcf1` | `sha256:642aefad40d76229964af139845601ed72e88ff26682d5cbbb97c0dfee44b404` |
| `sveltekit-frontend/src/lib/server/ai/trace-reranker.ts` | SOURCE_REVISION_CURRENT | 51 | `sha256:37fda484ff6c0b6a24a72cb164aeb280bb8e4a94872c41937369171536f54cd3` | `sha256:37fda484ff6c0b6a24a72cb164aeb280bb8e4a94872c41937369171536f54cd3` |

## Span verdict counts

- `NO_SPAN_CLAIMED`: 295
- `SPAN_IN_BOUNDS`: 9

## Source revision verdict counts

- `SOURCE_REVISION_CURRENT`: 5
- `SOURCE_REVISION_STALE`: 1

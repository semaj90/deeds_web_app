# Parent Atlas PostgreSQL FTS patch notes

Reviewed against `semaj90/deeds_web_app` main at `dcc4898338c7991f695a7c34d0932f93590b7800`.

This patch removes the fabricated lexical candidate and replaces it with real PostgreSQL FTS. It deliberately retains the legacy `BM25` API names for compatibility while emitting `retrieval_algorithm = postgres_fts_ts_rank_cd`.

The lexical query uses `codebase_chunk_index.search_vector`, then resolves to canonical `atlas_packets` only through an exact `(source_ref, content_hash)` join. Ambiguous identity joins are dropped, and duplicate packet candidates are suppressed before downstream fusion.

Before promotion, run the package typecheck plus a read-only live query and record lexical hits, exact canonical matches, unmatched hits, ambiguous hits, and duplicate packets suppressed.

For true BM25, use a separate Qdrant sparse-vector proof. Current Qdrant supports `qdrant/bm25` plus an IDF modifier. Record Qdrant version, collection/vector name, model, IDF setting, language/tokenizer, k, b, avg_len, source/corpus revision, CandidateOrdinal checksum, and held-out Recall/MRR/NDCG.

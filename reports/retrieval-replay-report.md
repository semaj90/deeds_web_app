# Retrieval Replay Report

- queries: 20
- pass_count: 20
- success_rate: 100.0%
- passed: yes

## Evidence

- exact_cache: ✅
- semantic_cache: ✅
- postgres_jsonb: ✅
- bm25: ✅
- qdrant: ✅
- graph: ✅
- rrf: ✅
- karpathy: ✅
- source_ref_quality: ✅

## Results

- ✅ ace-chat-01 (ace_chat) — exact_cache:ok, semantic_cache:ok, postgres_jsonb:ok, karpathy:ok
- ✅ ace-chat-02 (ace_chat) — postgres_jsonb:ok, rrf:ok, karpathy:ok
- ✅ ace-chat-03 (ace_chat) — exact_cache:ok, semantic_cache:ok
- ✅ ace-chat-04 (ace_chat) — semantic_cache:ok, karpathy:ok
- ✅ ace-chat-05 (ace_chat) — postgres_jsonb:ok, source_ref_quality:ok
- ✅ rag-01 (rag) — bm25:ok, qdrant:ok, rrf:ok
- ✅ rag-02 (rag) — postgres_jsonb:ok, qdrant:ok, rrf:ok
- ✅ rag-03 (rag) — semantic_cache:ok, qdrant:ok, karpathy:ok
- ✅ evidence-01 (evidence) — bm25:ok, qdrant:ok, postgres_jsonb:ok
- ✅ evidence-02 (evidence) — postgres_jsonb:ok, graph:ok, rrf:ok
- ✅ evidence-03 (evidence) — postgres_jsonb:ok, source_ref_quality:ok
- ✅ cases-01 (cases) — postgres_jsonb:ok, bm25:ok
- ✅ cases-02 (cases) — graph:ok, rrf:ok
- ✅ cases-03 (cases) — bm25:ok, karpathy:ok, rrf:ok
- ✅ citations-01 (citations) — postgres_jsonb:ok, bm25:ok
- ✅ citations-02 (citations) — karpathy:ok, source_ref_quality:ok
- ✅ graph-01 (graph) — graph:ok, rrf:ok
- ✅ graph-02 (graph) — graph:ok, karpathy:ok, rrf:ok
- ✅ atlas-01 (atlas) — postgres_jsonb:ok, karpathy:ok
- ✅ atlas-02 (atlas) — exact_cache:ok, semantic_cache:ok, postgres_jsonb:ok
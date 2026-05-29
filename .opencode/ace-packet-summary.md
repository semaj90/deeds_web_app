# ACE Packet Summary

Generated: 2026-05-29T06:24:29.594Z
Query: "ACE context retrieval"
Cards: 78 / budget: 6000 tokens (~5996 used)

## Areas
- **misc** — 78 cards (top score: 0.8065)

## Top 10 Cards
1. `undefined` — score 0.8065
2. `undefined` — score 0.8042
3. `undefined` — score 0.7073
4. `undefined` — score 0.6948
5. `undefined` — score 0.6905
6. `undefined` — score 0.6895
7. `undefined` — score 0.6888
8. `undefined` — score 0.6871
9. `undefined` — score 0.6863
10. `undefined` — score 0.6859

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
# ACE Packet Summary

Generated: 2026-05-31T20:55:34.965Z
Query: "ACE context retrieval"
Cards: 78 / budget: 6000 tokens (~5996 used)

## Areas
- **misc** — 78 cards (top score: 0.8051)

## Top 10 Cards
1. `undefined` — score 0.8051
2. `undefined` — score 0.8028
3. `undefined` — score 0.7060
4. `undefined` — score 0.6934
5. `undefined` — score 0.6892
6. `undefined` — score 0.6882
7. `undefined` — score 0.6875
8. `undefined` — score 0.6858
9. `undefined` — score 0.6850
10. `undefined` — score 0.6845

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
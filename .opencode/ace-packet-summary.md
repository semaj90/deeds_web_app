# ACE Packet Summary

Generated: 2026-06-03T22:01:39.508Z
Query: "ACE context retrieval"
Cards: 76 / budget: 6000 tokens (~5997 used)

## Areas
- **misc** — 76 cards (top score: 0.7934)

## Top 10 Cards
1. `undefined` — score 0.7934
2. `undefined` — score 0.7850
3. `undefined` — score 0.6862
4. `undefined` — score 0.6847
5. `undefined` — score 0.6796
6. `undefined` — score 0.6765
7. `undefined` — score 0.6759
8. `undefined` — score 0.6758
9. `undefined` — score 0.6751
10. `undefined` — score 0.6749

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
# ACE Packet Summary

Generated: 2026-06-03T19:31:15.589Z
Query: "ACE context retrieval"
Cards: 76 / budget: 6000 tokens (~5997 used)

## Areas
- **misc** — 76 cards (top score: 0.7937)

## Top 10 Cards
1. `undefined` — score 0.7937
2. `undefined` — score 0.7854
3. `undefined` — score 0.6865
4. `undefined` — score 0.6851
5. `undefined` — score 0.6799
6. `undefined` — score 0.6768
7. `undefined` — score 0.6762
8. `undefined` — score 0.6762
9. `undefined` — score 0.6755
10. `undefined` — score 0.6752

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
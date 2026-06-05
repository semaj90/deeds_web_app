# ACE Packet Summary

Generated: 2026-06-04T19:56:55.849Z
Query: "ACE context retrieval"
Cards: 76 / budget: 6000 tokens (~5997 used)

## Areas
- **misc** — 76 cards (top score: 0.7903)

## Top 10 Cards
1. `undefined` — score 0.7903
2. `undefined` — score 0.7820
3. `undefined` — score 0.6831
4. `undefined` — score 0.6817
5. `undefined` — score 0.6765
6. `undefined` — score 0.6734
7. `undefined` — score 0.6728
8. `undefined` — score 0.6728
9. `undefined` — score 0.6721
10. `undefined` — score 0.6718

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
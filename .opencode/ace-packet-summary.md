# ACE Packet Summary

Generated: 2026-06-03T01:55:34.490Z
Query: "ACE context retrieval"
Cards: 76 / budget: 6000 tokens (~5997 used)

## Areas
- **misc** — 76 cards (top score: 0.7962)

## Top 10 Cards
1. `undefined` — score 0.7962
2. `undefined` — score 0.7878
3. `undefined` — score 0.6890
4. `undefined` — score 0.6875
5. `undefined` — score 0.6823
6. `undefined` — score 0.6793
7. `undefined` — score 0.6787
8. `undefined` — score 0.6786
9. `undefined` — score 0.6779
10. `undefined` — score 0.6777

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
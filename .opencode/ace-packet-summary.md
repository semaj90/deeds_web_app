# ACE Packet Summary

Generated: 2026-06-07T17:31:06.548Z
Query: "ACE context retrieval"
Cards: 76 / budget: 6000 tokens (~5997 used)

## Areas
- **misc** — 76 cards (top score: 0.7807)

## Top 10 Cards
1. `undefined` — score 0.7807
2. `undefined` — score 0.7723
3. `undefined` — score 0.6735
4. `undefined` — score 0.6720
5. `undefined` — score 0.6668
6. `undefined` — score 0.6638
7. `undefined` — score 0.6632
8. `undefined` — score 0.6631
9. `undefined` — score 0.6624
10. `undefined` — score 0.6622

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
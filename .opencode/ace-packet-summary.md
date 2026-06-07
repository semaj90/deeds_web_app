# ACE Packet Summary

Generated: 2026-06-07T04:14:33.272Z
Query: "ACE context retrieval"
Cards: 76 / budget: 6000 tokens (~5997 used)

## Areas
- **misc** — 76 cards (top score: 0.7825)

## Top 10 Cards
1. `undefined` — score 0.7825
2. `undefined` — score 0.7742
3. `undefined` — score 0.6753
4. `undefined` — score 0.6739
5. `undefined` — score 0.6687
6. `undefined` — score 0.6656
7. `undefined` — score 0.6650
8. `undefined` — score 0.6650
9. `undefined` — score 0.6642
10. `undefined` — score 0.6640

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
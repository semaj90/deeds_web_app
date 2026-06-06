# ACE Packet Summary

Generated: 2026-06-06T02:01:09.459Z
Query: "ACE context retrieval"
Cards: 78 / budget: 6000 tokens (~5996 used)

## Areas
- **misc** — 78 cards (top score: 0.7877)

## Top 10 Cards
1. `undefined` — score 0.7877
2. `undefined` — score 0.7855
3. `undefined` — score 0.6886
4. `undefined` — score 0.6761
5. `undefined` — score 0.6718
6. `undefined` — score 0.6708
7. `undefined` — score 0.6701
8. `undefined` — score 0.6684
9. `undefined` — score 0.6676
10. `undefined` — score 0.6672

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
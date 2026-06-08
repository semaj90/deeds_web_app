# ACE Packet Summary

Generated: 2026-06-07T23:26:29.860Z
Query: "ACE context retrieval"
Cards: 76 / budget: 6000 tokens (~5997 used)

## Areas
- **misc** — 76 cards (top score: 0.7798)

## Top 10 Cards
1. `undefined` — score 0.7798
2. `undefined` — score 0.7715
3. `undefined` — score 0.6726
4. `undefined` — score 0.6712
5. `undefined` — score 0.6660
6. `undefined` — score 0.6630
7. `undefined` — score 0.6624
8. `undefined` — score 0.6623
9. `undefined` — score 0.6616
10. `undefined` — score 0.6613

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
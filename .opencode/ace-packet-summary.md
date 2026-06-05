# ACE Packet Summary

Generated: 2026-06-05T14:13:20.767Z
Query: "ACE context retrieval"
Cards: 76 / budget: 6000 tokens (~5997 used)

## Areas
- **misc** — 76 cards (top score: 0.7878)

## Top 10 Cards
1. `undefined` — score 0.7878
2. `undefined` — score 0.7794
3. `undefined` — score 0.6806
4. `undefined` — score 0.6792
5. `undefined` — score 0.6740
6. `undefined` — score 0.6709
7. `undefined` — score 0.6703
8. `undefined` — score 0.6702
9. `undefined` — score 0.6695
10. `undefined` — score 0.6693

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
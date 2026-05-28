# ACE Packet Summary

Generated: 2026-05-28T19:44:17.623Z
Query: "ACE context retrieval"
Cards: 78 / budget: 6000 tokens (~5996 used)

## Areas
- **misc** — 78 cards (top score: 0.8079)

## Top 10 Cards
1. `undefined` — score 0.8079
2. `undefined` — score 0.8057
3. `undefined` — score 0.7088
4. `undefined` — score 0.6963
5. `undefined` — score 0.6920
6. `undefined` — score 0.6910
7. `undefined` — score 0.6903
8. `undefined` — score 0.6886
9. `undefined` — score 0.6878
10. `undefined` — score 0.6874

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
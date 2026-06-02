# ACE Packet Summary

Generated: 2026-06-02T05:26:03.084Z
Query: "ACE context retrieval"
Cards: 76 / budget: 6000 tokens (~5997 used)

## Areas
- **misc** — 76 cards (top score: 0.7990)

## Top 10 Cards
1. `undefined` — score 0.7990
2. `undefined` — score 0.7906
3. `undefined` — score 0.6918
4. `undefined` — score 0.6904
5. `undefined` — score 0.6852
6. `undefined` — score 0.6821
7. `undefined` — score 0.6816
8. `undefined` — score 0.6815
9. `undefined` — score 0.6807
10. `undefined` — score 0.6805

## Next Gate
Wire real embeddings: replace `pseudoEmbed()` in embed-cards.mjs + rank-cards.mjs
with `POST http://localhost:11434/api/embed` (Ollama embeddinggemma:latest).
Then wire Qdrant search, Neo4j edge expansion, Redis packet cache, Langfuse trace.
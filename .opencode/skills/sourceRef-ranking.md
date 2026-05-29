# Skill: sourceRef-ranking

## When to use
- When assembling ACE packets, cluster cards, or pathway summaries and you need a ranked list of sourceRefs to include.

## Goals
- Rank candidate sourceRefs by reliability, recency, and relevance.
- Provide a reproducible scoring function and feature vector for later training.

## Signals
- freshness: file mtime or commit timestamp
- provenance: internal repo vs external web
- authority: pagerank/graph authority + karpathy blend score
- semantic similarity: cosine(query_embedding, source_embedding)
- coverage: how many distinct claims or sections the sourceRef supports

## Scoring (example)

score = 0.35*semantic + 0.25*authority + 0.15*freshness + 0.15*provenance_score + 0.10*coverage

Where `provenance_score` = 1.0 for internal repo, 0.8 for org mirrors, 0.5 for external docs.

## Output
- Ordered array `[{sourceRef, score, reason, signals}]`.

## Process
1. Embed query and candidate sources (use cached embeddings when available).
2. Compute signals and per-source feature vectors.
3. Apply scoring function and return top-K with reasons.

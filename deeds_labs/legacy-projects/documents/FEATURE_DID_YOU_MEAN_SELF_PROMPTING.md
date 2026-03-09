## Did You Mean & Self-Prompting Implementation Notes

This document tracks the in-repo implementation status of the hybrid suggestion and self-prompting features.

### Status Summary
- Migration 003 (search_terms & rag_feedback) ADDED (pending apply in DB)
- API Stub: `/api/suggest/did-you-mean` (ranking merge placeholder)
- API Stub: `/api/rag/self_prompt` (vector + graph expansion placeholders)

### TODO (Next)
1. Wire actual DB queries for lexical candidates (pg_trgm) & semantic candidates (pgvector similarity from `passages`).
2. Add Redis caching layer (key prefix: `dym:v1:` & `selfp:v1:`) with TTL 10m.
3. Instrument Prometheus metrics:
   - `did_you_mean_latency_seconds` histogram
   - `did_you_mean_suggestions_total` counter (labels: source=lexical|semantic|merged)
   - `self_prompt_latency_seconds` histogram
   - `self_prompt_expansion_tokens` counter
4. Implement token budget pruning (score = w_sim + w_pr * pagerank - w_len * length_penalty).
5. Add insertion into `rag_feedback` when user accepts a suggestion or executes expanded prompt.
6. Feature flags: `ENABLE_SELF_PROMPT_EXPANSION`, `ENABLE_DID_YOU_MEAN`.
7. Optional: integrate concept extraction using lightweight spaCy / custom phrase extractor microservice.

### Testing Strategy
- Unit tests for rankMerge weight balancing.
- Integration test: simulate misspelled query -> expect lexical corrections.
- Integration test: low-result semantic query -> expect concept suggestions.
- Self-prompting test ensures prompt contains all selected core passage IDs.

### Performance Considerations
- Defer building an IVFFLAT index on `passages.embedding` until >50k rows.
- Batch semantic candidate queries (reuse prepared statement).
- Cache negative results (no suggestions) briefly to avoid repeated PG load on garbage inputs.

### Security / Abuse
- Rate-limit did-you-mean endpoint (e.g., per IP sliding window) to prevent enumeration of frequent terms.
- Sanitize user query before logging; strip control characters.

### Future Enhancements
- Add popularity boost: score += log(usage_count+1) * alpha for lexical terms.
- Integrate graph-based semantic broadening (neighbors of top semantic passages).
- Provide explanation metadata for each suggestion (typo_correction, related_concept, high_frequency).

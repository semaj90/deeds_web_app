# DOC-14 live citation readback — 2026-11-22

## Result

Implemented the next bounded handoff from official documentation search to exact canonical source evidence. The existing A2A `external-doc-admitted-context` route now passes PostgreSQL search hits through a read-only canonical chunk re-read before returning citations.

The readback is constrained to the selected canonical official chunk IDs. It checks that the current database row still has the expected page ID, URL, page revision, chunk revision, and official source authority. It then checks the UTF-8 byte span length, chunk SHA-256, and the repository's existing `chunkEvidenceRevisionV1` calculation. Search excerpts are never treated as verified source text. A stale or malformed record returns a blocked readback and no citation text.

## Verification

- `external-doc-citation-readback-v1.spec.ts`: 4/4 passed, including Unicode byte lengths, stale revision rejection, checksum rejection, and noncanonical/nonofficial rejection before SQL.
- `a2a-error-fix-proposal.route.spec.ts`: 9/9 passed; route consumes the verifier and emits readback status/blockers.
- Live PostgreSQL 18.4 test `DocCorpusPanel.live.spec.ts`: 1/1 passed. It exercised current official-doc search followed by direct chunk readback and checked verified UTF-8 spans.
- DOC-14 top-K diagnostic: 30 queries sampled from the same 200 exported repository-code chunks. `qualityBenchmarkEligible=false`; current diagnostic metrics are lexical Recall@5 1.0 / MRR 1.0, exact-ID 0.7 / 0.6467, corpus-order prior 0.2 / 0.2, and hybrid RRF 0.8667 / 0.7667. These values are self-match diagnostics, not quality evidence for official documentation.
- The evaluator now accepts a caller-supplied corpus and reviewed query JSON (`--corpus`, `--reviewed-queries`, `--output`). It validates unique chunk IDs, each chunk's UTF-8 content hash, the corpus identity checksum, a revision checksum over the frozen query set, and relevant chunk IDs/grades. The reviewed mode reports Recall@K, precision@K, MRR, and NDCG@K for the existing exact-ID, lexical, corpus-order diagnostic, and hybrid lanes. Its fixture tests pass 3/3. The revision field is integrity binding, not reviewer authentication, so benchmark eligibility remains false.
- `npm run check` did not complete: it emitted startup messages but no diagnostics before being interrupted. No full type-check result is claimed.
- `git diff --check` reports existing trailing whitespace in generated `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml`; that file is outside this patch. Line-ending notices were also emitted for other dirty worktree files.

## Not yet proven

- Reviewed, frozen official-document questions and relevance labels with Recall@10, MRR, NDCG@10, citation precision/support, abstention, and latency measurements.
- An existing admitted ACE candidate snapshot and ContextManifest for these external-document chunk IDs, followed by independent manifest readback. The route still emits a noncanonical A2A evidence artifact; it does not claim ACE admission.
- Actual `dspy.RLM` execution. The existing Python recommender is a bounded RLM-style helper and has no `dspy.RLM` import or invocation.
- Independent verification that generated answer claims are supported by the cited passages.
- Authorized ACE packet persistence or Valkey write, TTL, invalidation, and readback.

## Scope and authority

All SQL performed by the new adapter is a bounded `SELECT`; `canonicalAuthority=false` and `writesPerformed=false`. No task checkbox was changed to complete. DOC-14, DOC-SEARCH-05, and DOC-AGENT-06 remain open. No database, graph, cache, or object-store writes occurred.

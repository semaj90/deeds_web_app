# Feature recognition → TopFiles → ACE: next gates

Historical note: the attached July 23, 2026 Master Agentic Orchestration Specification includes mock embeddings, proposed KMeans/SOM tables, proposed helpers, and execution timings. Treat those as historical design ideas, **not** current live readiness or permission to create duplicate stores.

## Existing ownership boundaries
- Feature label: explicit > packet_context.feature_label > filename; never derive from summary and never infer ontology admission.
- Domain classification: canonical `domain-taxonomy.ts` version and labels; do not coerce unknown aliases or borrow producer_revision as feature/ontology revision.
- AST-grep: source-byte SHA256 and UTF-8 boundaries fixture-proven; real authorized source readback still required.
- SearchRuntime: unique canonical fusion/ranking owner; preserve TopFiles order; no second RRF or direct centroid hard filter.
- Cache/cosine: diagnostic routing. Centroid manifest, member map, embedding space, artifact checksum and workspace snapshot must independently match.
- ContextManifest and ontology tuple: independently admitted, revision-qualified evidence required; block when missing.

## Valkey-to-ACE source finding

The legacy `scripts/agent/agent-orchestrator.mjs` adds the literal “Startup cache layer (Valkey) verified” as hand-authored candidate evidence and supplies simulated policy scores. `scripts/agent/ace-assembler-recommendations.mjs` ranks and formats the in-memory candidates; it has no Valkey reader. This is a static mention, not a cache-result handoff or evidence receipt. The existing feature-runtime wiring audit reports this distinction, but does not prove runtime call edges. A real integration must obtain cache hints from the existing cache owner, resolve them through canonical SearchRuntime candidates, and pass only verified source evidence to the ACE owner.

## Tasks (append to current OpenSpec ledger only after checking its latest local revision)
- [ ] PF-OWNER-01 Verify current canonical source-byte reader and request-scoped CandidateOrdinalMap provider; prove route invocation and independently recomputed source hash.
- [ ] PF-OWNER-02 Locate real ChunkRetrievalProfileV2 and three supplement producer owners (frequency, execution utility, process fit); block absent revisions/evidence.
- [ ] PF-ROUTE-01 Bind existing `resolveFeatureSources` through `semantic-search-workflow.ts` without replacing `/api/retrieval/search-unified`; keep fallback UNAVAILABLE.
- [ ] PF-TOPFILES-01 Connect feature proposal → existing SearchRuntime lexical/AST/semantic/graph lanes → RRF → TopFiles; verify source spans before context assembly.
- [ ] PF-NLP-01 Allow optional bounded Pydantic/FastAPI LangExtract relation *proposals*; current sidecar source/loaded digest parity is an admission prerequisite; Oaklib CURIE lookup is not a canonical tuple.
- [ ] PF-DOCS-01 Fetch `.okf` and OpenWiki snippets via existing indexed documents with precise refs; docs hints are not source authority.
- [ ] PF-AGENT-01 Emit non-executable DAG/task proposals to existing agentic-file-compiler and OpenSpec owner; no patch execution or task claims without approval.
- [ ] PF-PROOF-01 Verify actual grounded tuple → ContextManifestV2 canonical identity → Ornith manifest-bound execution receipt; missing evidence remains BLOCKED.
- [ ] PF-TEST-01 Add route-level integration tests, source-byte mutation, revision mismatch, Unicode spans, provider failures and stable ranking. Narrow checks only; large Svelte checks may exceed memory.

`node scripts/atlas/lib/audit-feature-runtime-wiring-v1.mjs .` is a **static file/source census**, not a live execution or database proof. No writes.

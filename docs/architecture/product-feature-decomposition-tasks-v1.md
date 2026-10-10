# Parent Atlas product feature decomposition — proposed OpenSpec addendum

Local, proposal-only feature vocabulary for website, webapp and mobile feature recognition. It does not rewrite `domain-taxonomy.ts`, `atlas_domain_ontology`, `.okf` ontology IDs, or the packet summary feature-label precedence.

- [x] PFDECOMP-01: Seed a bounded proposal vocabulary for 14 common product features, with surface tags, canonical domain-classifier labels, and deterministic lexical Top-K.
- [x] PFDECOMP-02: Preserve `featureLabel` separate from summary text, domain classification, ontology identity and admission.
- [x] PFDECOMP-03: Add negative tests for unknown queries, topK, noncanonical surface and unsupported ontology promotion.
- [ ] PFDECOMP-04: Read real candidate source files from canonical SearchRuntime, with verified source revisions and AST/LSP symbol spans, then fill `sourceCandidates` only after owner readback.
- [ ] PFDECOMP-05: Use canonical lexical + semantic + graph lanes to rank actual TopFiles; the starter only emits `retrievalRequest` and vocabulary TopK, not file rankings.
- [ ] PFDECOMP-06: Expose classification as a bounded read-only LangExtract/FastAPI sidecar proposal endpoint, using Pydantic schemas and middleware; verify deployed module digest, bounded input, tracing and cancellation. Do not make sidecar the ontology/admission owner.
- [ ] PFDECOMP-07: Send proposed feature areas to existing `.okf`/OpenWiki retrieval indexes, and use Oaklib only for grounded CURIE proposals; never alias `ui`→`frontend` or `ml`→`machine-learning` without approved taxonomy-version adapter.
- [ ] PFDECOMP-08: Compile task/dependency proposals into existing agentic-file-compiler PromptPlan and DAG owners, not executable mutations; use OpenSpec task evidence and human gates.
- [ ] PFDECOMP-09: Add real app-route integration and exact source readback; guard manifest hash and package/model/prompt revisions. Missing admitted ontology tuple remains BLOCKED.
- [ ] PFDECOMP-10: Evaluate on frozen public-site screenshots/descriptions **only if licensed/authorized**, separate observation from inferred feature templates; do not crawl or copy brands by default.

Example: `Build a mobile offline sync and push notification app` → offline.sync + collaboration.notifications; `ontologyId:null`, `PROPOSAL_ONLY`.

To merge into local `openspec/changes/parent-atlas-ontology-kernel/tasks.md`, inspect its latest content first and append this addendum after the owning section. Finish ledger changes before refreshing revision-bound receipts.

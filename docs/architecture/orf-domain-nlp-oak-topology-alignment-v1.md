# Parent Atlas ORF / domain / NLP / ontology / topology alignment

Status: **PROPOSED — not approved, not admitted**. Do not create an alternate owner. Check the local retrieval-lineage OpenSpec ledger first.

## Existing owners (do not duplicate)
- ORF definition schema and builder: `packages/parent-atlas/src/core/observation-feature-compiler.ts`. Real fields include `evidence_requirements` and `missing_value_policy`. Production-approved vocabulary and authenticated review receipt still missing.
- AST evidence: `packages/parent-atlas/src/core/ast-grep-observation-adapter.ts`; frontend structural provider. Source ref, source revision, bytes, extractor revision required.
- Domain vocabulary: `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts`; ontology node identities: `atlas_domain_ontology`. `docs/architecture/domain-registry-contract-v1.md` identifies an unpopulated, unauthorized taxonomy-version adapter. Do not use classifier aliases as ontology IDs.
- Query planner: `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/query-classifier.ts`; retrieval logical lanes: `sveltekit-frontend/schemas/atlas/retrieval/retrieval-plan.v1.okf`.
- Oaklib: external ontology adapter; candidate ontology mapping only unless exact IDs, revision and grounding verified.
- 4D coordinates: `sveltekit-frontend/src/lib/server/atlas/topology/topology-tile-v1.ts` already defines semantic/AST/graph/temporal coordinate-function revisions, candidate ordinal map identity, and explicitly `CHALLENGER_ONLY` / `retrievalEligibility=false`. A topological neighbor is not a semantic relationship.
- Corpus: published/versioned `.okf` documents require admission/readback before indexing. EmbeddingGemma vectors must share identical model and recipe identities.
- NLP: FastAPI/LangExtract labels and entities are *proposals*. A verified mention does not establish a typed relation; task receipt, exact source span and participant roles are separate gates.

## TODO proof gates (in execution order)
- [ ] **ORF-REG-02** Review five AST kinds and their true producer mappings; verify distinct method-vs-function and enum-vs-alias semantics. Bind to authenticated reviewer identity, exact artifact digest and explicit decision.
- [ ] **ORF-REG-03** Generate proposed immutable `ObservationFeatureRegistryV1` with the existing builder, including evidence requirements and missing-value policies. Canonical ordinals/checksum must be deterministic. Proposal does not mean approval.
- [ ] **ORF-REG-04** Wire runtime loader to review receipt verification; reject missing/revoked approvals, checksum drift and unknown mappings. No new table or ANN index without evidence.
- [ ] **DOMAIN-01** Census domain classifier outputs and ontology group IDs separately. Review alias proposals; `ui` vs `frontend` and `ml` vs `machine-learning` MUST remain unmapped absent approved revision. Unknown domains abstain.
- [ ] **LSP-01** Build exact `sourceRevision + sourceRef + symbolVersionId` crosswalk for ts-morph/LSP and AST; normalize UTF-16 offsets to UTF-8 bytes using source content. Do not mint identity from symbol names.
- [ ] **NLP-01** Map extraction keyword/entity/concept categories to proposed ORF features only when the reviewed registry includes that feature, with evidence references and source revision; keep classifier taxonomy revision distinct.
- [ ] **OAK-01** Resolve Oaklib ontology classes with exact reviewed mappings. Preserve ontology revision, raw label, mapping rule/receipt and unknown state.
- [ ] **KAG-01** Admit *typed* relations with verified participant roles, evidence span and task receipt; `CONCEPT(Valkey)` is mention evidence, not a relation. Read back one authorized canonical ontology tuple before graph projection.
- [ ] **CORPUS-01** Validate sourceId/URL/contentHash envelope match for published documents, then use admitted chunks for retrieval. Do not index legacy crawls as canonical.
- [ ] **RETR-01** Prove QueryClassification → lexical/AST/semantic/graph lanes → one semantic vote → exact source promotion → ContextManifest. Trace index and evidence revision at every step.
- [ ] **TOPO-01** Freeze candidate ordinals and function revisions for 4D `(x,y,z,w)`; keep coordinate tile `CHALLENGER_ONLY`, no KAG edge inference from distance. Verify temporal coordinate interpretation and readback.
- [ ] **GRAPH-01** Use NetworkX CPU as typed N-ary graph oracle, then cuGraph GPU challenger after admitted graph snapshot and operator parity. Record graph revision, backend and results.
- [ ] **CACHE-01** Namespace Valkey/BitFrost/ACE hints by packet + source/representation/embedding/model/taxonomy revisions; no cache entry can create admission.
- [ ] **SYNTH-01** Run Ornith only on admitted ContextManifest content. Browser Gemma provides candidate hints, not facts.

## Read-only dry-run helper
`node --test scripts/atlas/lib/orf-domain-topology-review-v1.test.mjs`

Review helper `scripts/atlas/lib/orf-domain-topology-review-v1.mjs` operates on caller-supplied arrays; it neither contacts live services nor creates an ORF registry artifact. Its exact-string ontology comparison is diagnostic only.

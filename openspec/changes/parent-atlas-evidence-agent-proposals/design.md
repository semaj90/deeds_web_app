## Context

The system already has distinct owners for evidence upload/worker processing, NLP and LangExtract, document summarization, ontology resolution, retrieval, and agentic repair. Relevant existing boundaries include `sveltekit-frontend/src/lib/server/evidence/process-evidence-document-v1.ts`, `sveltekit-frontend/src/lib/server/analysis/ast-langextract-bridge.ts`, the existing evidence upload/queue flow, OAK resolution, and the offline DSPy/GEPA evaluation change. The new feature composes these boundaries; it must not create a second upload pipeline or imply those existing pieces have completed an end-to-end evidence-to-proposal proof.

Live DB evidence currently shows domain/taxonomy vocabularies but no live `feature_registry`, `atlas_feature_labels`, or canonical feature-concept rows, and no feature-vector rows in the inspected feature tables. Therefore classification, feature-level embeddings, ranking recommendations, and writes remain unverified/proposal-only. `semantic_768` remains the canonical dense representation; low-rank SVD factors are a separate challenger representation.

## Goals / Non-Goals

**Goals:**
- Define source-bound claims with Zod validation, exact source-span readback, and explicit uncertainty/conflict states.
- Provide importable, testable SvelteKit server helpers and one proposal-view model that reuse existing service owners.
- Present four workflow proposals with source provenance, model/algorithm revision, blockers, and explicit non-canonical status.
- Keep taxonomy and timeline semantics separate; preserve immutable event identity and allow branching.

**Non-Goals:**
- No new upload endpoint, worker pool, database schema, migration, canonical feature identity, or persistence path.
- No replacement of EmbeddingGemma `semantic_768`; no claim that Tang's quantum-inspired algorithm is a drop-in SVD implementation.
- No live OAK/GEPA/Prime Agent activation, production ranker change, autonomous repair, Qdrant/Neo4j/cache writes, or training run.
- No model chain-of-thought, hidden thoughts, KV cache, or tensors in proposal storage or UI.

## Decisions

### D1 — One versioned, exact-span claim envelope

Use a Zod `EvidenceClaimV1` contract. Each claim binds to a server-selected source reference, SHA-256 of exact source bytes, and source/workspace revisions when available. Offsets use one explicit UTF-8 byte-range convention; any character-offset result from LangExtract is converted and independently checked against the original bytes. Every populated `who`, `what`, `why`, or `how` value retains its own exact source span. Case association comes from the authenticated, authorized upload context; a model cannot invent or rebind a case ID. Taxonomy IDs remain nullable proposals with ontology/taxonomy revision provenance.

Alternative rejected: accept free-form extracted JSON and attach a file path or case ID after generation. That would permit unsupported claims and ambiguous/mutable identity.

### D2 — Small importable helpers, orchestration stays with current owners

Create pure helpers under `sveltekit-frontend/src/lib/server/evidence/synthesis/` for contract parsing, source/span verification, claim normalization, timeline projection, and proposal assembly. Keep network adapters separate. The existing evidence worker remains the caller; it fetches the stored original, verifies the expected digest, then invokes configured 8095 analysis and the configured summary provider. LangExtract and spaCy/AST produce grounded observations; Ornith via the environment-backed llama-server resolver may summarize only validated claims. No route or helper writes directly to a projection store.

Alternative rejected: place all behavior in the upload route or create a new general-purpose agent runtime. That duplicates ownership and couples user-facing requests to unbounded analysis.

### D3 — Four typed proposal lanes, no implied deployment

1. **Evidence synthesis:** grounded claims and cited summary from validated spans.
2. **Taxonomy and timeline:** OAK-backed classification candidates with vocabulary revision; immutable events with derived `previousEventId`/`nextEventId` display links. Timeline links are a projection, not a mutable linked-list authority; concurrent/branching events remain representable.
3. **Low-rank recommendations:** CPU-first randomized/truncated SVD challenger on a frozen, identity-qualified sparse matrix. Report held-out Precision@K, Recall@K, NDCG, latency, and memory versus the fixed dense/retrieval baseline. Never infer negative examples from missing rows. Tang-inspired sampling is a research/evaluation option, not a claimed implemented accelerator.
4. **Recursive verification/repair planning:** Investigator, Planner, independent Verifier, and Admission Controller roles. DSPy GEPA remains offline evaluation over separated datasets; Prime Agent/RLM is an optional bounded orchestration pattern, not an unrestricted executor. A proposal cannot self-certify success.

Every lane returns `PROPOSED`, `UNVERIFIED`, `CONFLICTED`, or `BLOCKED`, retains source/claim references and component revisions, and has no write capability.

### D4 — SvelteKit is a presentation and proposal boundary

Expose a server-only proposal assembler and a SvelteKit component that renders four cards. Cards show status, source citations, case binding, revisions, timestamp, and blockers; they do not render hidden reasoning or offer an action that implies admission. UI progress represents the current audit operation only, not corpus or database reconciliation.

Alternative rejected: expose raw model output or raw retrieval results to a browser/LLM. The UI consumes validated proposal view models only.

### D5 — Canonical writes require separate owner authorization

The feature only reads existing source/job/evidence records and may call configured analysis services. Any future claim/label/vector persistence must be proposed as a separate migration/write change after live owner reconciliation, identity/cardinality proof, and explicit authorization. PostgreSQL remains canonical; Qdrant/Neo4j are downstream projections. Unavailable services never become empty-success results.

## Risks / Trade-offs

- [LangExtract offsets may be character-based while AST offsets are byte-based] → Normalize at a dedicated adapter and verify the extracted bytes exactly, including Unicode fixtures.
- [Case metadata may be incorrectly assigned by model output] → Bind case ID only from authenticated server context and enforce existing case ACLs before processing.
- [OAK vocabularies or feature labels may be absent/drifted] → Return `UNVERIFIED`/`BLOCKED`; do not invent canonical taxonomy IDs or write labels.
- [SVD recommendations may leak identity or overfit sparse data] → Require frozen revision-qualified input, held-out evaluation, and challenger-only display.
- [GEPA/RLM could be mistaken for autonomous repair] → Keep prompt optimization offline and remove mutation credentials/tools from proposal workflows.
- [Existing sidecars or providers are unavailable] → Use explicit `BLOCKED` service states; no mock/empty result is presented as successful live processing.

## Migration Plan

No database migration or data backfill is part of this change. Implement in stages: owner/caller audit; pure Zod contracts and byte-span fixtures; server helpers/adapters; proposal-card UI; isolated tests. Runtime wiring remains opt-in until a separate authorization and evidence review. Rollback consists of disabling/removing the new proposal UI/adapter; no canonical data rollback is required because this feature persists no proposals.

## Open Questions

- Which existing authenticated evidence page should host the four proposal cards: the evidence detail view, the evidence board, or a dedicated SvelteKit route?
- Which current 8095 endpoint provides the needed extracted spans and AST facts for each file/media type, and what exact offsets/revision fields does it return?
- Which environment-backed model resolver identifies the active Ornith synthesis model for this workflow, and how is its revision recorded?
- Which approved, revisioned OAK taxonomy source should be consulted while live feature-label tables are absent?
- Is there an existing immutable event authority suitable for the timeline, or should this remain an in-memory view model until a separate owner decision?
- What reviewed gold set and resource budget will qualify the SVD challenger and any GEPA evaluation?

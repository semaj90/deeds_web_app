# Go Retrieval research HTTP integration

## Status

Created and statically wired; Go package tests passed. Live container deployment and SvelteKit end-to-end parity remain unproven. Research ingestion is now fail-closed until the empty `chunks_web_search` collection satisfies its payload-index contract.

## Change

- Added `POST /search/research` to `services/go-retrieval-service/main.go`.
- The endpoint delegates to the existing `GetResearchContext` implementation and reads `chunks_web_search` through the Go service owner.
- Added `source_filter`, `score_threshold`, and research endpoint preference to the shared Go client.
- Updated `/api/research/search` to use Go Retrieval when the existing Go feature flags are enabled, with the prior direct-Qdrant implementation retained as fallback.

## Validation

- `go test ./...` — passed for the Go Retrieval module.
- `git diff --check` — changed-file check was clean; unrelated pre-existing generated build output contains whitespace warnings.
- integration-file TypeScript filter — passed; no diagnostics in the changed Go client or research route.
- full retrieval TypeScript project — still has unrelated pre-existing diagnostics in other retrieval files/tests; no full-project pass claimed.
- `svelte-check` — started but stopped before completion; no pass claimed.
- Focused Vitest run — did not complete; no pass claimed.

## Authority boundary

Go Retrieval remains a read-only retrieval executor. PostgreSQL remains canonical; Qdrant remains a projection; SvelteKit remains the authenticated route boundary. No database, Qdrant, cache, graph, or relationship writes were added.

## Deployment note

The running Go container must be rebuilt from the cached image and recreated for `/search/research` to become live. No volume removal or `docker compose down` is required.

## Live verification

- The service was recreated with `docker compose -f docker/docker-compose.gpu.yml up -d --no-deps legal-ai-go-retrieval`.
- `/health` reports `READY_FULL`.
- `POST /search/research` now responds through the new Go handler with lane `go-retrieval-research` and collection `chunks_web_search`.
- The endpoint returned zero results because the live Qdrant collection currently has `points_count = 0`. This is a corpus-ingestion gap, not an HTTP or embedding-handler failure.
- No ingestion or projection write was performed.

## Ingestion safety control

`/api/research/ingest` now accepts `dryRun: true`. It performs source harvesting, deterministic sub-chunk planning, SHA-256 content checksums, UUID point-ID planning, and read-only collection-contract inspection, then exits before embedding or Qdrant upsert. The default remains the existing write-capable behavior and still requires authentication.

Bounded live dry-run (`github_issues`, query `PostgreSQL pgvector`, limit `3`) returned `fetched=3`, `estimatedChunks=3`, `ingested=0`, `dryRun=true`, and `wouldWrite=true`. No Qdrant write occurred.

The live empty `chunks_web_search` collection initially had the correct named `content` vector (`768`, Cosine) but no payload indexes. Under explicit authorization, the five bounded indexes were created: `source`, `subreddit`, `repo`, and `language` as keyword indexes, plus `fetched_at` as a datetime index. The collection now reports the required contract shape; it remains empty at `0` points. No collection recreation or point ingestion occurred.

The research writer now uses deterministic UUID point IDs derived from source, parent external ID, URL, segment index, content checksum, and ingestion schema revision. Each point also records its content checksum, embedding model/dimension/revision, ingestion schema revision, and ingester revision. Tagging remains optional and asynchronous; the first canary should keep `addTags=false`.

The first authorized canary initially exposed a Qdrant request-shape error: the internal vector helper emitted `{name, vector}`, which Qdrant REST rejected with HTTP 400 for all three input chunks. The research writer now uses the REST named-vector map `{content: vector}`. The same authorized canary was then rerun successfully: `fetched=3`, `ingested=11`, `skipped=0`, `errors=0`, `addTags=false`.

Independent readback retrieved all 11 stored IDs by ID and verified 11/11 points with 768-value `content` vectors, `github_issue` source, required chunk/provenance payloads, checksums, and revision fields. Go `/search/research` returned the `go-retrieval-research` lane over `chunks_web_search`; the bounded source filter returned only `github_issue` results.

The read-only ACE bridge replayed all 11 external points as `AtlasExternalResearchEvidenceV1` and ACE `SUMMARY` cards twice. Both selections produced checksum `sha256:35262d3074830ab6592bb5c157540a585a85b209b3ce234dd6b93acce0758ad1`; `ACE_EXTERNAL_REPLAY_PROVEN`. No local `CandidateOrdinal`, `sourceRevision`, `sourceRef`, or other Atlas identity was assigned. ContextManifest external replay is now proven by `scripts/atlas/prove-research-context-manifest-v1.mts`: 11/11 cards selected, manifest ID `context:d09873dfc53b2657bde10ae7`, replay checksum `sha256:196fdc16a338a1d48c4d9bd7c0199bdb17d5ff1f66b7336bf6f00dbc7cbf1888`, and `CONTEXT_MANIFEST_EXTERNAL_REPLAY_PROVEN`. No persistence or cache writes occurred.

PromptPlan replay is now proven by `scripts/atlas/prove-research-prompt-plan-v1.mts`: the existing `PromptPlanV1` owner produced one query segment plus 11 evidence segments, with identical checksum `13dc96a9778ddab8c2073300e9c6283ad3efa1c854095e4f3e617a131af3c1f9` across two builds. The first implementation attempt exposed and corrected the existing contract distinction that PromptPlan checksums are bare 64-character SHA-256 values, not `sha256:`-prefixed receipt values. No persistence or cache writes occurred.

`RESEARCH-ID-01` is proven by `scripts/atlas/audit-research-point-identity-v1.mjs`: all 11 live canary points recompute to the stored IDs and match the UUID-shaped format. The current algorithm is explicitly recorded as `sha256-derived-uuid-shaped-v1`; it is deterministic and projection-only, but is not formally UUIDv5. A future migration to RFC UUIDv5/UUIDv8 would require a versioned point-ID change and explicit cleanup/reconciliation, so it is not performed implicitly against the populated canary.

`EXT-EVIDENCE-01` is proven by `scripts/atlas/prove-research-evidence-boundary-v1.mts`: Go `/search/research` supplied the ranked results, Qdrant was used only for exact payload enrichment, and the evidence set was capped at 2 segments per parent and 6 total. The live result was 5 records across 3 parents, with replay checksum `sha256:f0c6e5d87193d27ac277ec46ec227dfddc20f16df633c6955848aadc76b84e19`. External records retain null local identity and all durable writes remained false. `ACE_EXTERNAL_PARENT_DIVERSITY_REPLAY` is the next gate.
The parent-diversity rule is now reusable as `selectExternalResearchEvidenceForAce()` in `external-research-evidence-set-v1.ts`; it deduplicates point IDs and content checksums before applying the parent and total-card limits.

The complete diverse replay is proven by `scripts/atlas/prove-research-ace-diversity-context-v1.mts`: 5 evidence records → 5 ACE cards → 5 ContextManifest candidates → 6 PromptPlan segments. ACE checksum `sha256:44dfa6e49069e546941970e30d30845ae7246689349691de96e75146bc504cdd`, ContextManifest ID `context:314e96d86a8420e1d9c77169`, and PromptPlan checksum `e2dc83ce912e139fb0e05dbd8016f1de09d39d3d0a413d36fdf2594a03e6c592` all replayed identically. No durable writes occurred.

`ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY` is proven by `scripts/atlas/prove-research-ornith-synthesis-v1.mts`: two structured responses from `:8090` matched checksum `sha256:1ca9ea8aeb744b436f085b9017f50f1778a070eb2cdaee428b2d8f6fa36695dd`, cited 2 allowed external evidence IDs, used no tools, and performed no durable writes. The response is non-authoritative and remains review-only; the next gate is `EXTERNAL_SYNTHESIS_REVIEW_OR_LDR_FACADE`.

`AtlasExternalResearchEvidenceV1` is now defined under `sveltekit-frontend/src/lib/server/atlas/research/`. It is schema-validated, checksummed, and explicitly non-authoritative. It intentionally remains separate from local lineage-required `FanoutEvidenceBundleV1` until an external-to-ACE adapter is added.

`externalResearchEvidenceToAceCardV1` now adapts that envelope into an ACE-selectable `SUMMARY` card while keeping `candidateOrdinal`, `sourceRevision`, and `sourceRef` null. The adapter is typed and has no TypeScript diagnostics; it does not write or assign local identity.

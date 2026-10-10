# Valkey → canonical candidate → grounded tuple → ContextManifest: implementation ledger addendum

Status: **fixture diagnostic; not live evidence**. This addendum should be reconciled into the local owning OpenSpec tasks.md only after inspecting its newest revision. Do not overwrite that ledger from an older remote branch.

## Existing owners
- Cache hint: `sveltekit-frontend/src/lib/server/atlas/retrieval/cached-packet-candidate-resolution-v1.ts` (newer local version may not yet exist on remote). Only exact source-ref matches qualify for candidate crosswalk.
- Candidate map: existing `CandidateOrdinalMapV1` canonical owner; use frozen snapshot and workspace/representation revisions.
- Ontology tuple: `sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts`, existing persistence authority and readback. `feature_ontology_tuples` and cache centroid members are not admitted facts.
- Context manifest: `sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.ts`, `buildContextManifestV2` and canonical `canonicalSha256V1`.
- Valkey tuple cache: `sveltekit-frontend/src/lib/server/atlas/ontology-linked-tuple-cache.ts`. Its records must not be treated as admission authority.
- Proof: `scripts/atlas/lib/proof-chain-verifier-v1.mts` in newer local checkout.

## Proposed tasks / TODO
- [ ] **VAL-ACE-01** Trace production SvelteKit request caller → SearchRuntime → exact cache-hint crosswalk. Preserve ordinal map checksum and ranking.
- [ ] **VAL-ACE-02** Wire authorized source-byte provider with exact source revision and UTF-8 span receipt; preserve VERIFIED_NOT_ADMITTED.
- [ ] **VAL-ACE-03** Resolve typed RELATION evidence and participant roles via grounded NLP or AST/LSP; separate CONCEPT mentions and structural proximity.
- [ ] **VAL-ACE-04** Read one admitted tuple from the existing canonical owner. Require matching packet key, source ref, source revision, ontology revision, evidence refs and independent admission receipt. Missing tuple is BLOCKED, not a request to fabricate it.
- [ ] **VAL-ACE-05** Build selected evidence through existing ContextManifestV1/V2 and canonical hash; read back exact tuple/source bindings. Missing feature/ontology revisions stay null/unavailable, never copied from producer revision.
- [ ] **VAL-ACE-06** Bind Ornith prompt/model artifact and execution receipt to manifest checksum; source-only diagnostic summary remains non-admitted.
- [ ] **VAL-PERF-01** Benchmark existing pgvector/Qdrant/cU​VS exact similarity and Valkey centroid routing on one frozen embedding space; do not create a cosine-linked ontology SQL table.
- [ ] **VAL-PERF-02** Validate cache namespace by embedding space, workspace, cluster snapshot, and taxonomy revision; cache miss or stale hint fails back to canonical retrieval.
- [ ] **VAL-PROOF-01** Run focused negative tests, existing proof-chain and current-task receipt readback. Finish ledger edits before refreshing whole-file-revision-bound receipts.

**Current blocker:** no admitted ontology tuple for the candidate and no independently read-backed ContextManifest. Existing unresolved feature ontology routing rows do not satisfy admission.

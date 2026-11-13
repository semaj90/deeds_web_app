# Atlas SOM Radix Order Bridge V1

Date: 2026-11-12

## Status

| Gate | Status | Evidence |
| --- | --- | --- |
| CREATED | Yes | ComputePool worker task, checksummed cluster projection persistence contract, and candidate-to-worker bridge exist. |
| WIRED | Partial | ComputePool dispatches to the worker, which calls the existing N-API radix sorter when its addon is loaded. The new ORF-to-worker bridge is not called by a live retrieval route. |
| PROVEN | Partial | Focused contract, materializer, bridge and worker tests passed. A prior focused native-worker probe loaded the Windows addon and confirmed output parity. No database round trip or retrieval-service execution was performed. |
| DONE | No | The sidecar migration is planned and unapplied; persisted assignments and production retrieval wiring are not proven. |

## Implemented

- Added an explicit checksum verifier and exact packet, source receipt, and `semantic_768` representation binding for `ClusterFeatureProjectionV1`.
- Made the projection digest independent of JSON object key order so it survives PostgreSQL `jsonb` serialization.
- Extended the ORF Drizzle model and materializer to retain the complete cluster projection beside its existing KMeans/SOM scalar hints. A mismatched projection is rejected before the SQL call.
- Added a fail-closed bridge from an exact `CandidateOrdinalMapV1` and matching ORF rows to the bounded `ComputePool` SOM radix proposal operation. The bridge verifies feature, representation, producer, source, and workspace revisions, projection digest, scalar consistency, and complete row cardinality.
- Independently checks the worker's schema, proposal-only authority, permutation, ordinal binding, and `(KMeans cluster, SOM cell, CandidateOrdinal)` order before creating a proposal receipt.
- Added a nullable JSONB column migration as `planned_sidecar`; it has not been applied or journaled.

## Validation

Command, from `sveltekit-frontend`:

```powershell
npx vitest run src/lib/server/atlas/contracts/cluster-feature-projection-v1.spec.ts src/lib/server/atlas/materializers/observation-feature-materializer.spec.ts src/lib/server/atlas/retrieval/som-radix-order-bridge-v1.spec.ts src/lib/server/workers/compute-pool.spec.ts -t 'ClusterFeatureProjectionV1|workspace lineage|SOM radix|SOM radix order bridge'
```

Result: exit code 0; 4 test files passed; 18 tests passed, 15 skipped by the name filter. Coverage includes reordered JSON object keys, digest tampering, packet mismatch before SQL, missing/stale cluster rows, and malformed worker permutations/order.

Command, from `sveltekit-frontend`:

```powershell
npm run check:fast
```

Result: exit code 0; 0 errors and 1 warning in 1 file. The warning detail was not emitted in the captured output. The checker initialized the configured OpenTelemetry SDK; no application services or databases were deliberately started or changed.

Command, from repository root:

```powershell
git diff --check -- sveltekit-frontend/src/lib/server/atlas/contracts/cluster-feature-projection-v1.ts sveltekit-frontend/src/lib/server/atlas/contracts/cluster-feature-projection-v1.spec.ts sveltekit-frontend/src/lib/server/atlas/materializers/observation-feature-materializer.ts sveltekit-frontend/src/lib/server/atlas/materializers/observation-feature-materializer.spec.ts sveltekit-frontend/src/lib/server/db/schema/atlas-observation-feature-rows.ts sveltekit-frontend/src/lib/server/atlas/retrieval/som-radix-order-bridge-v1.ts sveltekit-frontend/src/lib/server/atlas/retrieval/som-radix-order-bridge-v1.spec.ts sveltekit-frontend/drizzle/manual/20261112_orf_cluster_projection_provenance_v1.sql sveltekit-frontend/drizzle/sidecar-migrations.json
```

Result: exit code 0; Git emitted existing LF-to-CRLF normalization warnings for two files.

The sidecar manifest also parsed successfully with Node. No live PostgreSQL migration, data write, Qdrant/Valkey operation, task status update, or OpenSpec checkbox change was performed.

## Remaining Work

1. Review and approve the sidecar schema change, then rehearse it only in a disposable PostgreSQL 18 database. Keep live apply separate.
2. Add a read-only ORF query adapter that loads the exact candidates' cluster projection rows after the column is available.
3. Call the bridge from a task-scoped retrieval path only after source/task authorization and candidate-map admission.
4. Prove one bounded real retrieval batch from PostgreSQL row readback through the Windows N-API worker, then compare output with the scalar reference independently.
5. Measure candidate counts, wall time, memory, and fallback frequency. Keep sorting a locality proposal; it must not add a relevance vote or authorize actions.

## Fresh NES LUT / FSM Wiring Audit

Audit revision: `adc7460d653c41c0aa0bb49d8802d68307ed0fd0` (HEAD; the relevant C++ and Svelte worker files are modified in the shared worktree).

TRACE/Atlas lookups were read-only but unresolved: `find_source_refs` found no packets for the native owners and conflicting packet identities for `compute-pool.ts`; feature and tool-chain lookups returned no hits. These are discovery misses, not evidence that the source files are absent.

| Stage | Current evidence | Missing proof / first blocker |
| --- | --- | --- |
| NES v1 palette | `scripts/atlas/data/nes-domain-palette-v1.json`, revision `nes-domain-palette-v1`, source ledger checksum `sha256:e1b8ccdc6661a3faed3316cf276f01dd16a1edf80a9aba2d465def40461b9b0f`; NLUT-06 is recorded complete. | No fresh Node/Python/SQL-byte parity or PostgreSQL registry readback in this audit. NLUT-07 AVX2 remains `[~]` / partial. |
| SOM radix | `radix_sort.hpp` defines an 8-pass uint64 LSD sort and 65,536-row cap. The modified N-API export validates typed arrays, lengths, SOM range and duplicate ordinals, copies values into native-owned vector entries, then returns a new JS-owned index array. | The C++ source/test files are currently dirty; no fresh build or native smoke run was made against these current bytes. No server route calls the addon directly. |
| Worker path | `ComputePool.runSomRadixOrderProposal` dispatches to `compute-worker.mjs`; that worker attempts the native export and otherwise uses JS sort. | No current SvelteKit request/caller is wired to the new ORF bridge. An earlier explicit-path Windows addon test does not prove the current dirty addon was rebuilt or the default loader path selects it. |
| ORF → radix bridge | `runSomRadixOrderBridgeV1` exists and checks exact candidate/ORF bindings and the worker permutation. Its only source caller is its fixture test. | It receives rows from its caller; no production read adapter or authorized retrieval caller exists. The JSONB column migration is still `planned_sidecar`. |
| Palette → FSM | NES v1 has `ui` at LUT byte `0x02`; its NES color byte is `0x2A`. | Do not reuse `0x02` as a universal domain ID: the separate OpenSpec task taxonomy assigns code `2` to `WHAT_STATUTE_CORPUS` and maps it to palette domain `retrieval`. Exact translation plus palette revision/checksum admission must be explicit. |
| Packed FSM / CSR / commit | Existing Svelte FSM, detector, and CSR cursor are separate owners. | `atlas_fsm_lut_v1.hpp`, `executePackedFsmV1`, the authorized transition table, trusted server-derived action mask, admitted-CSR-to-candidate flow, generation/lease publication, SvelteKit authorization caller, and PostgreSQL result receipt/readback were not found. No action execution is connected to radix ordering. |

The sample `alignas(64)` candidate record is not a prerequisite for the existing sorter: this implementation copies typed-array elements into native-owned `std::vector` records and uses scalar key sorting. If a future shared-memory or persisted binary format is added, define and test its explicit byte serialization separately. The current N-API typed-array interface is numeric, not a stable on-disk endianness contract.

No tests, builds, live database queries, services, GPU work, or ledger checkbox edits were performed for this fresh audit. The C++ radix header, addon, and smoke test have concurrent uncommitted edits and were left untouched.

### Ordered next gates

1. Let the owner of the current native edits finish; then build the exact Windows addon from the reviewed source and run the native smoke test plus worker-level parity with explicit artifact hash and default-loader readback.
2. Reconcile the NES v1 artifact checksum and every translation boundary, including the distinct `taskLutByte`, palette `lutByte`, and NES color byte, against a disposable PostgreSQL fixture. Keep the live DB read-only.
3. Define a small proposal-only FSM contract against the actual action/state registry owner. Include blocked transitions, revision and bounds checks, server-derived permission mask, and deterministic score/key semantics; do not implement an independent palette authority.
4. Add bounded CSR admission over exact CandidateOrdinal values; specify duplicates, edge-type allowlist, cycle/visited limits and deterministic order. Compare native radix to an independent scalar oracle.
5. Wire a server-only authorized caller that loads canonical revisions, invokes the native proposal, rechecks authority/revisions, and persists only through the existing receipt owner. Keep human approval before action execution and independently read back the receipt.
6. Measure comparison-sort versus radix thresholds at the real candidate sizes; do not assume 8-pass radix wins for small batches.

## Evidence, Capability Moves, Bitsets, LangGraph, and Texture Projection

The “entity with moves” analogy should map to existing owners rather than a new Pokemon-style registry. Moves are not permanent properties of evidence: they are registered action definitions, referenced by a proposal, and checked against actor/case/workspace policy at execution time.

| Concept | Use this owner | Meaning and boundary |
| --- | --- | --- |
| Evidence entity | Existing evidence/evidence-registry identity and packet/source lineage | Preserve the existing evidence ID and `packetKey`, `sourceRef`, `sourceRevision`, `workspaceRevision`, and case scope. A UUID namespace defines deterministic ID derivation only where an existing identity contract calls for it; it is not a second evidence registry. |
| Feature/concept | Existing feature resolution/feature registry | A UUID or registry key points to a reviewed feature identity. Free-text `featureLabel`, KMeans IDs, SOM cells, and manifold coordinates are not feature identity. |
| “Move” / action | `AgenticActionV1` and `agentic-action-registry-v1.ts` | Reuse versioned `actionId`/`actionRevision`, schema refs, prerequisites, effects, mutability, approval requirement, and validator. Its current seed is code-defined; the owner census for a durable/Postgres registry remains open. |
| Move eligibility | `domain-classification-move-eligibility-v1.ts` | A classifier/policy match may propose eligibility. The decision schema explicitly keeps `canonicalAuthority:false` and `authorizationGranted:false`; the trusted server authorization owner must decide separately. |
| Candidate membership | `CandidateOrdinalMapV1` plus `candidate-ordinal-bitset-selection-v1.ts` | A bit position addresses only an ordinal in one checksummed candidate snapshot. Never derive candidate identity from a bit position alone. |
| Byte-slice transport | `BitsetSliceDescriptorV1` | Reuse format, relative path/field, offset/length/alignment, `LSB0`, `LE`, checksum, workspace/source/candidate/representation revisions, and ordinal-map checksum. It is a derived descriptor with `canonicalAuthority:false` and `writesPerformed:false`. Resolve paths only beneath an admitted read-only artifact root. |

### Proposed envelope for one evidence-to-action proposal

Keep the JSON/control-plane envelope and binary/data-plane payload separate. The names below describe the fields that must be joined from existing owners; they are not a new canonical schema or permission grant.

```json
{
  "schema": "atlas.evidence-action-proposal.v1",
  "evidenceRef": {
    "evidenceId": "<existing evidence id>",
    "packetKey": "<existing packet key>",
    "sourceRef": "<qualified source ref>",
    "sourceRevision": "sha256:<64 hex>",
    "workspaceRevision": "sha256:<64 hex>",
    "caseId": "<authorized case or null>"
  },
  "featureBinding": {
    "featureKey": "<explicit registry key or null>",
    "featureRevision": "<qualified revision or null>",
    "status": "PROPOSED"
  },
  "moveRef": {
    "actionId": "<AgenticActionV1 actionId>",
    "actionRevision": "<registry revision>",
    "eligibilityDecisionChecksum": "sha256:<64 hex>"
  },
  "candidateSelection": {
    "candidateSnapshotRevision": "sha256:<64 hex>",
    "ordinalMapChecksum": "sha256:<64 hex>",
    "bitsetDescriptor": "<atlas.bitset-slice-descriptor.v1 or bytea receipt>"
  },
  "topologyProjection": {
    "representationRevision": "<qualified revision>",
    "kmeansAssignmentRevision": "<qualified revision>",
    "somAssignmentRevision": "<qualified revision>",
    "coordinatesKind": "PROJECTION_ONLY"
  },
  "authorization": {
    "decisionRef": "<trusted server authorization receipt>",
    "authorizationGranted": false
  },
  "canonicalAuthority": false,
  "writesPerformed": false
}
```

`authorizationGranted` stays false in a proposal. At execution time, a server-only adapter must resolve actor, case/workspace grants, current action registry revision, and action-specific approval from their authoritative owners. Do not expose an `authorizedActionMask` that the browser or LangGraph can set. If an action mask is used inside a native batch, the server constructs it for one pinned action-registry revision, passes it in, and revalidates before effects.

### DAG prefill and synthesis flow

1. Authenticate and authorize the case/evidence on the SvelteKit server; load canonical evidence and source revisions.
2. Build an exact `CandidateOrdinalMapV1` and revision-bound feature snapshot. Use the existing selection bitset only to reduce candidate ordinals.
3. Assemble a bounded, citation-bearing context packet using the current ACE/ContextManifest owners. Send only admitted evidence references and the selected bounded content to LangGraph; do not send raw retrieval hits, binary blobs, tensors, or KV state.
4. LangGraph remains optional orchestration. It may order retrieve/expand/classify/synthesize/validate steps and return proposals; it does not own packet identity, canonical feature identity, authorization, or durable writes.
5. Synthesis returns a proposal with citations back to exact evidence IDs/source spans and its model/prompt/producer revisions. A human/server policy gate decides whether an action can proceed.
6. Persist through the existing Postgres receipt/outbox owner for the selected operation (the exact action-specific receipt owner still needs to be named), then independently read back the receipt before any cache or texture projection is published. Valkey, Qdrant, graph, and texture outputs remain rebuildable.

There is a real API caller: `src/routes/api/synthesis/generate/+server.ts` invokes `langGraphSynthesize` and `langGraphSynthesizeStream`. The route authenticates the user and validates `caseId` as a UUID, but the inspected route does not call a case-authorization owner before passing that `caseId` to LangGraph. Treat case-scoped retrieval through this route as a security gap until the owner check and zero-downstream denial behavior are verified. The current calls pass query/case/model controls, not `packet_identity`, `workspace_revision`, or `include_observations`; therefore this is synthesis transport wiring, not proof of the proposed evidence/bitset/action lineage. LangGraph remains optional orchestration, and graph nodes must not write Postgres, Qdrant, Redis, Neo4j, DuckDB, or SeaweedFS.

### Texture byte encoding and topology coordinates

The existing native `LodTextureBlock128B` is a 128-byte projection: 16-byte sign-bitset, 32-byte packed 2-bit data, 64-byte packed 4-bit data, and a 16-byte metadata tail containing candidate ordinal, SOM BMU, KMeans cluster ID, minimum, and scale. Its serializer writes the integer/float metadata explicitly little-endian. The Node-API assembler returns bytes, but there is no proof here of an authorized evidence-to-texture streaming route, browser consumption, GPU upload, or readback.

Required binding around each streamed block:

- an external immutable descriptor bound to evidence/packet identity, source/workspace revisions, candidate snapshot, ordinal map, representation/model revision, quantization recipe, byte length, and SHA-256;
- LSB0/LE declarations for each packed lane, including TurboVec's own bit-plane order. TurboVec MSB-first codes cannot be reinterpreted as the LSB0 evidence-selection bitset; conversion must be explicit and tested;
- block offset/range and alignment checks, bounded range reads, and a CPU decoder/reference parity test before browser/GPU consumption;
- a new versioned layout if fields change. Do not silently repurpose the current 16-byte tail or claim that its alignment supplies evidence lineage.

The current `ace-packet-assembly.mjs` calls `(x=som_col, y=som_row, z=kmeans_cluster_id-or-0, t=updated_at/created_at-or-now)` a `manifold_4d`. These values mix a 20x20 lattice, a categorical cluster index, and wall-clock time; missing cluster becomes zero and missing time becomes the current time. This is neither a stable 4D embedding nor a valid coordinate basis for distance/ranking. Keep `{somRow, somCol}` and `{kmeansClusterId, assignmentRevision}` as separate projection metadata. If an actual four-dimensional manifold is required, produce four model outputs from one pinned model/normalization revision with source checksums and held-out stability/quality evaluation; never use it for identity, authorization, or candidate ordinal.

### Immediate acceptance matrix for this extension

| Check | Must prove |
| --- | --- |
| Evidence identity | Same evidence ID, packet key, source span/revision, workspace, and authorized case at every handoff. |
| Move registry | `actionId` resolves uniquely at the pinned `actionRevision`; prerequisite/effect/validator semantics are stable and human approval requirements are honored. |
| Feature binding | Feature key is an explicit reviewed registry binding; labels and similarity do not create the binding. |
| Bitset | Byte hash, bit count, padding, LSB0/LE, offset/alignment, snapshot and ordinal-map checksum match; bit positions map to the exact same candidates. |
| LangGraph | One bounded run receives the admitted context packet and returns source-cited proposals; graph execution alone does not prove authorization or writes. |
| KMeans/SOM | Assignments bind to the same semantic representation, source/workspace/candidate snapshot and producer/model revisions; no default/fabricated coordinates. |
| Texture | CPU encoder/decoder parity and byte checksum match the declared v2-or-current descriptor; range/offset tests cover boundary blocks. |
| End-to-end | Authorized request → admitted evidence → bitset selection → context/DAG → cited synthesis proposal → human/server approval → receipt readback → optional texture projection, with per-store side-effect counts. |

Current classification: **CREATED** for individual descriptor, action registry, bitset, LangGraph, topology and tile-layout owners; **WIRED** for the radix worker path and the generic SvelteKit-to-LangGraph synthesis API, but not for a verified task/evidence/bitset/action-to-texture chain; **PROVEN** only by scoped fixtures/previous receipts; **DONE** no for this combined pipeline. The case authorization gap at the synthesis route should be addressed before wiring case-scoped evidence into it.

## Files

- `sveltekit-frontend/src/lib/server/workers/compute-pool.ts`
- `sveltekit-frontend/src/lib/workers/compute-worker.mjs`
- `sveltekit-frontend/src/lib/server/workers/compute-pool.spec.ts`
- `sveltekit-frontend/src/lib/server/atlas/contracts/cluster-feature-projection-v1.ts`
- `sveltekit-frontend/src/lib/server/atlas/contracts/cluster-feature-projection-v1.spec.ts`
- `sveltekit-frontend/src/lib/server/db/schema/atlas-observation-feature-rows.ts`
- `sveltekit-frontend/src/lib/server/atlas/materializers/observation-feature-materializer.ts`
- `sveltekit-frontend/src/lib/server/atlas/materializers/observation-feature-materializer.spec.ts`
- `sveltekit-frontend/src/lib/server/atlas/retrieval/som-radix-order-bridge-v1.ts`
- `sveltekit-frontend/src/lib/server/atlas/retrieval/som-radix-order-bridge-v1.spec.ts`
- `sveltekit-frontend/drizzle/manual/20261112_orf_cluster_projection_provenance_v1.sql`
- `sveltekit-frontend/drizzle/sidecar-migrations.json`

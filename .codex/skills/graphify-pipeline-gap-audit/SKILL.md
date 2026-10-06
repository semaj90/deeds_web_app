---
name: graphify-pipeline-gap-audit
description: Audit Parent Atlas pipelines with Graphify-assisted owner and caller discovery. Use when asked what is implemented versus missing, to trace a vertical derivation path, or to update the owning OpenSpec/workstation status. Keep Graphify read-only and fail closed on identity, revision, evidence, and write boundaries.
---

# Graphify Pipeline Gap Audit

Use this skill to compare a requested Parent Atlas pipeline with the repository's actual owners, callers, tests, runtime receipts, and revision/evidence bindings. Graphify helps discover code dependencies; it is never canonical identity, source authority, lineage proof, or permission to project.

## Authority and safety

1. Owning OpenSpec `tasks.md` is the claim ledger. The workstation TODO is a dependency projection and must defer to OpenSpec.
2. Current, revision-bound runtime receipts and independent readback are stronger than code presence, tests, generated workboards, or stale Graphify snapshots.
3. PostgreSQL owns canonical Atlas identity and revision state. Graphify, Neo4j, Qdrant, Valkey/BitFrost, GPU ordinals, and local caches are derived or execution projections.
4. Default mode is strictly read-only. Do not run `graphify:daily`, refresh Graphify/Neo4j, apply migrations, write incidence, update cache state, backfill representations, start services, or crawl sources unless a separate request explicitly authorizes that action.
5. Before running any named script/tool, inspect its implementation and prove its side effects. Do not infer safety from a command name or a `dry` suffix.
6. Do not edit a concurrently changed ledger in place blindly. Make a narrow, additive status update only when requested, preserving unrelated changes. Never mark a checkbox complete merely because code or a receipt exists.

## Audit procedure

### 1. Freeze the requested vertical slice

Write the intended stages in order and identify one bounded, already-qualified seed. For each seed capture its authoritative packet/chunk identity, `sourceRef`, `sourceRevision`, `workspaceRevision`, and exact evidence references. Do not select a bulk cohort when the requested proof is a single-item vertical slice.

### 2. Discover owners and callers

- Search source and contracts (`rg`, tests, package manifests, service routes) for each stage's input/output contracts and producer/consumer functions.
- Use an existing Graphify code/dependency snapshot only to nominate owner, caller, and dependency paths.
- Record that snapshot's age, workspace/source revision, and producer/run identity. If it is stale, mismatched, or unbound, label its findings `DIAGNOSTIC_ONLY` and corroborate with current source/call-site inspection.
- Confirm actual caller edges. Imports, symbols, text matches, README claims, and one-argument AST probes do not prove runtime wiring.
- Check for an existing equivalent contract/registry/receipt before proposing a new one.

### 3. Classify every claim

Use distinct states; never collapse them into a single “done” field:

| State | Meaning |
|---|---|
| `OWNER_PRESENT` | A source/schema owner exists; no wiring implied. |
| `CONTRACT_TESTED` | Focused tests validate a contract or helper. |
| `CALLER_PROVEN` | A real caller passes the expected artifact/context. |
| `COMPONENT_LIVE` | A bounded live call returned output. |
| `VERTICAL_PARTIAL` | Some stages ran, but at least one handoff, identity field, or required stage is absent. |
| `LIVE_PROVEN` | One frozen seed traversed the intended live stages with exact identity, revisions, evidence, checksums, and readback. |
| `PROOF_USABLE` | All admission requirements are satisfied; this is not implied by `LIVE_PROVEN`. |
| `BLOCKED` | A specific prerequisite is absent or contradicted. Name the first failed boundary. |
| `NOT_VERIFIED` | The audit did not obtain enough evidence to classify the claim. |

### 4. Check identity and lineage at every boundary

For each stage record:

- input/output artifact IDs, revisions, canonical checksums, producer ID/revision;
- `packetKey`, `sourceRef`, `sourceRevision`, and `workspaceRevision`;
- `treeNodeId`/source span only when resolved from authoritative evidence;
- `representationRevision`, `featureRevision`, `graphRevision` where relevant;
- parser, extractor, POS tagger, classifier, router, and retrieval policy revisions;
- evidence refs and side-effect counts.

Require exact equality for the identity dimensions that apply to the same seed. Missing is `MISSING_LINEAGE`, not equality. Different kinds of revisions are not interchangeable. If `representationRevision` has no authoritative producer, preserve `null`, report `REPRESENTATION_REVISION_UNQUALIFIED`, and continue only diagnostic/proposal work. Never use a legacy label, current HEAD, dimension, model name, path, or timestamp as a substitute revision.

### 5. Trace the execution path

Follow:

```text
frozen canonical seed
  → source/chunk hydration and qualification
  → actual parser/JSONL evidence owner
  → POS/token/span owner
  → domain classifier
  → feature setup
  → routing owner
  → retrieval executor and candidate normalization
  → ACE/ContextManifest candidate
  → stage-by-stage receipt and independent readback
```

At every arrow, verify the consumer received the producer's output, not a hand-built object or a parallel fallback. Record the first divergence and stop there. A classifier generated inside a packet builder does not prove the classifier service ran. A vector candidate returned by pgvector does not prove representation parity or admission. A ContextManifest contract or bridge test does not prove assembly on this live path.

### 6. Verify read-only behavior

- Use a PostgreSQL read-only transaction for live database inspection.
- Treat cache reads separately from cache population. Strict diagnostic mode must not populate Redis/Valkey, Bifrost, embedding caches, or local persistent state.
- Record attempted and committed writes by subsystem; require `committedWrites == 0`.
- Local diagnostic receipts are allowed only when requested or required by the owning task. They must say `canonicalAuthority=false` and must not be represented as datastore readback.

### 7. Corpus indexing and agentic repair

When the requested path includes acquired documentation, chunks, embeddings, trigram search, AST/CST/symbol retrieval, or parameter synthesis:

- Inventory source namespaces and existing corpus artifacts before indexing. Distinguish raw acquired documents, admission envelopes, local JSONL projections, admitted PostgreSQL rows, and Qdrant/GPU projections. A generated JSONL file is not canonical admission.
- Prefer the existing `.okf` documentation pipeline and admission-envelope owners. Its `--acquire-only` mode still writes local files; inspect the implementation and label that side effect. Do not combine it with embedding, clustering, or Qdrant options.
- Validate each chunk's parent document, evidence revision, checksum, and UTF-8 byte span. If the source bytes are unavailable for exact `sourceBytes[startByte:endByte] == chunkText` verification, label the coordinate check incomplete; byte-length equality alone is not source alignment proof.
- Keep lexical trigram/FTS and semantic embeddings as separate retrieval lanes. `pg_trgm` does not require embeddings. Do not index an unadmitted local corpus into canonical PostgreSQL or create new indexes as an audit convenience.
- Treat Ollama/EmbeddingGemma worker concurrency as an explicit capacity policy. An asynchronous job handler that starts one goroutine per message is not a bounded CPU worker pool. Before use, establish max in-flight jobs, per-request batch size, timeout/cancellation, retry/idempotency behavior, CPU thread limits, and per-job receipts.
- A worker that writes Redis/Valkey progress or Qdrant points is not a read-only embedding executor. Keep it out of diagnostic/proposal runs unless the exact write path is authorized and independently read back.
- Record model artifact/revision, tokenizer/input policy, normalization, dimensions, recipe and output checksum. `embeddinggemma:latest`, equal dimension, or a successful Ollama response does not prove parity with canonical `semantic_768`.
- Treat cuVS/cuGraph/cuTile/SIMT as derived executors or experiments. Require an immutable input snapshot, revision/checksum-bound ordinal map, CPU oracle parity and resource approval before accelerator execution. Never use GPU ordinals as identity.
- Treat simdjson as a bounded parse/transport optimization only. Validate schemas and preserve evidence fields after parsing; SIMD speed does not establish chunk alignment or canonical lineage.
- For agentic error fixing or parameter synthesis, retrieval output only nominates evidence-backed candidates. Route synthesis through the existing canonical candidate/ContextManifest and validation owners; keep generated parameters as proposals until independent checks and mutation authorization pass.

## Required report

Report a compact stage matrix:

```text
stage | owner | caller | observed input/output | identity match | revisions/evidence | test/live state | first blocker
```

Then summarize:

- `present`: owner/contract artifacts found;
- `wired`: producer-to-consumer edges actually demonstrated;
- `proven`: focused tests, live component observations, and vertical proof separately;
- `missing`: exact unimplemented or unproven prerequisite;
- `first_failure`: earliest boundary that stops the requested proof;
- `writes`: per-store attempted/committed totals;
- `next_gates`: dependency ordered, each independently verifiable;
- `ledger_updates`: owning OpenSpec path and workstation projection path, if the user requested edits.

Use `PARTIAL` or `BLOCKED` when a gate is incomplete. State `NOT_VERIFIED` rather than guessing. Keep false-positive exclusions explicit: absence is not a match; schema resemblance is not lineage; stale Graphify is not a current snapshot; extractor output is not admitted graph incidence; semantic similarity is not a structural edge; a cache hit is not evidence.

## Current LINEAGE-E2E-01 starting evidence

This is a starting point from the 2026-10-05 diagnostic, not a fresh proof. Recheck before relying on it:

- One packet/chunk passed `qualifyEvidenceV1` as `CHUNK_REVISION_QUALIFIED`.
- Existing JSONL/POS/domain/feature schemas and the `buildPosConceptTaggingPacket` owner exist.
- The diagnostic's 8095 POS call returned 218 token assertions, but the typed POS output did not preserve the exact token/span evidence.
- The live `/classify` call was unavailable. A builder-produced domain object is not classifier execution evidence.
- The draft receipt used the legacy `semantic_768@v1` label in place of a real representation revision and included hard-coded producer/parser/feature revisions. Reject that substitution.
- Routing was `NOT_EXERCISED`. A read-only pgvector call returned the chosen candidate at rank 2, with `representationRevision=null`.
- No `ContextManifestCandidateV1` was assembled. The prior receipt treated missing fields as acceptable in its “no stage differs” summary; do not rely on that comparison.
- No exact `DerivedArtifactEdgeV1` owner was found in the initial search. Reconcile existing receipt/provenance owners before proposing another contract.
- Keep E2E-01 partial until a fresh one-seed replay carries real outputs through routing, pgvector, and ContextManifest candidate assembly with strict identity comparison and zero committed writes.

## Required closeout fields

Conclude with:

```yaml
likely_cause: <one sentence>
evidence: <paths, receipt IDs, revisions, and observed outcomes>
patch_targets: [<changed or reviewed paths>]
safe_next_command: <non-destructive inspection or validator>
smoke_command: <focused controlled validation>
report_path: <existing or newly emitted diagnostic report>
```

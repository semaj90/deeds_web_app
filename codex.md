# Codex Bridge Notes

Use this repo as a Postgres-first Engram stack.

Canonical lanes:
- Postgres + pgvector: durable memory truth
- Qdrant: semantic recall and tagging
- Redis: hot memory and cache keys
- SeaweedFS: canonical object storage via the S3 gateway
- ACE / NES: context cards and prompt injection
- TurboVec / Karpathy / SOM: quantization, clustering, and routing hints

OpenCode / Claude-Mem:
- treat as an observation source only
- do not make SQLite canonical
- do not duplicate memory backends
- mirror sanitized observations into `POST /api/memory/claude-mem`

Helper:
- `node scripts/opencode/post-memory.mjs --file <observation.json>`
- `npm run opencode:post-memory -- --file <observation.json>`

Audit and safety:
- see `docs/architecture/opencode-claude-mem-bridge.md`
- see `docs/operations/stack-audit-playbook.md`
- port checks: `5173`, `37777`, `8788`, `8791`, `8792`, `8793`

If a feature exists in another lane, carry the logic forward only if it maps cleanly to this stack and does not break canonical feature IDs, labels, or storage ownership.

## Local Deep Research MCP (2026-10-17)

- When asked to use "LDR" or create a deep-research report, reuse the existing `ldr-research` stdio server: `sveltekit-frontend/scripts/mcp/ldr-mcp.mjs`, registered in `.opencode/opencode.jsonc`. Do not create a second research engine or expose generic Docker/shell control to a model. Registration in OpenCode does not prove a tool is available in another agent session.
- The vendored upstream is LearningCircuit's `local-deep-research` project (`tools/agentic-research/src/local-deep-research`; GitHub `LearningCircuit/local-deep-research`). “LearningCircuit” here names the upstream project; it is not a separate learning-circuit training subsystem.
- Tool sequence: `ldr.search_history` (authenticated lookup) → `ldr.start_research` (explicitly authorized LDR-local job) → `ldr.poll_status` → `ldr.get_report` (final Markdown/sources). Select one supported search engine and a bounded iteration count. `ldr.quick_summary` is retained only for compatibility and returns an unsupported-operation error.
- Keep the other research paths distinct: `atlas-ldr-mcp.mjs` exposes `atlas_deep_research` and `atlas_research_health` for repository retrieval through AtlasTaskKernel; TRACE's `ldr_research` tool runs the SvelteKit application orchestrator. Neither is the LearningCircuit Docker MCP, and the Docker MCP does not qualify results into ACE automatically.
- Credentials load from gitignored `sveltekit-frontend/.env.ldr.local` using `LDR_USERNAME` / `LDR_PASSWORD`; process environment takes precedence. Never print, commit, or include credentials/session tokens in reports. The existing session helper logs in on loopback only, retains cookies in memory, refreshes CSRF after login, and attempts login at most once per MCP process. Restart the MCP process after session expiry; do not bypass authentication.
- If direct MCP tools are unavailable, use the existing client from the repo root: `node scripts/atlas/ldr-report-v1.mjs --probe`; start an authorized job with `--start --query="RESEARCH QUESTION"`, or resume/export with `--task-id="EXISTING_ID"`. No implicit research launch on probe.
- Reports and checksummed JSON receipts go to `docs/ldr/`. A pending or blocked receipt is not completed research; jobs may continue in LDR after bounded polling ends. Preserve the task ID for resumption. Treat final research and citations as unreviewed derived proposals, not canonical code evidence or ContextManifest admission.
- Verified October 17: authenticated MCP history access passed; eight focused tests passed. Completed live research/report generation remains a separate gate. Ornith readiness/model identity must be checked live; an LDR HTTP 401 is authentication failure, not evidence that llama-server is down.
- Research authorization permits the requested LDR-local history/report artifacts, not canonical PostgreSQL writes, Graphify publication, Qdrant/Neo4j projection, Valkey warming, model/service lifecycle changes, or training. Source-revision backfill stays deferred. No hidden reasoning, KV cache, or tensors may be persisted.
- Validation: `node --test scripts/atlas/ldr-report-v1.test.mjs scripts/atlas/ldr-session-v1.test.mjs`. Details and closeout fields: `docs/ldr/README.md`.

## OpenSpec audit execution

## Main repository and package ownership

- The root repository remains the active Parent Atlas implementation and proof surface. Keep repository-level runners, bounded materializers, audits, independent readback/verifiers, and root npm commands under `scripts/atlas/`; the SvelteKit runtime composition stays under `sveltekit-frontend/src/lib/server/atlas/` and existing Python service owners stay under `python/` or `services/`.
- `packages/parent-atlas` and future `packages/atlas*` locations are reusable-contract/pure-logic destinations, not replacements for the current root implementation. Do not delete, move, or hollow out existing root scripts or package work to force this separation.
- Copying or extracting code into `packages/atlas*` is a later, deliberate migration. Before relocation, preserve the root command/API, prove package-to-root parity, retain existing callers, and record the migration in the owning OpenSpec ledger. Until then, work in the current owner and keep root proof runners runnable from the main repository.
- Avoid parallel canonical owners: package code may provide reusable contracts/adapters; root scripts prove repository behavior; the SvelteKit/Python owners compose runtime behavior. PostgreSQL and the existing Atlas identity/revision owners remain authoritative.

- `scripts/atlas/run-openspec-evidence-fabric-v1.mjs` uses a bounded CPU stage pool only for independent readers of the same frozen census. The default is at most two concurrent stages; the hard cap is three. Set `OPENSPEC_EVIDENCE_MAX_CONCURRENT_STAGES=1` to force serial execution or `2`/`3` only when memory headroom is adequate.
- The parser must finish before pooled readers start; receipt binding, reconciliation, cards, workboard projections, final authority, and dependent stages stay serialized in dependency order. Each concurrent stage must have a distinct run-scoped output path and the same `runId`/census checksum.
- Do not add Redis/Valkey caching or GPU work to Markdown/JSON census parsing by default. Consider caching only after profiling demonstrates material repeat cost; cache keys must include workspace revision, exact input checksums, parser/schema revision, and deterministic output checksum. Cache hits are rebuildable intermediates, never proof or canonical state.
- GPU is for measured numerical kernels (for example qualified CSR PageRank or dense feature-matrix operations), not filesystem scanning, Markdown parsing, JSON serialization, or report authority decisions. Preserve CPU-oracle parity and executor receipts before using GPU output.

## Documentation fetch and OCR cost controls

- New scripts must not call hosted Firecrawl implicitly. Require explicit opt-in (for example, `--allow-firecrawl`) and a bounded exact-URL/page limit; report the planned request count before fetching. Do not enable Firecrawl merely because `FIRECRAWL_API_KEY` is present.
- Distinguish Firecrawl's structured JSON extraction format from locally writing a JSON/JSONL manifest or sidecar. Local serialization does not request Firecrawl JSON extraction and does not incur its JSON-format surcharge.
- For hosted Scrape/Crawl calls, consult the current [Firecrawl pricing](https://www.firecrawl.dev/pricing) before running because rates can change. Current pricing states a basic page scrape is 1 credit and JSON, Question, or Highlight formats add 4 credits per page. Budget from page count and selected formats; at those rates JSON extraction is about 5 credits/page. Prefer Markdown/HTML plus the existing local schema/parser when that satisfies the task. Do not request JSON extraction just to obtain machine-readable local artifacts.
- Make the selected fetcher explicit and record the actual successful executor, page URL, response status, fetch time, parser/fetcher revision, and content checksum. Any fallback to a billable remote executor must be visible in the run receipt; do not silently retry a failed local fetch through Firecrawl.
- For Windows OCR, prefer the installed local Tesseract executable when it meets the document/language need; resolve and record its path/version and language-data revision. Bind OCR observations to the exact input-file checksum and page/region coordinates. OCR text is an observation/proposal, not source identity or admitted evidence. Use remote OCR only as an explicit, budgeted exception and preserve the same receipt/provenance rules.
- OCR/Docling output is text extraction, not an embedding. For admitted crawled or scanned documentation, reuse the existing external-document chunk and `SEMANTIC-DOC-01` EmbeddingGemma path (`atlas_external_doc_chunks.content_embedding`); do not mix these vectors with the codebase corpus or create another vector owner.
- Before treating document vectors as retrieval-aligned, bind the exact embedding model artifact/runtime, formatted document input, prompt revision, pooling/normalization recipe, and 768-d output checksum to the batch and prove query/document executor parity. Matching dimension or the mutable tag `embeddinggemma:latest` alone does not establish the same vector space. Keep population dry-run by default and require the existing parity receipt plus explicit authorization for writes.
- Fetch planning, dry-runs, and tests must not make network calls. Keep network acquisition a separate explicit execution step and never start embedding, vector indexing, model synthesis, or datastore writes as an implicit consequence of fetching.

Recent Parent Atlas findings:
- `packet_id` stays the canonical UUID identity.
- `packet_ulid` is now the sortable workflow/order field for packet lineage.
- `packet_key` remains the deterministic duplicate/content guard.
- `title_id` is a derived semantic grouping key, not an identity key.
- `canonical_source_ref` is now populated across the packet ledger to keep source provenance aligned.
- The current backfill left one malformed legacy packet row needing source-side repair rather than generic lineage repair.
- `0.0.0.0:8080` is not a valid browser target; Bitfrost is exposed on host `127.0.0.1:3040` and the container listens on `8080`, so use the host URL for browser checks.

Env discovery rule:
- `.env` and `.env.local` stay gitignored; do not relax ignore rules for real secret files.
- Plain content search against the target env paths works for the main repo and `sveltekit-frontend` env files, even though Git still ignores them.
- For file discovery, use `rg --files -g ".env*"` rather than plain `rg --files`.
- If a path falls outside the usual target files, use an explicit override such as `rg -n --hidden --no-ignore "DATABASE_URL|REDIS_URL|TRACE_MCP_URL" .env .env.local sveltekit-frontend/.env sveltekit-frontend/.env.local`.
- For repeatable presence-only audits, use `npm run env:audit` or pass a custom key set such as `npm run env:audit -- --keys DATABASE_URL,POSTGRES_URL,REDIS_URL,VALKEY_URL,QDRANT_URL,NEO4J_URI,TRACE_MCP_URL`.
- Prefer `.env` as the primary source and `.env.local` as the local override when tracing runtime configuration.

Object storage rule:
- SeaweedFS is the canonical object store. Do not add new MinIO-first architecture, docs, or feature names.
- Legacy names such as `minio_key`, `MINIO_*`, or `minio-client.ts` may remain only where the live schema or compatibility layer still requires them.
- New ingestion paths should describe and generate SeaweedFS or generic S3 object keys, while preserving legacy column names until a deliberate schema rename lands.

## sourceRevision and workspaceRevision (canonical definitions, 2026-10-11)

Use these terms exactly. Agentic workflows must not infer a revision from a filename, mtime, git HEAD alone, or a chunk hash.

| Term | Definition | Owner |
|---|---|---|
| `sourceRevision` | `sha256:<64 lowercase hex>` over the exact UTF-8 bytes of one source file. Empty, non-UTF-8, or unreadable files have no `sourceRevision`. | `identity/code-source-revision-v1.ts` (`deriveCodeSourceRevisionV1`) |
| `workspaceRevision` | `sha256:` over a sorted manifest of `(sourceRef, sourceRevision, contentDigest, byteLength, gitBlobOid)` for the indexed source set. Git commit/tree and `dirty` are provenance only. Non-authoritative. | `identity/workspace-source-binding-v1.ts`, `indexing/workspace-revision-origin-runtime-v1.ts` |

Rules:

- A `sourceRevision` is valid only when the exact bytes were read. Never recompute it from a re-encoded or normalized string.
- `workspaceRevision` is not a substitute for `sourceRevision`. Compare the two only through a recorded binding.
- Known gap: files skipped for size (over 5 MB), encoding, or read error are absent from the digest, so two trees differing only in a skipped file share a `workspaceRevision`. Do not cite a `workspaceRevision` as complete coverage until the `v2` hardening lands (skipped-set, extension-set, and excluded-prefix digests).
- Git blob OIDs (`gitBlobOid`) are provenance anchors, never identity.
- Each revision is a separate namespace from `packet_key`, `chunk_content_hash`, `representation_revision`, and `feature_revision`.

## Binary bytes, SHA-256, and Parent Atlas revision lineage (2026-09-16)

Keep these concepts separate in every future integration:

- A **bit** is 0 or 1. A **byte** is eight bits and represents an unsigned value from 0 through 255 (`0x00` through `0xff`). This is a value domain for binary buffers, control bytes, packed features, and protocol fields.
- **SHA-256 is not a byte value or a packet ordinal.** It hashes an arbitrary byte sequence and produces a 256-bit digest: 32 bytes, normally rendered as 64 lowercase hexadecimal characters. The canonical text form in Parent Atlas is `sha256:<64 lowercase hex characters>`.
- Hash the exact source bytes. Do not hash a decoded/re-encoded string, newline-normalized text, JSON reserialization, or a UTF-16 representation unless that encoding is explicitly the producer contract.
- A whole-source digest and a chunk digest are different grains. `file_content_hash` identifies whole source bytes; `codebase_chunk_index.content_hash` identifies a chunk. Never compare them directly.
- `workspace_revision`, `source_revision`, `representation_revision`, and `feature_revision` are separate namespaces. A SHA-256-shaped value in one namespace must not be copied into another without an explicit producer contract.
- `workspace_revision` identifies a workspace snapshot; it is required at the snapshot/cohort receipt boundary, but it is not automatically required as a duplicated column on every source-local feature row. A row may be bound by exact `source_ref + source_revision` through the authoritative workspace-source binding, while the CandidateOrdinalMap and matrix receipt bind the complete ordered cohort to the admitted workspace snapshot. Require a row-level workspace revision only when the feature's semantics or its storage/join contract depend on that field; never infer it from timestamps, ordinals, or a caller-supplied default.
- Missing row-level `workspace_revision` is not by itself proof that a source-local observation is invalid. Admission still requires independently verified source bytes/revision, feature-definition and producer revision, evidence references/checksum, exact candidate identity, and a snapshot-bound matrix receipt. Workspace-/graph-derived values require their own applicable workspace/graph revision. Missing provenance is unavailable/rejected, not a numeric zero.
- `packet_key` is a deterministic packet identity/projection key. It is not a substitute for the source digest, workspace revision, or canonical candidate ordinal.
- Qdrant point IDs, Redis/BitFrost keys, centroids, GPU pointers, and topology coordinates are derived projections. They cannot promote or replace PostgreSQL source identity.

Canonical source lineage is:

```text
immutable workspace snapshot
  → Graphify execution_id
  → source_ref + source_revision + exact source-byte digest
  → packet_key + binding_checksum
  → packet→chunk lineage
  → representation_revision
  → derived Qdrant/ACE/GPU projections
```

Promotion requires exact readback of every identity field. Upserts must be idempotent only when the existing row has the same identity and digest. Any differing value is an identity collision, revision mismatch, or content mismatch and must fail closed; never coerce a SHA-256 workspace revision into a legacy integer such as `0`.

Do not add or require `workspace_revision` on a feature-row table solely to duplicate the cohort snapshot revision. First prove whether exact source bindings plus the CandidateOrdinalMap/matrix receipt preserve the required lineage losslessly. If they do not, ask the existing schema owner for the smallest reviewed provenance change. A nullable column is not a substitute for an admission contract, and a missing value must not be backfilled by inference.

Reference standards: NIST FIPS 180-4 defines SHA-256 message digests; Python documents bytes as sequences of integers constrained to `0 <= x < 256`.

## UUID version policy for Parent Atlas identity and indexes (2026-09-16)

UUID formats are lifecycle tools, not replacements for canonical packet/source identity:

- **UUIDv4**: random operational IDs for requests, traces, temporary jobs, and ephemeral runs.
  Never use it for replay-stable packet or training-row identity.
- **UUIDv5**: deterministic name-based IDs from a frozen namespace and canonical name. The
  frozen `PACKET_AGGREGATE_NAMESPACE_V1` is used for derived packet-index matching across
  legacy namespaces. It is a lookup key only and does not authorize a packet upsert.
- **UUIDv7**: time-ordered IDs for newly generated durable events or batches where index locality
  matters. It does not identify source bytes or reconcile historical packets.
- **UUIDv8**: custom application-defined layout only after its bit layout, namespace, checksum,
  and replay semantics are explicitly frozen. Do not add it to packet repair casually.

For YAML/JQ/JSONL indexes, preserve the real namespace and type: UUID as UUID, `packet_key` as
text, and `sha256:<64 hex>` revisions/digests as text. A UUIDv5 index match is admissible only
after exact equality of `packet_key`, `source_ref`, `workspace_revision`, `source_revision`, and
whole-source content digest. Same UUIDv5 key with different canonical fields is an identity
collision. Manifests must record `uuidAlgorithm`, `uuidNamespace`, `uuidName`, and
`canonicalIdentity: false` for derived index UUIDs. PostgreSQL remains canonical; YAML/JQ,
DuckDB, Redis/BitFrost, Qdrant, centroids, and GPU identifiers remain projection layers.

RFC 9562 is the reference for UUIDv4, UUIDv5, UUIDv7, and UUIDv8 semantics.

### Qdrant document point IDs

- `deterministicPointId()` remains the legacy integer helper; do not silently change its return type or existing callers.
- New document-index experiments may use `deterministicQdrantDocumentPointIdV1()` with the separately derived, frozen `QDRANT_DOCUMENT_POINT_NAMESPACE_V1` and the length-framed tuple `(packetKey, chunkId, sourceRevision, representationRevision, embeddingModelRevision)`.
- Record `uuidAlgorithm`, `uuidNamespace`, `uuidName`, and `canonicalIdentity: false` in any derived-index manifest. The UUID is a projection key, not packet identity or upsert authorization.
- Do not switch an indexer or migrate persisted IDs until the exact canonical input fields, existing integer-ID compatibility, collection state, and independent readback are reviewed and the migration is explicitly authorized.

## Embedding executor fallback

- For read-only retrieval diagnostics, first health-check the configured approved embedding executors (including strict `:8081` and other configured services). If they are unavailable, retry with Ollama `embeddinggemma:latest` at `:11434` rather than abandoning the diagnostic immediately.
- Label every result with its actual executor/provider and embedding recipe. Ollama fallback is an executor fallback, not proof of representation/recipe parity; equal model name or 768 dimensions alone is insufficient.
- Keep fallback runs read-only: allow lookup-only cache access, disable cache population and all durable writes. Mark the result diagnostic/non-authoritative unless the exact model artifact, tokenizer, input policy, and representation revision are proven equivalent to the canonical recipe.
- Never use Ollama fallback to authorize canonical embedding writes, backfills, Qdrant projection, or a canonical parity pass. If the fallback is used, report the primary-executor outage and keep the strict canonical gate blocked until parity is proven.
- `:8090` is the Ornith synthesis endpoint, not an embedding fallback.

## Agentic validation and review authority

- TRACE MCP tool calls (including `atlas.query` and `miniforge.health`) are read-only diagnostics. Validation output must print retrieval/tool status, NLP sidecar readiness/capabilities when available, and `AGENTIC_REVIEW=ADVISORY_ONLY; HUMAN_APPROVAL=NOT_GRANTED` unless a separately verified approval receipt exists.
- A successful TRACE/MCP call or FastAPI NLP health response does not establish ACP/A2A protocol conformance, Mastra/OpenCode MCP integration, a trusted non-human reviewer, source/module digest parity, evidence admission, or human authorization. Report each as unverified unless its owning protocol and evidence checks pass.
- Model, agent, HMM, or Viterbi review/routing may produce advisory proposals only. Tool invocation remains governed by the existing allowlisted registry, input/output schema validation, permissions, execution policy, and independent readback. Never infer authorization from a score, tool name, or successful health check.
- Ontology tuples must come from grounded typed relations and the existing tuple admission owner; Oaklib term resolution, cosine/centroid similarity, summaries, cache hints, and TaskCard admission do not create relation evidence. ContextManifest synthesis must consume independently admitted evidence and bind its receipt to the exact manifest, model, and prompt revisions.
- Cross-runtime serialization and transport tiers:
  - `simdjson` N-API threshold: use native V8 `JSON.parse()` for $< 1\text{ KB}$; dispatch to native N-API addon (`simd_bridge_rs.node` / `tensorrt_bridge.node`) via `parseNdjsonTypedEvidence` for $\ge 1\text{ KB}$ (NDJSON, bulk batches). Validate via Zod before promoting to `TypedEvidenceEnvelopeV1`.
  - Python OakLib `Tuple[str, str, str, float]` serializes over HTTP JSON as arrays `[s, p, o, conf]`. TypeScript maps them as `RawOaklibTuple = readonly [string, string, string, number?]` and adapts into structured `OntologyLinkedTupleV1`.
  - Tuples must be committed to PostgreSQL `atlas_ontology_linked_tuples` before writing to Valkey cache via `buildOntologyLinkedTupleCachePlan`. Valkey cache plans are partitioned by centroid keys (`atlas:centroid:domain:...`, `atlas:centroid:kmeans:...`, `atlas:centroid:som:...`). Review candidates are derived via `deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1` fail-open only from verified persisted tuples.
  - Transport Matrix: Browser $\leftrightarrow$ SvelteKit uses `tRPC`; SvelteKit $\leftrightarrow$ Python NLP/OakLib uses `FastAPI` (HTTP/NDJSON); SvelteKit $\leftrightarrow$ Go Retrieval uses `gRPC`; SvelteKit $\leftrightarrow$ Valkey uses `RESP3` (`ioredis` with credentials and error handlers).

## GPU lane switch: WSL2 miniforge/conda work vs the Ornith :8090 server (2026-10-04)

The RTX 3060 Ti (8 GiB) cannot hold the Ornith vision server (~6.4 GiB, plus ~1 GiB of Windows/desktop use) and a WSL2 RAPIDS/cuVS job together. With vision up only ~0.2 GiB is free.

Trigger keywords: `wsl2`, `wsl`, `miniforge`, `conda`, `atlas-rapids-cu13`, `cuvs`, `rapids`, `cugraph`, `cudf`, GPU `kmeans`. CPU-only conda work does not need the stop.

VS Code tasks (Terminal > Run Task; defined in `.vscode/tasks.json`; lifecycle is human/VS Code controlled, MCP stays read-only):

| Step | Task | Effect |
|---|---|---|
| observe | `TurboQuant: Status (:8090 process, vision, VRAM)` | read-only, safe anytime |
| turn it down | `GPU: Prepare cuVS KMeans (frees VRAM, does NOT run KMeans)` or `Free GPU VRAM (unload Ollama + stop :8090)` | `ollama stop` each model, graceful stop of ONLY the llama-server with `--port 8090`, prints running/loaded/used/free, exit 1 if `:8090` survives or free < `KMEANS_MIN_FREE_MIB` (default 1536 = measured `CUVS_KMEANS_MEDIUM` minimum free, up to ~55k rows) |
| run the job | WSL interpreter `/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python` | e.g. `python/atlas_compute/cluster_softmax.py::run_cuvs_soft_kmeans` |
| bring it back | `TurboQuant: Start (vision, CPU projector, :8090)` then Status | expect `vision=True`; never leave `:8090` down silently |

Rules: check `:8090/slots` is idle and ask the operator before stopping; never `taskkill /IM llama-server.exe` (Ollama's embedding runner shares the image name); never force-kill. While `:8090` is down, chat, tool loop, synthesis, captioning and the `:8085` proxy fail (Ollama embeddings, Postgres, Qdrant and the app keep running). Known: `run_cuvs_soft_kmeans` fails on cuvs 26.6.0 until `pairwise_distance` output is wrapped with `cp.asarray` (see the lane-consolidation `tasks.md`, 2026-10-04).

## Parallelism optimization policy (2026-10-21)

- **Measure first.** Time the serial run and record the baseline before adding concurrency. Keep the serial path as the replay mode and the oracle for results.
- **Bounded pools only.** Default concurrency 2–4 with a hard cap; record the concurrency used in the receipt. Do not raise it without checking peak memory and repeat-run stability.
- **Independent work only.** Parallelise independent readers of one frozen input. Keep dependent stages (binding, reconciliation, authority, final writes) ordered. Any failed unit blocks downstream stages.
- **Run-scoped outputs.** Pooled units write unique, run-scoped outputs that share one run and input identity. Never let two units write the same file or key.
- **Stdio MCP servers are expensive.** Each lane call may spawn a process (a cold `npx` start takes about 10 s). Cap concurrent calls per server at 1 for `npx`-spawned servers, and reuse a session where the server supports it.
- **CPU pools for CPU work.** Parsing, chunking, AST, JSON and joins use CPU worker pools. GPU is for measured tensor kernels only, with CPU-oracle parity.
- **Side effects stay serial.** No parallel writes to PostgreSQL, Valkey, Qdrant or Neo4j. Writes follow the existing gates, one owner at a time.
- **Caching is not proof.** A cache hit never substitutes for evidence. Cache only rebuildable intermediates keyed by revision and checksum.

### MCP query-batch profile

- The 50-query golden-breadth runner is currently sequential. Its serial receipt is the baseline; do not claim a speedup until a repeatable comparison exists.
- A future query-level pool may use at most four independent queries, preserving the frozen query-set hash and output order. Keep provider calls as distinct lanes with separate per-server semaphores; start at one in-flight call per MCP server. In particular, serialize Svelte `npx` stdio calls because each currently starts a process and has a costly cold start. Raise a lane cap only after a bounded concurrency/replay test.
- Each query gets an isolated result; one lane failure is recorded, never silently dropped. Merge results and write the single run manifest serially after all workers settle. A partial run is not complete.
- Keep retrieval results marked untrusted candidate evidence. Do not inject raw MCP text into Ornith/ACE, create “gold” relevance labels, or warm Valkey centroid/query keys from unreviewed results. Cache writes remain a separate authorized, revision-qualified step with independent readback.
- CPU parsing, JSON normalization, checksumming, and source enrichment use measured bounded CPU pools. A larger system RAM budget or Node heap flag is not evidence that concurrency is safe; record RSS/heap, latency, timeout, and repeat-run behavior first.
- **GPU batch work is deferred.** Do not use a GPU for JSON, AST parsing, or MCP fanout. A later GPU batch enhancement must use an existing numerical executor/owner, frozen revisioned inputs, bounded batch/memory limits, CPU-oracle parity, operator resource approval, and its own OpenSpec/receipt. Do not stop or replace `:8090` without the existing GPU-window approval path.

The `.okf/indexes/feature-intelligence.yaml` policy defines PostgreSQL authority, logical lanes, rebuildable projections, executor roles, and projection receipts. It does **not** define Valkey/BitFrost cache policy, model KV state, or thread/concurrency limits; use the runtime rules in `AGENTS.md`/`CLAUDE.md` for those concerns.

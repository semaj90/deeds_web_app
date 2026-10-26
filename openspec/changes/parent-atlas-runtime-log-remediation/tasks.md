# Runtime Log Remediation Tasks

Source: runtime logs and probe results observed 2026-10-12 to 2026-10-13. Each task names the log line or probe result it answers. No task is checked until its evidence exists and is linked here.

Authority: this change does not own any canonical data. Fixes go through the existing owners named in each task.

## Database (PostgreSQL 18)

- [ ] LOG-01 Unclean-shutdown recovery. Logs show `database system was not properly shut down; automatic recovery in progress` at 2026-10-13 17:21 UTC and 18:05 UTC, plus an interrupted start on 2026-09-29. Container `RestartCount` is 0, so the restarts were not Docker restarts. Find the trigger in Docker Desktop, WSL and Windows event logs around both incidents. Record the cause, or record it as unknown with the logs checked. No `pg_resetwal`, no WAL deletion.
- [ ] LOG-02 Diagnostic SQL error `function halfvec_dims(halfvec) does not exist`. The caller used a function name that does not exist. Replace it with `vector_dims()`, which has a `halfvec` overload. Owner: the diagnostic script or query that issued it, not the server. Verified: `pg_proc` lists `vector_dims(halfvec)` and `vector_dims(vector)`.
- [ ] LOG-03 ParadeDB warnings `Aggregate Scan not used: field 'content_embedding' ...` and `field 'latent_128' ...` and `latent_256_checkpoint_revision`. These are nonfatal pushdown declines. Record them as expected for those columns, or find the query that triggers them and rewrite it. Do not disable the check globally.
- [ ] LOG-04 Index validity. All 51 indexes on `codebase_chunk_index` report `indisvalid` and `indisready`. This is catalog state only. Run `amcheck` on the HNSW and btree indexes, with approval, since it reads every page.

## Error signal stream

- [ ] LOG-05 Six `error_signal_stream` rows, all from one ingestion batch on 2026-07-04. Treat them as historical fixtures or an import, not live failures. Confirm whether any writer still produces rows, and find the writer that produced this batch.
- [ ] LOG-06 Stale claims in the stream. `relation does not exist: atlas_packets` is not current: the table exists with 61,718 rows. `column community_id does not exist` is also not current, but it exists in 24 tables, so the owning query is unknown. Reproduce against the owning query, not the table.
- [ ] LOG-07 Retrieval miss `0 rows returned from qdrant search` (`task-002`). Unverified. Needs a live Qdrant read through TRACE, against the current collection and revision.
- [ ] LOG-08 Three `audit_recommendation` rows. Not runtime failures. Keep them as proposals. The validator already marks them `PROPOSAL_ONLY`. Confirm no repair path accepts them.

## TRACE and retrieval services

- [ ] LOG-09 `rerank` on `:8099` and `topology_search` on `:8101` are down (health check, 2026-10-13). Decide whether these services should run, and either restore them or remove them from the health set.
- [ ] LOG-10 TRACE health notes label `:8090` as reranker and `:8080` as TurboQuant. The health check labels `:8090` as turboquant. Fix the notes so the port map is consistent.
- [ ] LOG-11 Native acceleration backend `NATIVE_BACKEND_UNAVAILABLE` from `atlas_backend_info`. The simdjson path falls back to `JSON.parse` without an error. Verify the native addon and make a missing addon visible. Ties to KAFKA-19.
- [ ] LOG-12 `atlas_packet_search` with a `source_ref` query hit the statement timeout. A `summary_query` on the same table works. Find the index that the `source_ref` variant lookup misses, and add it through a migration proposal, not a direct DDL.
- [ ] LOG-13 Packet summary contamination. A canonical packet (`packet:2e3047ea461b`, `graph-ml-client.ts`) stores model drafting text in its `summary` field. Add a summary validator that rejects drafting markers, and regenerate affected packets through the existing packet writer.
- [ ] LOG-14 `trace_search` (deprecated alias) produced no response for 300 seconds. Route callers to `kb.trace_search` or the non-alias owner, and remove the alias from new code.

## Connection and credentials

- [ ] LOG-15 Shared connection helper no longer falls back to the `'123456'` password (`scripts/atlas/connection-config.mjs`). Done in code, verified by a fail-closed test. Still open: 455 files under `scripts/atlas` carry the literal. Needs your decision on credential rotation first, per the earlier review.

## Validation gates for this change

- [ ] LOG-16 Re-run `trace_system_health` after LOG-09 and LOG-10 and record the result.
- [ ] LOG-17 Re-run the packet summary validator over all canonical packets and record the count of rejected summaries.
- [ ] LOG-18 `openspec validate parent-atlas-runtime-log-remediation --strict` passes.

## Validation run — 2026-10-13 ~20:10 UTC (read-only, via TRACE MCP)

Boxes above are unchanged. This section records what the gates returned.

| Gate | Method | Result | Status |
|---|---|---|---|
| LOG-16 health re-check | `trace_system_health` | Degraded. `rerank` `:8099` and `topology_search` `:8101` still fail with `fetch failed`. Postgres, Redis, Qdrant, Neo4j, Bifrost, `:8090`, go-retrieval, and TRACE MCP are ok. | NOT MET |
| LOG-17 summary scan | `atlas_packet_search` with `summary_query: "drafting"`, limit 20 | At least 20 canonical packets whose summaries contain drafting text (for example "Drafting the summary", "Draft 1", "Constraint Checklist", "The summary needs to be 1-2 sentences"). The result is capped at 20, so this is a lower bound. A full count needs the validator over all canonical packets. | NOT MET (lower bound 20) |
| LOG-12 `source_ref` index | `db_table_inspect` on `atlas_packets` (indexes only) | The index list was truncated before the `source_ref` entries, so the result is inconclusive. Earlier `pg_class` output shows `idx_atlas_packets_canonical_source_ref`, `idx_atlas_packets_file_path`, and `source_ref` indexes exist. The timeout may come from the variant lookup, not a missing index. | INCONCLUSIVE |
| LOG-18 strict validation | `openspec validate parent-atlas-runtime-log-remediation --strict` | Valid (run 2026-10-13). | MET, box left unchecked until committed |

### Next actions

- LOG-16: restore or formally retire `:8099` and `:8101`, then re-run.
- LOG-17: add a summary validator that rejects drafting markers, run it over every canonical packet, and record the full count. Regenerate affected packets through the existing writer.
- LOG-12: run `EXPLAIN` on the `source_ref` variant query (read-only, through TRACE, if a tool is available). Do not add an index without a migration proposal.

## Next-step results — 2026-10-13 (LOG-09, LOG-10, LOG-13, LOG-17)

Boxes above are unchanged. Nothing was started, restarted, or written to a store.

### LOG-09 — `:8099` rerank and `:8101` topology

- `:8099` is the Mixedbread CrossEncoder reranker sidecar (`scripts/launch-reranker.ps1`, `scripts/atlas/rerank-shadow-01-harness.mjs`). It is GPU-backed. Restarting it needs the free-VRAM procedure first. At the time of this check the GPU had 386 MiB free with Ornith on `:8090` (7,639 MiB used), so it was not started. Restart needs operator approval.
- `:8101` is the topology executor. `scripts/atlas/audit-promotion-board-reconcile-v2.mjs` records it as an optional capability (gate `TOPOLOGY-EXECUTOR-NEED-01`), not blocking, and states that port 8101 is owned by the Go index worker. Recommendation: mark it optional in the health set. The health-check config that lists it is not in tracked code, so I could not edit it here.

### LOG-10 — port labels disagree

| Source | `:8090` | `:8080` | `:8099` |
|---|---|---|---|
| TRACE health notes | "Reranker" | "TurboQuant" | — |
| TRACE health checks | turboquant (`/health`) | — | rerank (fetch failed) |
| `scripts/INFERENCE_INFRASTRUCTURE.md` | — | — | "TensorRT-LLM" (OFFLINE) |
| `scripts/launch-reranker.ps1` | — | — | reranker |

Fix: one port map, referenced by both the health notes and the docs.

### LOG-13 / LOG-17 — summary validator

- Built `scripts/atlas/validate-packet-summary-v1.mjs`. Pure function, no database, no network, no writes. Rejects empty summaries, drafting markers, scratch lists, and summaries over three sentences.
- Spec: `scripts/atlas/validate-packet-summary-v1.spec.mjs`, 3/3 pass. Positive cases are excerpts copied from the live scan. Negative cases are finished summaries.
- Not done: running it over every canonical packet (LOG-17). The TRACE packet search caps results, and no bulk read tool is registered, so a full count needs either a new TRACE tool or an approved bulk read. The earlier scan remains a lower bound of 20.
- Not done: regeneration of affected packets (LOG-13). That goes through the existing packet writer and needs approval.

### LOG-12 — still open

No registered TRACE tool runs `EXPLAIN`. Index changes stay blocked until that is available.

## LOG-01 — host-log investigation of the unclean shutdowns — 2026-10-13 (read-only)

Boxes above are unchanged. Local time is PDT (UTC minus 7 hours).

| Time (UTC) | Host event | PostgreSQL event |
|---|---|---|
| 17:10:13 | Windows resumed from low power (Power-Troubleshooter 1). | none |
| 17:10:35 | Service Control Manager 7011: WSLService transaction timed out after 30 s. | none |
| 17:20:54 | Hyper-V VmSwitch: WSL network reconnected (ids 102, 232, 264). | none |
| 17:21:06 | none | `database system was interrupted; last known up at 10:44:24 UTC`; then automatic recovery. |
| 18:04:22 | Docker backend: `pause resumed: init`, Kubernetes disabled. | none |
| 18:04:32 | Hyper-V VmSwitch: WSL network created again. | none |
| 18:04:50 | Container start. | none |
| 18:05:09 | none | `database system was not properly shut down; automatic recovery in progress`, redo completed, ready at 18:05:09. |

Finding: both unclean recoveries follow a WSL or Docker VM restart. The container is not restarting itself (`RestartCount` is 0). PostgreSQL recovered from both incidents without data-loss signals.

Cause status:
- Second incident (18:04): probable Docker Desktop backend restart, from `pause resumed: init`. The initiator is not in the logs that survived rotation.
- First incident (17:21): probable sleep-resume followed by the WSLService timeout. The Docker logs for that window rotated away, so this is not proven.

Not done: no host or Docker settings changed. A fix would be a clean Docker stop before sleep, or a graceful container stop policy. Either needs your approval.

## Four proof gates — 2026-10-13 (read-only; boxes unchanged)

### TRACE_PORT_AUTHORITY_01 — resolved for three ports, one still open

| Port | Owner (verified) | Previously labelled | Verdict |
|---|---|---|---|
| `:8090` | `llama-server.exe` pid 12564, Ornith 1.5 with vision projector (`hforf.gguf`, `mmproj-Ornith-1.5-9B-BF16.gguf`) | "Reranker" (TRACE notes), "turboquant" (health check) | Ornith vision server. Neither label is correct. |
| `:8080` | `legal-ai-seaweed-volume` (SeaweedFS volume container); WSL and Docker forwarders pids 34820, 32616 | "TurboQuant" (TRACE notes) | SeaweedFS. Not TurboQuant. |
| `:8099` | No listener | "Reranker" / TensorRT-LLM in `INFERENCE_INFRASTRUCTURE.md` | Down. Launcher is Mixedbread reranker. Two docs disagree. |
| `:8101` | No listener | "topology" | Down. Consumers: `topology.search_4d`, hypergraph routing, hyperrag fusion (all via `TOPOLOGY_SEARCH_URL`). No tracked server serves `/search/4d`. Not optional for those callers. |

Open: the health notes in `sveltekit-frontend/src/mcp/trace-mcp-server.ts` (around line 2945) must be corrected, and `:8101` needs an owner before topology or hypergraph routing can be called live.

### PACKET_SUMMARY_GROUNDING_01 — lower bound raised

- Ran `validate-packet-summary-v1.mjs` over the 37 distinct canonical packets returned by two bounded scans (`Constraint Checklist`, `The summary needs`). Result: **34 flagged** (29 drafting text, 4 over three sentences, 1 scratch list). The 4 length hits may be real summaries that are just wordy.
- A third scan (`Draft`, limit 20) returned 20 packets, 19 with drafting markers by inspection. Not yet run through the validator, and overlap with the 37 is not computed.
- Lower bound: 34 distinct flagged packets. Full count still needs a bulk read.
- Quarantine and regeneration remain proposals. Nothing was written.

### CENTROID_RESIDENCY_01 — not proven

- `topology_hydration_status`: 2 total rows, BMU rows **0** (coverage 0.0000), 4D manifold rows 2 (coverage 1.0000).
- `clusters_get_summary_lenses` for cluster 0: no key files, no KAG notes.
- `atlas_embedding_cluster_tags` needs a 768-d embedding input and was not run.
- Packets named after centroid code (`codebase-index/centroids/+server.ts`) do not show centroid vectors.
- Verdict: no Valkey centroid records observed, no BMU assignment, no revision lineage. Gap recorded.

### TRACE_RETRIEVAL_PARITY_01 — partial; lanes collapse to one

| Lane | Result |
|---|---|
| `search_postgres_fts` (query `packet summary validation`) | 5 results, lexical mode. |
| `trace_kag_search` (same query) | Same 5 results, mode `lexical-fallback`. The KAG lane did not reach the Go retrieval service. |
| `atlas_packet_dense_search` | Not run (needs a selective filter and an explicit collection). |
| `graph_expand_neighborhood` | Timed out after 120 s and moved to background (`k657cd4vm`). Pending. |
| Rerank (`:8099`) | NOT_EXERCISED (down). |

Finding: the KAG lane and the FTS lane returned identical results in fallback mode, so they currently count as one lexical lane, not two independent votes. Source-ref forms also differ: the Qdrant payload uses `src/lib/server/ace/ace-error-kag.ts` while Postgres uses `sveltekit-frontend/src/lib/server/ace/ace-error-kag.ts`. Parity needs one canonical form before comparison is valid.

### Not done

- `topology_search_4d` was not called, because its backend is down.
- The new TOC index (`docs/architecture/_topology_classifier_index.md`) was written, but the builder write step was not run. Its `--check` reported a large unrelated size change in the generated TOC (current 42,698 bytes vs regenerated 31,607), so the write was stopped. See `DOC-GOV-TOC-CHECK-01`.

## Decisions applied — 2026-10-13 (boxes unchanged)

1. **Health notes (LOG-10): done in source.** `sveltekit-frontend/src/mcp/trace-mcp-server.ts` (health notes block) now states: `:8090` llama-server, TurboQuant launcher profile, Ornith 1.5 with vision; `:8080` SeaweedFS volume container; `:8099` Mixedbread reranker, down unless started; `:8101` topology search, no tracked server, down. Not yet type-checked or live-verified; the TRACE server must be restarted to load it.
2. **`:8101` owner (LOG-09): not assigned.** No tracked server implements `/search/4d`, so an owner means building a service. Callers (`topology.search_4d`, hypergraph routing, hyperrag fusion) were not changed. Their degradation behaviour is unverified.
3. **Bulk packet read (LOG-17): not done.** Requires a new registered read-only TRACE tool and a TRACE restart. The restart touches the live MCP session, so it needs operator approval.
4. **TOC (Part A): index written, master TOC not regenerated.** `docs/architecture/_topology_classifier_index.md` exists. `build-master-toc-v2.mjs --check` reports unrelated drift (current 42,698 bytes vs regenerated 31,607), so the generated files were left untouched. See `DOC-GOV-TOC-CHECK-01`.

Also observed: `graph.expand_neighborhood` hung twice (300 s idle timeout), so graph parity remains unmeasured.

## Bulk read tool and TRACE restart — 2026-10-13 (partly applied)

- Added read-only tool `atlas.packet_summary_census` to `sveltekit-frontend/src/mcp/trace-mcp-server.ts`, placed before `atlas.packet_search`. It runs inside a read-only transaction with a 60 s timeout and returns totals, a flagged count, and a bounded sample. It writes nothing. Syntax-checked with the TypeScript parser (0 diagnostics). Not type-checked against the full project, and not yet executed.
- Health-notes fix (see decision 1 above) is also in the same file.
- NOT DONE: restart of the live TRACE server (pid 51876, `trace-mcp-server.ts`). The restart was blocked by the permission classifier as an action that interferes with a running workload. Until the server restarts, neither the new tool nor the corrected health notes are live.
- Constraint for the restart: `env.server.ts` reads `process.env` and does not load `.env`. The original launch environment is unknown. Any relaunch must supply the same variables (`DATABASE_URL`, `REDIS_URL`, `TOPOLOGY_SEARCH_URL`, `TURBOQUANT_URL`, and others) or the health and pool settings may differ.
- After restart: run `/mcp` to reconnect `trace`, then call `atlas.packet_summary_census` (LOG-17) and `trace_system_health` (LOG-16).

## Error check — 2026-10-13

- Full project TypeScript check (`tsc --noEmit -p sveltekit-frontend/tsconfig.json`): exit 0, no errors. `src/mcp/trace-mcp-server.ts` is inside the program (4,286 files), so the census tool and the health-notes edit type-check. Runtime behaviour not yet exercised: the server has not been restarted.
- Spec suites: `validate-packet-summary-v1.spec.mjs` 3/3, `error-signal-evidence-v1.spec.mjs` 8/8.
- `docs/architecture/_topology_classifier_index.md`: three cited files used bare names and now use full repo paths; every cited path resolves.
- Still pending: TRACE restart (classifier-blocked) and `/mcp` reconnect; then LOG-16 and LOG-17 can be measured live.

## HANDOFF — state at 2026-10-13 (for the next session)

### Verified this session
- Error-signal validator and bridge: spec 8/8; live run over 6 rows; tamper refusal.
- Packet summary validator: spec 3/3; 34 of 37 distinct packets flagged across two bounded scans (lower bound).
- Full project TypeScript check: exit 0, TRACE server in scope.
- OpenSpec: `parent-atlas-runtime-log-remediation`, `parent-atlas-kafka-projection-initiative` valid under `--strict`.
- Ownership audit: PASS, 22 capabilities, 0 violations.
- cuTile owner probe (`atlas_cuda_cutile_simt_probe_v1.py`): PASS; receipt `.tmp/atlas/cutile-owner-probe-receipt-v1.json`.

### Open, blocked on operator decision or approval
| Item | Blocker |
|---|---|
| Restart TRACE to load census tool and health notes | Permission classifier blocked the restart twice. Operator restarts it, or grants permission. |
| LOG-16 health re-check; LOG-17 full census | Needs the restart above. |
| `:8101` topology owner | No tracked server. Decide: build one, or mark topology and hypergraph routing unavailable. |
| `:8099` reranker | Needs free-VRAM procedure; Ornith is loaded. |
| LOG-15 literal `123456` in 455 files; credential rotation | Operator decision on rotation. |
| LOG-01 crash cause (first incident) | Docker logs rotated away; probable cause only. |
| LOG-04 `amcheck` | Reads every index page; needs approval. |
| LOG-12 `source_ref` slow lookup | No registered `EXPLAIN` tool. |
| Master TOC regeneration | Unrelated working-tree drift (`DOC-GOV-TOC-CHECK-01`). Index written; master not regenerated. |
| Graph parity (`graph.expand_neighborhood`) | Hung twice; 300 s idle timeout. Unmeasured. |

### Known tool defects to carry forward
- `trace_search` (deprecated alias) hung for 300 s; route callers to `kb.trace_search`.
- `graph.expand_neighborhood` hung twice; investigate before any graph claim.
- `atlas.packet_search` with multi-word `summary_query` returned very large outputs (about 88–104 KB, saved to disk), so bounded queries need a single term.

## NEXT TASK: MCP tool parameter audit (LOG-19, proposed, unchecked)

Scope: every tool registered in `sveltekit-frontend/src/mcp/trace-mcp-server.ts` (and any other MCP server in `sveltekit-frontend/src/mcp/`).

1. Schema validity: each `inputSchema` builds under the MCP SDK. Known rule `G34`: no Zod 3 single-argument `z.record(...)` in tool schemas; check every `z.record` call.
2. Parameter-to-handler parity: every declared field is used by the handler, and every field the handler reads is declared.
3. Defaults and bounds: `limit`, `sample`, `radius`, and similar numeric parameters have explicit `min`, `max`, and `default`. Unbounded fan-out is a defect.
4. Read/write classification: each tool's writes (Redis, Postgres, Qdrant, filesystem) match its description. `context_build_ace_packet` and `context.build_kv_packet` write to Redis and must say so.
5. Timeouts: each tool that calls a backend has a bounded timeout. The two hangs above must be explained.
6. Deprecated aliases: list every alias and its replacement; `MCP_LEGACY_ALIASES` gating verified.
7. Output shape: each tool returns `{ content: [{ type: 'text', text }] }` with JSON text, and failures set `isError: true`.

Deliverable: a table of tool, parameters, defects found, severity, and fix proposal, appended to this file. No tool is changed by the audit itself; fixes become separate tasks.

Gate: `openspec validate parent-atlas-runtime-log-remediation --strict` valid after the audit section is added.

## STATE SNAPSHOT — 2026-10-13 21:10 (for compaction; supersedes earlier handoff where they differ)

### Live vs. source
| Item | Source | Live |
|---|---|---|
| `atlas.packet_summary_census` tool | Added to `sveltekit-frontend/src/mcp/trace-mcp-server.ts` | NOT registered. Live process pid 51876 started 10:23, pre-edit. |
| Health notes (ports 8090, 8080, 8099, 8101) | Corrected in source | Old labels still served. |
| Index `_topology_classifier_index.md` | Written; all cited paths verified | n/a (doc) |
| Master TOC | Not regenerated (unrelated drift, `DOC-GOV-TOC-CHECK-01`) | n/a |

### Services (21:08)
Up: `:8788` TRACE, `:8090` Ornith, `:3040` Bifrost, `:8100` go-retrieval, `:6333` Qdrant, Neo4j, Postgres, Redis, Ollama.
Down: `:8099` reranker (needs free-VRAM procedure), `:8101` topology (no tracked server).

### Checks passing
- Specs: validator 3/3, error-signal bridge 8/8.
- Full project TypeScript check: exit 0, TRACE file in scope.
- OpenSpec `parent-atlas-runtime-log-remediation` and `parent-atlas-kafka-projection-initiative`: valid, `--strict`.
- Ownership audit: PASS, 22 capabilities, 0 violations.

### Gates status
| Gate | Status |
|---|---|
| TRACE_PORT_AUTHORITY_01 | Resolved for 8090, 8080; 8099, 8101 down. Source notes corrected; live notes pending restart. |
| PACKET_SUMMARY_GROUNDING_01 | Lower bound 34 flagged (of 37). Full count pending census tool. |
| CENTROID_RESIDENCY_01 | Not proven. BMU rows 0 of 2. |
| TRACE_RETRIEVAL_PARITY_01 | Partial. FTS and KAG collapse to one lexical lane (fallback). |

### Blockers (need operator)
1. Restart TRACE from `sveltekit-frontend` (pid 51876 → new process; load repo `.env`), then `/mcp`. Automated restart was blocked twice by the permission classifier.
2. `:8101` owner: build a service, or mark topology and hypergraph routing unavailable.
3. `:8099` reranker: free VRAM via the documented task (Ornith loaded, 386 MiB free at last check).
4. Credential rotation for `legal_admin` (LOG-15).
5. Approval for `amcheck` (LOG-04).

### Next, once TRACE is restarted
1. `atlas.packet_summary_census` (sample 10) → LOG-17 full count.
2. `trace_system_health` → LOG-16.
3. Re-run `atlas.packet_search` marker queries for cross-check.
4. Then start LOG-19 (MCP tool parameter audit).

### Tool defects to keep in view
- `trace_search` (deprecated alias): hangs, 300 s idle timeout.
- `graph.expand_neighborhood`: hangs (two timeouts); graph parity unmeasured.
- `atlas.packet_search` with multi-word `summary_query`: very large outputs; use single terms.

## 2026-10-13 proof-gate review (read-only; no checkbox changed)

Probes: listener check (PowerShell `Get-NetTCPConnection`), `validate-packet-summary-v1.spec.mjs` (3/3 pass), `trace_system_health`, and TRACE read tools. No service started or stopped.

| Gate | Result | Status |
|---|---|---|
| TRACE_PORT_AUTHORITY_01 | `:8090` llama-server pid 12564 (Ornith, `--mmproj`). `:8080` owned by `wslrelay.exe` / `com.docker.backend.exe` (Docker port-forward; SeaweedFS volume container per source notes). `:8099` and `:8101` no LISTEN. `:8788` TRACE node pid 51876, which predates source edits, so live health text is still the old wording. | PARTIAL_PROVEN: port map agreed in source; live labels pending TRACE restart |
| PACKET_SUMMARY_GROUNDING_01 | Validator spec 3/3 pass. `atlas_packet_search summary_query=drafting` returned 20 packets, all with visible drafting text (e.g. `analytics/mapreduce-matrix`, `analytics/mirror-health`, `auth/health`, `(app)/demos`). Earlier distinct-packet scan: 34 of 37 flagged (lower bound). Quarantine and regeneration are proposals only. | PARTIAL_PROVEN: lower bound, not census; census tool needs restart |
| CENTROID_RESIDENCY_01 | `topology_hydration_status`: totalRows 2, bmuRows 0, manifold4Rows 2 (coverage bmu 0.0000, manifold4 1.0000). `clusters_som_cell_lookup` (0,0): center_count 0, 20 neighbors, all in row 0/1 cells; `som_assignment_health` = unverified. | NOT_PROVEN |
| TRACE_RETRIEVAL_PARITY_01 | Query "packet summary validation". `search_postgres_fts` (mode lexical) and `trace_kag_search` (mode lexical-fallback) returned the same 10 results in the same order: one lexical lane. `atlas_packet_dense_search` failed: `DENSE_SEARCH_STAGE_FAILED:EMBED_QUERY:cause=ECONNREFUSED`. `graph_expand_neighborhood` hung past 120 s and was moved to background (task kki4scz4o). Rerank `:8099` not listening. | NOT_PROVEN: one effective lane; dense, graph and rerank NOT_EXERCISED |

### Gate notes
- The four gates should not be promoted. The lexical overlap is a finding about fallback behavior, not parity.
- Dense failure is the embedding endpoint refusing connections. The endpoint was not identified in this pass.
- Graph expansion is a known hang (see defects above). Do not retry it without a timeout.

### Documentation drift (not changed in this pass)
- `docs/MASTER-TOC-v2.md`, `docs/architecture/ARCH-TOC-v2.md`, and `docs/reports/document-governance-registry-v2.json` are unchanged. `npm run atlas:docs:toc:check:v2` reports pre-existing drift (TOC 42,698 vs 31,608 bytes; ARCH 11,464 vs 11,892), which predates the new index (DOC-GOV-TOC-CHECK-01). The builder writes three fixed tracked paths with no scratch option, so a write run would overwrite them with an unrelated diff. Not run; needs operator decision.

## 2026-10-13 TRACE restart and census (LOG-16, LOG-17)

- TRACE restarted: old pid 51876 stopped; new pid 56544 (started 14:38:00) from `sveltekit-frontend` with repo `.env`/`.env.local` loaded into the process (values not logged). Logs: `.tmp/trace-mcp.out.log`, `.tmp/trace-mcp.err.log`.
- Server `tools/list` registers `atlas.packet_summary_census`. The Claude session's tool list is stale until `/mcp` refresh.
- LOG-17: `atlas.packet_summary_census` (sample 10, read-only, `writesPerformed:false`): total summaries 6,886, flagged 258 (drafting-marker regex). This replaces the earlier lower bound (34 of 37 distinct) with the full count. Quarantine and regeneration remain proposals.
- LOG-16: `trace_system_health` shows corrected port notes (8090 Ornith/TurboQuant, 8080 SeaweedFS, 8099 reranker DOWN, 8101 topology DOWN). Services down: `topology_search` (:8101), `rerank` (:8099).
- PACKET_SUMMARY_GROUNDING_01 is now a full count (258 flagged), not a lower bound.

## LOG-19 MCP tool parameter audit — PARTIAL (2026-10-13; checks 1, 4 partial, 5, 6; no tool changed)

Scope run: static grep over `sveltekit-frontend/src/mcp/`. `trace-mcp-server.ts` registers 121 tools (static count). Checks 2, 3, and 7 were not run; they need a per-tool read and are left open.

| Check | Result | Severity | Fix proposal (separate task) |
|---|---|---|---|
| 1. Schema validity (`z.record` single-arg) | No single-arg `z.record` in code. All uses are two-arg (`admin_tools.ts`, `langgraph-*.ts`, `read-tool-bounds.ts`, `trace-mcp-server.ts`). G34 holds. | none | none |
| 4. Write paths | Three SQL writes in `trace-mcp-server.ts`: `graph.materialize_pathway` (INSERT `graph_pathway_cards`), `kag.ingest_memory_directory` (INSERT `context_timeline`), `ops.record_fix_attempt` (INSERT `fix_attempts`). Redis `setex` in the embed cache (line ~787). Descriptions not yet compared with these writes. | medium (unverified descriptions) | Check each description names its write target; add write disclosure where missing. |
| 5. Timeouts (fetch) | 23 `fetch` calls. Two have no timeout: `context.prefetch_feature_context` (~line 7975, `KB_URL/mcp` `kb.hybrid_search`) and `topology.language_distribution` (~line 10408, Qdrant `points/query` with a 768-d dummy vector). | medium | Add `signal: AbortSignal.timeout(...)` to both. |
| 6. Deprecated aliases | `new_tools.ts` bare-name aliases (`kb.trace_search` and `kb.wiki_note_lookup` targets) are gated by `MCP_LEGACY_ALIASES === 'true'` (line 570 of `trace-mcp-server.ts`). Gate verified in code. | low | none |

Still open: check 2 (declared vs handler-read fields), check 3 (limit/sample/radius bounds), check 4 descriptions, check 7 (output shape per tool).

Note: the timeout hangs recorded above (`trace_search`, `graph.expand_neighborhood`) were not explained by this pass. `graph.expand_neighborhood` is not one of the two unbounded sites, so its hang remains unexplained.

## LOG-19 continuation — bounds check (2026-10-13; check 3 partial; no tool changed)

Static pass: `z.number()` / `z.array(z.number())` in `trace-mcp-server.ts` with no `.min()`/`.max()`.

| Tool | Parameter | Problem | Severity | Fix proposal |
|---|---|---|---|---|
| `topology.search_som_neighborhood` | `limit` (`z.number().int().default(10)`) | no max; unbounded fan-out | medium | add `.min(1).max(200)` |
| `kb.hybrid_search` | `limit` (default 10) | no max | medium | add max |
| `kb.search_pathways` | `limit` (default 5) | no max | medium | add max |
| `search.rerank` | `topN` (default 5) | no max | medium | add max |
| `ops.gpu_attention` | `keys` flat `z.array(z.number())` | no length bound; large payload | medium | cap length; require `n × dim` match |
| `ops.gpu_pagerank` | `adj` flat `z.array(z.number())` | no length bound; n×n can be huge | medium | cap n; require square matrix |
| tool at line ~3083 (`som_x`, `som_y`) | SOM coordinates (`z.number()`) | no 0–19 range (description says 0-based BMU) | low | add `.int().min(0).max(19)` |

Not yet checked: check 2 (declared vs handler-read fields), check 7 (output shape), and the `z.string()` length bounds. Check 4 descriptions still open.
Census tool status: still not in the client tool list (`/mcp` not yet run).

## LOG-19 fixes applied (2026-10-13; source only, not live until TRACE restart)

Edited `sveltekit-frontend/src/mcp/trace-mcp-server.ts`:
- Bounds added: `topology.search_som_neighborhood` limit 1–200; `kb.hybrid_search` limit 1–100; `kb.search_pathways` limit 1–100; `search.rerank` topN 1–100; SOM `som_x`/`som_y` integer 0–19; `ops.gpu_attention` keys and `ops.gpu_pagerank` adj max 1,000,000 elements.
- Timeout added: Qdrant `points/query` health probe in `topology.language_distribution` now has `signal: AbortSignal.timeout(5000)`.
- Correction: `context.prefetch_feature_context` (`kb.hybrid_search` fetch) already had a 5 s timeout. The earlier report flagging it was a false positive from a narrow window scan.
- Syntax check: `transpileModule` reports 0 diagnostics. Full `tsc` did not complete in this session.
- Not yet live: the running TRACE process (pid 56544) predates these edits. Restart TRACE to load them.

## 2026-10-13 TRACE restart #2 (loads LOG-19 fixes)

- Old pid 56544 stopped; new pid 43128 started 15:13:26 with repo env loaded (values not logged).
- `tools/list` on the new process includes `atlas.packet_summary_census`. `/health` returns OK.
- The LOG-19 bounds and timeout edits are now loaded in this process. Live behavior of those edits was not separately exercised.
- Still open: TOC drift decision (DOC-GOV-TOC-CHECK-01), `:8101` owner, `:8099` reranker start.

## SVE-13 PostgreSQL FTS and index assessment (2026-10-13; read-only via TRACE DB tools; no DDL)

| Item | Finding | Status |
|---|---|---|
| Existing diagnostic table | `diagnostic_observations` does not exist (`table_not_found`). Closest owner is `error_logs` (P1 error-fixing table: id, error_category, severity, message, file_path, line_number, packet_key, source_ref, resolved, fix_* columns). It has btree indexes on category, created_at, severity, route, packet_key, and resolved. No full-text index and no fingerprint column. | PRESENT, reuse candidate |
| `error_signal_stream` | Small evidence table: packet_key, task_id, error_class, model_name, evidence jsonb, ingested_at. Btree indexes only. | PRESENT |
| Full-text on diagnostics | None. The FTS hit for "svelte-check diagnostic" came from code chunks (`codebase_chunk_index`), not diagnostics. | NOT_PROVEN for diagnostics |
| `atlas_packets` index redundancy | Overlapping pairs: `idx_atlas_packets_domain_class` and `..._domain_class_idx`; `idx_atlas_packets_feature_id` and `..._feature_id_idx`; `idx_atlas_packets_community_id` and `..._community_id_idx`. Assessment only. | OBSERVED; drop needs approval |
| Query-plan evidence (`EXPLAIN ANALYZE`) | No registered MCP tool runs EXPLAIN. Raw SQL from a script is prohibited by the TRACE tooling rule. | BLOCKED pending approval |

Recommendation (not applied): reuse `error_logs` for diagnostic observations. Add a nullable `fingerprint` column and a generated `tsvector` GIN index only after an EXPLAIN comparison and an explicit DDL decision. Do not create a parallel table.

## SVE-13 read-only plan evidence (2026-10-13; SELECT/EXPLAIN in READ ONLY transaction, rolled back; no DDL)

- Server fingerprint: PostgreSQL 18.4 in `legal-ai-postgres` (socket connection; TCP port empty in-container). Scratch: `.tmp/pg-fp.txt`; plans: `.tmp/sve13-explain.out`.
- Row counts: `error_logs` 1 row; `error_signal_stream` 6 rows.
- Plans (ANALYZE, BUFFERS, SETTINGS):
  - `error_logs` by `packet_key`: index scan on `idx_error_logs_packet_key`, 0.047 ms.
  - `error_signal_stream` by `packet_key`: bitmap scan on `idx_error_signal_packet_task_class`, 0.69 ms.
  - `error_logs` unresolved ORDER BY created_at: seq scan, 0.071 ms.
  - `error_logs` `to_tsvector('simple', message) @@ ...`: seq scan, 0.028 ms, no FTS index.
- Conclusion: these plans run on tables too small to justify index decisions. The seq scan on `error_logs` is the planner's correct choice at 1 row, so it does not show that a GIN index would help. Any tsvector or fingerprint index needs a volume-based decision, which is still open.
- Still open: whether `error_logs` is the right diagnostic owner, and whether to drop the duplicate `atlas_packets` indexes. Both need explicit approval.

## atlas_packets duplicate index validation (2026-10-13; read-only catalog query, rolled back; no DDL)

- Pairs (`CREATE INDEX ... USING btree (col)`, identical after removing the name): `community_id` / `community_id_idx`; `domain_class` / `domain_class_idx`; `feature_id` / `feature_id_idx`.
- None is unique or primary; none backs a constraint (`pg_constraint` refs 0). Sizes 2.2 to 5.3 MB per index.
- `idx_scan` = 0 for all six. `pg_stat_database.stats_reset` is NULL, but the postmaster started 2026-10-13 18:04 UTC, so a crash restart could have discarded stats. Treat zero scans as weak evidence.
- Status: exact duplicates by definition. Dropping one of each pair is not yet approved. Before any drop: archive the `pg_get_indexdef` output, then drop one index per pair in a reviewed migration.
- Scratch: `.tmp/sve13-dupes.out`.

## TOC update: PostgreSQL btree and pipeline ordering keys (2026-10-13; docs only)

- Updated `docs/atlas/parent-atlas-table-of-contents.md` (hand-written; no generator owns it). Step 3 now records the verified btree and index facts. Added a second owner link for the svelte-check capture script and a "Pipeline sequence and ordering keys" table.
- No `sequence_id` was created. The existing key is `model_analysis_results.sequence_id` (text, btree). The table keeps each stage's own key and forbids a shared counter.
- All links in the diagnostic section were verified to resolve.
- Master TOC (`docs/MASTER-TOC-v2.md`) not regenerated (DOC-GOV-TOC-CHECK-01 drift).

## sequence_id migration check (2026-10-13; read-only; no DDL)

- Repo: `sequence_id` is defined in `sveltekit-frontend/drizzle/manual/model_analysis_runs.sql` (`model_analysis_results.sequence_id text NOT NULL`, PK `(run_id, sequence_id)`, index `model_analysis_results_sequence_idx`) and in `src/lib/server/db/schema/model-analysis-runs.ts`.
- Registry: the manual file is NOT listed in `drizzle/sidecar-migrations.json`. Only `manual/20260916_workspace_event_head_v1.sql` is listed.
- Live DB (`legal_ai_db`, PostgreSQL 18.4): no table matching `model_analysis%`, no column named `sequence_id` in any table, `db_table_inspect` returns `table_not_found`. The migration is NOT applied.
- Live sequence `atlas_agent_action_ledger_sequence_seq` exists with no owning column. Defined in `packages/parent-atlas/src/core/temporal-action-sequence-reservation.ts`.
- Consumers: `modelAnalysisRuns` and `modelAnalysisResults` are referenced only by their schema file. No runtime reader or writer.
- TOC corrected: the model analysis row now states NOT LIVE. My previous entry (btree-indexed in PostgreSQL) was wrong.

## model_analysis migration applied (2026-10-13; operator-approved DDL)

- Applied `sveltekit-frontend/drizzle/manual/model_analysis_runs.sql` in one transaction to PostgreSQL 18.4 `legal_ai_db`. Output: `.tmp/apply-model-analysis.out` (all statements succeeded, COMMIT).
- Created: `model_analysis_runs` (PK `run_id`, 3 btree indexes), `model_analysis_results` (PK `(run_id, sequence_id)`, btree on `run_id` and `sequence_id`). No destructive statements. Both tables empty.
- Verified read-only: column and index definitions match the file; `sequence_id` present; no other `sequence_id` column in the database.
- Registered in `drizzle/sidecar-migrations.json` as `applied`.
- Rollback (if ever needed, owner decision only): `DROP TABLE model_analysis_results, model_analysis_runs;` valid only while both remain empty.
- TOC row updated to LIVE and empty.

## PostgreSQL 18 AIO and bitmap settings (read-only; deferred)

- Current: `io_method=worker` (PostgreSQL 18 default), `io_workers=3`, `enable_bitmapscan=on`, `effective_io_concurrency=16`.
- Not changed. `io_method` requires a server restart and a Linux io_uring check inside the container. That is a separate approved restart, not part of this migration.

## SVE-14 TRACE enrichment parity — partial (2026-10-13; read-only)

- Diagnostics: 291 (from the 317 KB pretty report, parsed by the extended capture owner). Unique source files: 100. All 100 exist on disk.
- Packet resolution via `atlas.packet_search` (`source_ref`, limit 3, one call per file): first pass 92 RESOLVED and 8 TOOL_ERROR. Retry of the 8 succeeded (count 3 each). Final: 100/100 RESOLVED.
- Scope of "RESOLVED": at least one canonical packet row exists for the `source_ref`. This is not lineage proof. `sourceRevision` and file-level digest were not checked. Several sampled packets have null summary.
- Not run in this pass: AST parity (Tree-sitter / ast-grep on the 100 files), `graph.expand_neighborhood` (hung in earlier sessions), dense search (embedding endpoint refused earlier), rerank (`:8099` down).
- Status: partial. The 8 first-pass errors are transient and not reproduced on retry; they are recorded, not hidden.
- Scratch: `.tmp/sve14-files.json`, `.tmp/sve14-resolve.json`.

## SVE-14 AST parity — BLOCKED (2026-10-13; read-only)

- The 100 resolved files are all `.svelte`. The existing ast-grep adapter (`scripts/atlas/lib/ast-grep-symbol-extraction.mjs`) supports only `.ts` and `.js`, and returns symbol names without line spans, so it cannot give enclosing-node parity.
- ast-grep 0.45.3 is installed. A sanity pattern on a `.ts` file returned no matches, so the pattern needs review before reuse.
- No Svelte Tree-sitter grammar is installed (`node_modules` has TS, JS, Go, and Python grammars only).
- Unblock options (decision needed): add a Svelte grammar, or derive script-block spans via the Svelte compiler AST with ast-grep on the `<script>` block only.
- The capture script and spec changed on disk after this session's edits. Re-run this pass: 19 of 19 tests pass.

## AST parity follow-up (2026-10-13; read-only except one extractor fix)

- ast-grep 0.45.3 works on `.ts`. The earlier "no match" came from the body-bearing sanity pattern, not the engine.
- Owner defect fixed: `scripts/atlas/lib/ast-grep-symbol-extraction.mjs` dropped return-typed functions (`function f(x): T { }`). Added a pattern and a regression test. Extractor suite: 5 of 5 pass. Real-file check: `src/lib/server/atlas/tensors/tile-key.ts` now yields `buildTileKey`, `hilbertIndex2D`, `rotate` (previously 0).
- ast-grep on PostgreSQL FTS-extracted content: works on the text, but `search.postgres_fts` returns `content` capped at 4000 characters. Long functions are cut before their closing brace and do not match. AST work must read full files from disk, not FTS chunks.
- Svelte script spans from `svelte/compiler`: work. 99 of 100 files have script symbols (1,486 total).
- Region of the 291 diagnostics: script 0, style 57, template 234. None is in a script block, so script-level AST cannot address any of these warnings. Addressing needs the Svelte template and style spans, which the compiler already provides.
- Scratch: `.tmp/sve14-svelte-parity.json`.

## error_logs diagnostic provenance — DRAFT written, rehearsed, NOT applied (2026-10-13)

- Draft: `sveltekit-frontend/drizzle/manual/20261013_error_logs_diagnostic_provenance_DRAFT.sql`. Adds five nullable columns (run id, log SHA-256, log line, diagnostic code, fingerprint), a stored `message_tsv` tsvector, a partial B-tree on the fingerprint, a partial unique index on (log SHA-256, log line) for idempotent replay, and a GIN on `message_tsv`. Additive only; rollback block included but commented out.
- Rehearsal: run in a transaction ending in ROLLBACK. Exit 0. Afterwards `error_logs` still has 19 columns.
- Registry: `planned_sidecar`, `appliedBy: null`.
- Open before apply: `error_logs` shows 18 normal dependency entries in `pg_depend`. Not yet identified (likely FKs or views). Check them before apply. The stored generated column rewrites the table (1 row now).
- Not done: the Drizzle schema for `error_logs` is unchanged. Writing the .txt observations into the table is a separate step with its own approval.

## error_logs dependency check (2026-10-13; read-only)

- The 18 normal dependencies are: 3 check constraints (`error_logs_confidence_check`, `error_logs_fix_strategy_check`, `error_logs_severity_check`), 13 `_RETURN` rules for view `v_error_logs_fixable`, and 5 for view `v_error_logs_summary`. The draft only adds columns, so none of these should change. The views are created from `drizzle/manual/0041_p1_error_logs_table.sql`.
- Code references to the views: only docs and that migration file. No runtime code reads them.
- Current row counts: `v_error_logs_fixable` 1, `v_error_logs_summary` 1.
- Result: no dependency blocks the draft. Re-check after any change to the view definitions.

## error_logs diagnostic provenance — APPLIED (2026-10-13; operator-approved)

- Applied `sveltekit-frontend/drizzle/manual/20261013_error_logs_diagnostic_provenance_DRAFT.sql` in one transaction (COMMIT). Output: `.tmp/apply-error-logs-provenance.out`.
- Verified read-only: `error_logs` has 25 columns (19 original plus 6 new: five provenance columns and `message_tsv`). New indexes: fingerprint partial B-tree, unique (log SHA-256, log line) partial, GIN on `message_tsv`. Row count 1. `message_tsv` populated for 1 row. Both views (`v_error_logs_fixable`, `v_error_logs_summary`) still return one row.
- Registry: `applied`, `appliedBy: operator-approved-run`.
- Not done: no .txt observations written into the table. That write is a separate step with its own approval.
- Note: the file name keeps the `_DRAFT` suffix. Rename only with the registry entry.

## End-to-end check: svelte-check .txt → PostgreSQL → TRACE → agentic error fixing (2026-10-13; read-only)

| Stage | Result | Status |
|---|---|---|
| Capture and replay (`svelte-check-capture.mjs`) | Spec 20/20 on 3 consecutive runs. One earlier run had 1 failure, not reproduced and not identified. Real 317 KB pretty report: 291 diagnostics, matches checker summary. Run status INCOMPLETE (no capture receipt). | PARTIAL |
| Extraction into `error_logs` | Provenance columns live. Observations not written. `error_logs` has 1 pre-existing row. | NOT RUN (needs approval) |
| Full-text search over diagnostics | No diagnostic rows, so nothing to search. | NOT PROVEN |
| Source resolution | 100/100 files exist; 100/100 have a canonical packet by `source_ref`. Existence only, no revision check. | PARTIAL |
| AST enrichment | 0 of 291 diagnostics in script blocks (234 template, 57 style). Extractor return-type defect fixed; 5/5 pass. Script-level AST cannot address these warnings. | PARTIAL |
| TRACE enrichment | Dense search: embedding connection refused. Rerank `:8099` down. Topology `:8101` down. Graph expansion hangs. | BLOCKED |
| Repair DAG and Kanban | Incomplete run yields 0 tasks, by design. No checksum-matched receipt for the 291-warning report, so promotion is blocked. | BLOCKED |
| Agentic error fixing | `error_signal_stream` has 6 rows, all from 2026-07-04; no current producer. Mapreduce dry-run: 0 signals in the 24 h window; `error_cluster_groups` has 3 rows. Bridge emits proposals only (`AWAIT_OPERATOR`). No execution path or fix-verification test. | NOT RUN end to end |

Gaps, in order of impact:
1. No current producer for `error_signal_stream`. The agentic loop has no live input.
2. No capture receipt for the 291-warning report. Promotion stays blocked until one exists.
3. TRACE dependencies are down: embeddings, rerank, topology, and graph expansion (hangs).
4. No diagnostic rows in `error_logs`. Full-text and fingerprint paths are unexercised.
5. Script-level AST cannot address these warnings. Template and style spans are needed, and they are not in the pipeline.
6. Repair execution does not exist, by design. The TRACE `ops.*` gate is documentation only; `requireToken` accepts any non-empty string (earlier probe). Do not expose it to models or automation.

## 291-observation write to error_logs — BLOCKED on write path (2026-10-13)

- Approved in principle. No write performed.
- Blocker: the TRACE tooling rule requires a registered MCP tool for Postgres access from scripts. No registered tool writes `error_logs`. `kag.ingest_error` (`trace-mcp-server.ts` ~line 4663) stores fingerprints in Redis via `storeErrorFingerprint`, not in PostgreSQL.
- Options: (a) explicit one-off approval for a psql insert, recorded as a rule exception; (b) add a registered TRACE write tool for `error_logs` (code change, then restart); (c) keep observations in the replay `.txt` and JSONL only.
- Constraints for any path: `ON CONFLICT (diagnostic_log_sha256, diagnostic_log_line) WHERE diagnostic_log_sha256 IS NOT NULL DO NOTHING`, one transaction, expected row count 292 (1 existing plus 291), and a checksum readback.

## error_logs indexing — 291 svelte-check observations WRITTEN (2026-10-13; operator-approved one-off insert)

- Source: `docs/reports/svelte-check-all-warnings-errors-2026-10-13.txt`, log SHA-256 `sha256:cdd11a2b…c559`. Parsed by `svelte-check-capture.mjs` (pretty format). Generated SQL: `.tmp/error-logs-insert.sql`; commit output: `.tmp/error-logs-insert.out`.
- Rehearsal in rolled-back transaction: 291 inserted. Commit: 291 inserted. Repeat run: 0 inserted (idempotent via the unique (log SHA-256, log line) index).
- Readback: total rows 292 (1 pre-existing plus 291); observations 291; `message_tsv` populated 291; distinct fingerprints 291.
- Mapping: `error_category=svelte-check`, `severity` ERROR/WARNING (constraint requires uppercase), `file_path` and `line_number` from the log, `source_ref` = `sveltekit-frontend/<file>`, `diagnostic_run_id=svelte-check-2026-10-13`, `diagnostic_code` = Svelte rule id.
- Plans (read-only EXPLAIN ANALYZE): full-text `@@` → sequential scan, 0.85 ms, 20 rows of 292. Fingerprint lookup → index scan on `error_logs_diagnostic_fingerprint_idx`, 0.63 ms.
- Caveat: planner estimates still reflect the 1-row statistics (no ANALYZE run). Run `ANALYZE error_logs` (statistics only, no data change) before judging plan choice.
- AIO: not changed. `io_method=worker`; switching needs a restart and a separate approval.
- Not done: no synthesis, no repair execution, no Kanban tasks. Those depend on a capture receipt for this report.

## Registered TRACE write-tool audit (2026-10-13; static read, no calls)

| Tool | Writes to | Fit for diagnostics or AST/DAG logging |
|---|---|---|
| `ops.record_fix_attempt` | `fix_attempts` | Fix-specific. Operator token accepts any non-empty string. Not a general logger; do not use. |
| `kag.record_agent_run` | agent-run memory (store not verified) | Agent-run artifacts, not diagnostic observations. |
| `graph.materialize_pathway` | `graph_pathway_cards` | Graph pathways only. |
| `kag.ingest_memory_directory` | `context_timeline` | Session context only. |
| `kag.ingest_error` | Redis fingerprint store | Not PostgreSQL. |
| `ops.audit_tool_result` | none (verification) | Read/classify. |
| `atlas.materialize_feature_evidence_tuples` | none (read-only) | Read-only. |
| `phase109a_*` | signal/recommendation store (not verified) | Not checked in this pass. |

Gap: no registered tool writes `error_logs` or any table for AST facts, ts-morph/simdjson analysis, DAG synthesis, or low-rank recommendations.
Proposed (not built): a registered `diagnostics.record_observations` tool that writes `error_logs` with the (log SHA-256, log line) conflict key, defaults to dry-run, caps batches, and returns counts. Separate tools with their own tables would need DDL approval.

## diagnostics.record_observations — built and live-tested (2026-10-13)

- Added to `sveltekit-frontend/src/mcp/trace-mcp-server.ts` (inserted before `atlas.packet_search`). Writes `error_logs` only.
- Safeguards: `dry_run` defaults to true (writes nothing); live writes need `dry_run:false` in the call; max 500 observations per call; one transaction; 30 s statement timeout; `ON CONFLICT (diagnostic_log_sha256, diagnostic_log_line) WHERE diagnostic_log_sha256 IS NOT NULL DO NOTHING`; severity must map to ERROR, WARNING, CRITICAL, or INFO; no `ops.*` token. Does not use the weak operator-token gate.
- Syntax: transpile check 0 diagnostics. Full project `tsc` not run in this pass.
- Restart: TRACE pid 38660 (repo env loaded). `tools/list` shows the tool.
- Tests through MCP: dry-run on 2 real observations → wouldInsert 2, writesPerformed false. Live call on the same 2 → inserted 0, skipped 2. Invalid severity `NOTICE` → refused with `unsupported severity`.
- Table total unchanged after tests (292).
- Not built: AST facts, ts-morph/simdjson analysis, DAG synthesis, low-rank recommendation tables. Each needs its own DDL approval.

## Analysis tables — DRAFT written, rehearsed, NOT applied (2026-10-13)

- Draft: `sveltekit-frontend/drizzle/manual/20261013_diagnostic_analysis_tables_DRAFT.sql`. Three tables: `diagnostic_ast_facts` (structural facts per analyzer, span-aware identity), `diagnostic_dag_runs` (one per log checksum), `diagnostic_recommendations` (ranked proposals; status defaults to PROPOSED). Keys are text checksums and fingerprints. No bulk vectors. Low-rank factors are referenced as artifacts only.
- Rehearsal: rolled-back transaction, exit 0. No `diagnostic_*` tables remain.
- Registry: `planned_sidecar`, added to the `sidecars` array.
- Not done: apply, the MCP tools that write these tables, and the DAG synthesizer. Each needs its own approval.

## Analysis tables — APPLIED (2026-10-13; operator-approved)

- Applied `sveltekit-frontend/drizzle/manual/20261013_diagnostic_analysis_tables_DRAFT.sql` in one transaction (COMMIT). Output: `.tmp/apply-analysis-tables.out`.
- Verified: three `diagnostic_*` tables exist; row counts 0, 0, 0. Writers do not exist yet.
- Registry: `applied`.
- Rollback (owner decision only, valid while empty): `DROP TABLE IF EXISTS diagnostic_recommendations, diagnostic_dag_runs, diagnostic_ast_facts;`
- Not done: MCP write tools for these tables, DAG synthesizer, low-rank computation.

## diagnostics.record_analysis — built and rehearsal-tested (2026-10-13)

- Added to `trace-mcp-server.ts` (before `atlas.packet_search`). Writes `diagnostic_ast_facts`, `diagnostic_dag_runs`, and `diagnostic_recommendations` (applied 2026-10-13).
- Safeguards: `dry_run` defaults to true and runs the inserts in a transaction that ROLLS BACK. `dry_run:false` commits. Recommendations always insert as PROPOSED (status not accepted from input). Fixed analyzer and method enums; spans validated; JSON payloads capped at 8000 bytes; max 500 items per array; `ON CONFLICT DO NOTHING` for idempotency; no `ops.*` token.
- Restart: TRACE pid 39848. Both `diagnostics.record_observations` and `diagnostics.record_analysis` are registered.
- Tests through MCP: (A) full dry run → wouldInsert astFacts 1, dagRuns 1, recommendations 1, writesPerformed false. (B) analyzer `grep` → refused by schema validation. (C) recommendation for a missing DAG run → foreign key refused, writesPerformed false.
- Table counts after tests: 0, 0, 0. No live committed write has been made to these tables; the commit path is untested for this tool.

## Diagnostic analysis producer and wiring (2026-10-13)

- Producer: `scripts/atlas/diagnostics-analysis-v1.mjs`. Builds AST facts (Svelte compiler region per diagnostic: script, style, or template), a flat per-file DAG, and rule-based PROPOSED recommendations. Writes `.tmp/diagnostic-analysis-payload-v1.json`. No database access in the producer.
- Output: 291 AST facts (234 template, 57 style, 0 script); DAG nodes 100, edges 0; 291 recommendations.
- Wiring: MCP tool `diagnostics.record_analysis`, dry-run (rehearsal, rolled back). Result: wouldInsert astFacts 291, dagRuns 1, recommendations 291; writesPerformed false. Tables remain 0, 0, 0.
- Commit (real write) requires `--wire --commit` and explicit approval. Not run.
- Gaps: the DAG has no dependency edges (flat). Recommendations are rule text, not analysis. Script-region AST is empty for this report. Low-rank and LLM synthesis are not implemented.

## Verification review (2026-10-13) — corrections

- Packet resolution: the earlier "final 100/100" was true only from ad-hoc retries. The recorded results file was stale (8 errors). A fresh first pass gave 9 TOOL_ERROR and 91 RESOLVED, so `atlas.packet_search` fails intermittently at about 8–9%. Retry rounds then resolved all 100. `.tmp/sve14-resolve.json` now records the retry outcome (`retryRound`). Treat the first-pass error rate as the real figure.
- Verified true at review time: error_logs 292 rows, 25 columns, 291 diagnostic observations, 291 distinct fingerprints, no NULL `message_tsv`; analysis tables 0/0/0; model analysis tables present; atlas_packets duplicate index pairs still present (6 indexes); TRACE lists `diagnostics.record_observations`, `diagnostics.record_analysis`, `atlas.packet_summary_census`; registry statuses applied, applied, applied for the three applied migrations.
- Verified true: capture spec 20/20; extractor 5/5; error-signal spec 8/8; svelte parity summary (291 diagnostics: script 0, style 57, template 234; 99 of 100 files with script symbols); `tile-key.ts` yields buildTileKey, hilbertIndex2D, rotate.
- Unexplained: one earlier capture-spec run failed once (1 of 20). Not reproduced in four later runs.
- Not verified in this review: full project `tsc` (not run); the `diagnostics.record_observations` live write path beyond the idempotent re-run.

## atlas.packet_search intermittent errors — root cause and DRAFT index (2026-10-13)

- Reproduction: 40 files, 38 OK, 2 tool errors, both `canceling statement due to statement timeout`.
- Cause: the source_ref lookup uses `lower(source_ref) = ANY(...)` and `LIKE` prefix predicates. Existing B-tree indexes on `source_ref` cannot serve them, so each call sequentially scans ~61.7k rows (EXPLAIN: 260 ms, cold reads). Under load this exceeds the timeout.
- Fix (DDL, not applied): `sveltekit-frontend/drizzle/manual/20261013_atlas_packets_source_ref_pattern_indexes_DRAFT.sql` adds `text_pattern_ops` indexes on `lower(source_ref)` and `source_ref`.
- Rehearsal: exit 0; indexes absent afterward. Inside a rolled-back transaction the planner uses a bitmap index scan: 0.76 ms vs 260 ms.
- Registry: `planned_sidecar`.
- Also noted (not changed): `source_ref` has three duplicate btree indexes (`idx_atlas_packets_source_ref`, `idx_atlas_packets_source_ref_idx`, `idx_packets_source_feature_multi_hop` overlaps). Dedupe needs separate approval.
- Apply requires approval. Plain CREATE INDEX blocks writes to atlas_packets during the build.

## source_ref pattern indexes — APPLIED (2026-10-13; operator-approved)

- Created `atlas_packets_source_ref_lower_pattern_idx` and `atlas_packets_source_ref_pattern_idx` with `CREATE INDEX CONCURRENTLY` (no write lock). Both `indisvalid = true`.
- Live EXPLAIN: Bitmap Index Scan on the new indexes; about 0.1 ms for the failing file's lookup (was about 260 ms seq scan).
- Re-run of the 40-file reproduction: 40 of 40 OK (previously 38 of 40, with 2 statement timeouts).
- Registry: `applied`. The registry write failed twice from Node with a Windows file-open error; it succeeded through the edit tool after the file was readable again.
- Rollback (owner decision only): `DROP INDEX CONCURRENTLY IF EXISTS atlas_packets_source_ref_lower_pattern_idx, atlas_packets_source_ref_pattern_idx;`
- Not changed: duplicate source_ref btree indexes.

## atlas_packets duplicate indexes — DRAFT defined, rehearsed, NOT applied (2026-10-13)

- Exact-duplicate groups (definition equal after removing the name; none unique or constraint-backed): 10 groups, 20 indexes. Keep the index with more scans; drop the other.
- Keep/drop: `atlas_packets_metadata_gin_idx` keep, `idx_atlas_packets_metadata_gin` drop; `idx_atlas_packets_community_id` keep, `_community_id_idx` drop; `_domain_class` keep, `_domain_class_idx` drop; `_feature_id` keep, `_feature_id_idx` drop; `idx_atlas_packets_packet_key_idx` keep (150,007 scans), `idx_atlas_packets_packet_key` drop; `idx_atlas_packets_payload_gin_pathops` keep, `_payload_path` drop; `idx_atlas_packets_som_index` keep, `_som_index_idx` drop; `idx_atlas_packets_source_ref` keep, `_source_ref_idx` drop; `idx_atlas_packets_tags` keep, `_tags_gin` drop; `idx_packets_source_feature_multi_hop` keep (400,716 scans), `idx_atlas_packets_source_feature` drop.
- Note: the unique `atlas_packets_packet_key_key` is not in any group and stays.
- Archive: `.tmp/atlas-packets-duplicate-indexes-manifest.json` (20 definitions, sha256 each).
- Draft: `sveltekit-frontend/drizzle/manual/20261013_atlas_packets_duplicate_indexes_DROP_DRAFT.sql`. Rehearsal: 94 indexes to 84 inside the rolled-back transaction, 94 after rollback.
- Registry: `planned_sidecar` (edit-tool write; node writes to this file failed with a Windows file-open error).
- Apply requires approval. Use the CONCURRENTLY form for apply.

## Origin check: idx_atlas_packets_source_ref_idx (2026-10-13)

- Not created by this session. My indexes are `*_pattern_idx` (applied 2026-10-13).
- Declared in `sveltekit-frontend/drizzle/schema.ts` (`index("idx_atlas_packets_source_ref_idx").using("btree", table.sourceRef...)`). First commit touching that declaration: `6c41beff70`, 2026-07-29 (file last changed `df9fed6ce0`, 2026-09-07). Also listed in `docs/reports/atlas-packets-schema-audit.md` (generated 2026-10-11).
- No SQL migration file creates this exact name; it came from the Drizzle schema.
- Consequence for the duplicate-index draft: dropping any duplicate listed in `schema.ts` without updating the schema makes Drizzle recreate it on the next push or generate. The same applies to the other nine drops. Update `schema.ts` in the same change before applying.

## Decisions pending (collected 2026-10-13)

| # | Decision | Status | Where recorded |
|---|---|---|---|
| 1 | Apply the 10 duplicate-index drops, with matching `schema.ts` edits | Waiting | Duplicate indexes section above |
| 2 | Commit the diagnostic analysis payload (291 AST facts, 1 DAG, 291 recommendations) via `--wire --commit` | Waiting; dry-run rehearsal passed | Diagnostic analysis producer section |
| 3 | Run `ANALYZE` on `error_logs` and `atlas_packets` so planner estimates match current data | Waiting | error_logs indexing section |
| 4 | Add Svelte template and style spans to the pipeline (none of the 291 is in script) | Waiting | AST parity sections |
| 5 | Harden the TRACE `ops.*` token gate (currently accepts any non-empty string) | Waiting | Gate notes, end-to-end check |
| 6 | Identify the one-off failure in the capture spec (1 of 20, not reproduced) | Open | Verification review |

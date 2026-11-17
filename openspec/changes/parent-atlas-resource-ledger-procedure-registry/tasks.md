# Tasks: Resource ledger (CPU / GPU / RAM / disk) and agentic procedure registry

Status vocabulary: `CREATED`, `WIRED`, `PARTIAL`, `PROVEN`, `BLOCKED`, `DONE`. A checked box needs a receipt path, not a status note.

## Why (evidence from the rg sweep, 2026-11-14)

- **No CPU/GPU/RAM/disk map exists.** The closest things are plans, not live data:
  - `docs/architecture/parent-atlas-workstation-compute-fabric.md` §2 budgets Ornith at about 6,900 MiB of the 8,192 MiB card (about 1,200 MiB headroom). It is a plan, not a measurement.
  - `docs/master_feature_todo_1011.md` §5 and §9 record disk readings as point-in-time values (C: about 6.7 GiB free on 2026-10-12, 12 GB after cleanup). No RAM figures are recorded anywhere.
  - Live reads on 2026-11-14: RTX 3060 Ti 1,393 MiB used / 6,632 MiB free (`:8090` apparently not loaded); host RAM 31.9 GB total, about 1.9 GB free; i7-11700F, 8 cores / 16 threads.
- **GPU status tools already exist, but only for the GPU.** `gpu_vram_status` (READ) and `gpu_request_vram_release` (WRITE request record, no stop) are registered in `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs`. Nothing covers RAM, disk, or per-process attribution.
- **`procedure_id` is a grouping key over many actions.** `scripts/atlas/openai_facade_materializer_v1.py:293` sets `procedure_id = "proc_atlas_dag_" + cluster_id:04d` on every tool call in a batch. One procedure therefore holds many actions, one per `task_ordinal`, each with its own `task_id` (ULID), `sequence_id`, and `final_score`. Its members are Louvain-cluster tasks that fan out from `materialize_tool_calls`.
- **What is missing is the container and the run.** Nothing records a procedure as an object: no member list, no status, no resource use, no run boundary. The action `task_id` is deterministic (`generate_task_ulid` hashes ordinal, Morton code, and cluster), so re-materializing the same ordinals gives the same IDs. The only per-run value is the random `completion_ulid` on the chat envelope. So two runs over the same cluster cannot be told apart, and resource use cannot be attributed to a procedure or an execution.
- **Disk is the recurring failure.** Pending, not yet approved (master todo §6 item 5): Docker builder prune (about 13.5 GB), image prune (about 21.7 GB), npm/uv cache clean, and VHDX compaction. Qdrant holds about 5.17 GB in snapshots, and 28 non-current collection directories (about 7.4 MB) remain. `.svelte-error-fixes-backup` and two `deeds_labs/archive` snapshots are distinct, not duplicates, so they must not be removed as duplicates.
- **RAM failure is observed.** `docs/reports/library-pdf-ingestion-gap-review-20261112.md:139`: `npm run check:native` failed with `VirtualAlloc ... errno=1455` and a Go out-of-memory error. No RAM budget or preflight check gates that command.

## Owners (do not add a second owner)

| Capability | Existing owner | Rule |
|---|---|---|
| GPU residency executor | `sveltekit-frontend/python/parent_atlas_tensor/gpu_resident_executor.py` | Extend, do not duplicate |
| VRAM status / release request | `scripts/mcp/atlas-tools-mcp.mjs` (`gpu_vram_status`, `gpu_request_vram_release`) | Extend the READ tool; the release tool stays a request record |
| Agentic workflow audit | `scripts/atlas/audit-parent-atlas-mcp-agentic-workflow-v1.mjs` | Verifier for the procedure registry |
| Service lifecycle (`:8090`, Docker, Ollama, Postgres, Qdrant, Neo4j, Valkey) | Human-operated VS Code tasks; agent restart only under the CLAUDE.md gates | No agent stop/start from this change |
| Disk cleanup | Operator approval, archive-not-delete (`docs/archive-manifest.json`) | No prune, delete, or VHDX compaction without approval |

## Phase 0: Ownership and decisions (read-only)

- [ ] **RLM-0.1** Confirm no other RAM or disk probe exists: `rg -n "FreePhysicalMemory|Win32_OperatingSystem|get-psdrive|statfs" scripts sveltekit-frontend/scripts packages python`. Record hits or "none".
- [ ] **RLM-0.2** Confirm the model with the operator: `procedure_id` = container of many actions; each action = one tool call with its own `task_id`. Decide (a) whether a run needs its own `execution_id` that groups the procedure's actions for one execution, and (b) whether `procedure_id` stays cluster-derived or becomes an explicit registry key. Record the decision in this file. Until decided, no code may assume `procedure_id` identifies a single run.
- [ ] **RLM-0.3** Confirm the ownership table above with the operator (one reply).

## Phase 1: CPU / RAM / process snapshot (read-only)

- [ ] **RLM-1.1** Define the snapshot schema (JSON, `schemaVersion`, `capturedAt`, `host`, `gpu`, `wsl`, `disk`, `processes`). Each value carries its source command and its unit.
- [ ] **RLM-1.2** Write `scripts/atlas/resource-ledger-snapshot-v1.mjs`: read-only, writes one exclusive-create receipt under `.tmp/atlas/resource-ledger/`. It writes no database rows and starts or stops nothing.
- [ ] **RLM-1.3** Host RAM and CPU from `Win32_OperatingSystem` and `Win32_Processor`. Top 15 processes by working set.
- [ ] **RLM-1.4** Attribute listening ports to processes with `Get-NetTCPConnection -LocalPort` (never by process name). Map the known ports (5173, 8088/8090, 8095, 8097, 8098, 8100, 8121, 8788, 8791, 5434, 6333, 6379, 11434) to their owner from CLAUDE.md.
- [ ] **RLM-1.5** Read WSL memory from inside Ubuntu (`free -m`) and the `.wslconfig` memory cap, if one is set. Use `MSYS_NO_PATHCONV=1 wsl -d Ubuntu --exec ...`.
- [ ] **RLM-1.6** Smoke: run the snapshot three times over a working session. Record min/max free RAM and VRAM. Receipt path goes in the task.

## Phase 2: Disk map (read-only)

- [ ] **RLM-2.1** Measure C: free space and the largest consumers: `docker_data.vhdx`, WSL `ext4.vhdx`, Qdrant storage (`/qdrant/storage`), Postgres volume, `.tmp/`, `deeds_labs/archive/`, `node_modules`, `.svelte-error-fixes-backup/`. Use bounded `Get-ChildItem` sums, not unbounded recursion.
- [ ] **RLM-2.2** Qdrant: reconcile the API-visible snapshot total (about 5.17 GB) with the on-disk total. List the 28 non-current directories by name only. Do not delete any.
- [ ] **RLM-2.3** Produce a prioritized cleanup manifest with size, owner, and "approved / not approved" per item. Include Docker prune, image prune, npm and uv cache, and VHDX compaction. Mark every item `NEEDS_APPROVAL`.
- [ ] **RLM-2.4** Duplicate screen: finish the prioritized hash comparison of the 119 backup/archive/copy/old/snapshot paths named in master todo §9. Report only proven duplicates. The earlier traversal timed out, so cap it by directory list.

## Phase 3: GPU per-process map

- [ ] **RLM-3.1** Add per-process VRAM to the snapshot: `nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv`. Map each PID to its port owner from RLM-1.4.
- [ ] **RLM-3.2** Reconcile the planned Ornith budget (fabric doc §2: about 6,900 MiB) against the measured value when `:8090` is up. Record both numbers; do not overwrite the plan.
- [ ] **RLM-3.3** Extend the existing `gpu_vram_status` READ tool with the per-process fields. Do not add a second VRAM tool.
- [ ] **RLM-3.4** Confirm the WSL RAPIDS job gate: the operator's "GPU: Prepare cuVS KMeans" task must have run, and the receipt must show `:8090` stopped and free VRAM at or above `KMEANS_MIN_FREE_MIB`.

## Phase 4: Preflight gates (before heavy work)

- [ ] **RLM-4.1** Define thresholds, measured not assumed: minimum free RAM and free VRAM for the `npm run check` full gate, the native build, and KMeans. Use the 2026-11-12 errno 1455 case as the RAM reproduction.
- [ ] **RLM-4.2** Implement a preflight function that returns `PASS` or `BLOCKED` with the measured values. It fails closed. It is called by the heavy scripts; it does not start or stop anything.
- [ ] **RLM-4.3** Cap Node heap for the full check (`NODE_OPTIONS=--max-old-space-size=...`) only after RLM-4.1 measures a value. Record the measured value in the receipt.
- [ ] **RLM-4.4** Disk preflight: block writes that need more than a set margin when C: free space falls below the RLM-2.3 threshold. Warn before that.

## Phase 5: Agentic `procedure_id` registry

- [ ] **RLM-5.1** Write the registry contract after RLM-0.2 is decided. Two tables or objects: a **procedure** (`procedure_id`, `cluster_id`, member list of `task_id`s, `owner`, `resource_class` (`cpu` | `gpu` | `ram-heavy` | `disk-heavy`)) and an **action** (`task_id`, `procedure_id`, `sequence_id`, `execution_id`, `status`, `source_ref`, `packet_key`, receipt path). A procedure is never a join key on its own; actions join on `task_id` plus `source_ref` and `packet_key` per the CLAUDE.md lineage rules.
- [ ] **RLM-5.2** Change `materialize_tool_calls` (`openai_facade_materializer_v1.py`) to emit `execution_id` for each call, and a procedure member list, keeping `procedure_id` and the existing fields so consumers do not break. Fixture tests: (a) two runs over the same cluster give the same `procedure_id` and different `execution_id`; (b) the procedure's member list equals the set of `task_id`s it materialized; (c) re-materializing the same ordinals keeps the same `task_id`s (determinism stays).
- [ ] **RLM-5.3** Add the registry check to `audit-parent-atlas-mcp-agentic-workflow-v1.mjs`: every tool call in a run has an `execution_id`, a `resource_class`, and a receipt.
- [ ] **RLM-5.4** Receipt per run: `writesPerformed` (must be `false` for the read-only tools), resource snapshot before and after, and the registry row count.

## Phase 6: Acceptance

- [ ] **RLM-6.1** One end-to-end run: snapshot, preflight, one heavy step (for example `npm run check`), snapshot again. The receipt shows RAM and VRAM before and after and the decision that was made.
- [ ] **RLM-6.2** Operator decisions recorded in this file: `procedure_id` semantics (RLM-0.2), disk cleanup items approved or refused (RLM-2.3), RAM thresholds (RLM-4.1).
- [ ] **RLM-6.3** Update `docs/master_feature_todo_1011.md` §5, §6 and §9 by pointing them at this change's receipts. Do not edit the master file's status claims without receipts.

## Not in scope

- Docker prune, image prune, VHDX compaction, or any volume change (needs explicit approval, RLM-2.3).
- Starting or stopping `:8090`, Docker, Ollama, Postgres, Qdrant, Neo4j, or Valkey.
- Any database write. Snapshots and registry receipts go to `.tmp/` and `docs/reports/` only.
- Changing the GPU residency executor's behaviour. This change only observes it.

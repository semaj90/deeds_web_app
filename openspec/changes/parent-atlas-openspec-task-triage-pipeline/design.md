## Context

The repository already has a large advisory OpenSpec Workboard, an evidence-fabric audit, a workstation projection/context adapter, low-rank challengers, and a challenger tournament. The current checked-in Workboard snapshot is dated 2026-09-26, while OpenSpec changes continued through 2026-10-03; its population and ordering must therefore be regenerated from revision-bound `tasks.md` inputs before use. The existing Workboard is explicitly not a scheduler authority. The Workboard Feature Utility Fabric and workstation synthesis changes are in progress/complete respectively and own reusable ranking, dependency, context, and Ornith contracts; this change composes those owners rather than creating parallel ones.

WB-COMPACT-01 emits a compact read-only census from the existing Workboard builder's stdout snapshot; it validates current task-ledger hashes without writing a second full-sized Workboard. WB-COMPACT-02 now compiles `TaskCardV1` by exact source coordinate plus block hash and logical identity against a fresh in-memory evidence-fabric census. The builder's lexical supersession label remains a review candidate; confirmed supersession stays zero until an exact successor edge and current reviewed receipt agree. TaskCard fields separately represent checkbox state, evidence proof state, and retrieval review state; authority and mutation remain false.

Report manifests are metadata-first: the builder reuses a prior checksum only when size and modification time match, labels that result as a prior-audit cache hit, and hashes only changed reports at or below 10,000,000 bytes. A changed larger report remains unhashed and review-required. Report-to-task joins, sensitivity, replay, and archive eligibility remain unassessed; all local sources are retained. The joined triage corpus exposes heuristic supersession only as an unconfirmed review candidate and keeps history states opt-in. Neither artifact currently activates semantic retrieval, a ranking tournament, cache routing, or archival.

The first retrieval adapter is deliberately an OpenSpec lifecycle filter over the revision-bound triage corpus. It returns a bounded prefix in the existing compiled order, excludes historical states unless `--history` is supplied, and declares that no ranker ran. It is not semantic query retrieval and does not replace the existing Workboard/tournament ranking owner.

The KMeans owner already exists at `sveltekit-frontend/scripts/atlas/kmeans-chunk-cluster.py` and in the WSL `atlas-rapids-cu13` cuML environment. Reuse it only after compact TaskCards stabilize; do not add PyTorch KMeans. PyTorch remains a possible later learned-ranker/low-rank tool. TurboVec is an in-memory challenger for the small current TaskCard/evidence-summary set, not the raw archive. Benchmark simdjson only on metadata JSON/JSONL, never vectors or Arrow tensors.

## Goals / Non-Goals

**Goals:**
- Rebuild an incremental, bounded candidate population from current task ledgers and daily Graphify receipts, bound to exact source checksums and workspace/run revisions.
- Separate task claims, evidence state, lifecycle classification, ranking, user selection, archival eligibility, and storage/cache projections.
- Surface a small next-work queue with explainable evidence, blockers, supersession candidates, and bounded context.
- Preserve large raw outputs outside the repository only after separately authorized SeaweedFS copy, checksum verification, independent readback, and an archive receipt.
- Keep the initial parser/ranker path CPU/Node-compatible and fail closed when optional NLP/model/GPU/cache/archive services are unavailable.

**Non-Goals:**
- Editing `tasks.md`, closing tasks, suppressing tasks as superseded, or automatically selecting/dispatching implementation work.
- Treating a stale TODO document, checked box, model output, feature vector, cache hit, centroid, TurboVec result, or tournament winner as proof or canonical task state.
- Installing WSL packages or enabling CUDA/PyTorch as part of this change.
- Introducing another retrieval lane, task database, embedding authority, RRF/fusion owner, or general-purpose agent runtime.
- Archiving source task ledgers or deleting local evidence.

## Decisions

1. **`tasks.md` remains the task-claim source; projections are rebuildable.** Snapshot each relevant file's repository-relative path, byte checksum, workspace revision, task block checksum, and source span. A current-snapshot manifest identifies the exact population. Stale generated Workboards are inputs only for comparison and are never merged as if current.

2. **Reuse the existing evidence and Workboard owners.** Run the existing OpenSpec task/evidence audit, Workboard builder, workstation projection, and tournament against one frozen population. Do not create another board or scheduler. The explicit scheduler selection file remains the only selection permission; ready/actionable status remains advisory.

3. **Treat supersession and staleness as separate review states.** Resolve explicit successor/supersedes references and source revisions deterministically. Similar wording, embeddings, file age, absence, or model summaries can create review candidates but cannot close or hide a task. Ambiguous or unresolved lineage remains visible as `REVIEW_REQUIRED` or `STALE_REFERENCE`.

4. **Stream and chunk by task boundary before model context.** Parse Markdown in bounded streams, preserve task/source spans, and emit bounded JSONL observations. Chunk around individual task blocks plus only required change-level context; never load the full ledger corpus into a prompt. `simdjson` may optimize a later measured JSONL bottleneck, but is not required for the baseline.

5. **Compact before semantic or centroid retrieval.** WB-COMPACT-01 census precedes TaskCard contracts; TaskCard embeddings precede KMeans/centroid routing. EmbeddingGemma task embeddings, Graphify relations, TurboVec prefilters, cuML centroid/KMeans, and low-rank/learned rankers are optional challengers over the identical frozen compact population. Centroids only route shortlist candidates; exact rerank/tournament remains the existing owner, with no scheduler permission.

6. **Keep extraction and synthesis evidence-bounded.** LangExtract/DAG extraction may propose structured dependencies, acceptance evidence, and summaries only with exact task/evidence references. Ornith `ornith-1.5-9b` via the existing llama-server resolver may summarize selected evidence cards after deterministic filtering. Model failure or missing references yields an incomplete card, not inferred completion or fallback promotion.

7. **Use Redis/Valkey only after the compact corpus exists.** Route current TaskCards through revisioned centroid cards (`centroid:openspec:retrieval`, `identity`, `gpu`, `ui`) and cache bounded IDs/card references under source, Graphify/evidence, embedding/ranker, and policy revisions. Centroids are hints only; misses/unavailable/stale entries fall back to deterministic retrieval. Daily Graphify deltas dirty only tasks whose declared read/write sets intersect changed sources; re-embed only those cards and invalidate affected centroid hints.

8. **Make SeaweedFS archival a distinct gated lifecycle.** The first tranche emits an archive plan only. A later, explicitly authorized adapter may copy eligible derived run outputs, then must verify object checksum and independent readback and write a revision-bound archive receipt before changing any disposition. Until that gate passes, preserve source and local files. Repo-tracked summaries/manifests remain compact and below 10,000,000 bytes per file.

9. **Prove acceleration before adoption.** The initial path uses Node and deterministic CPU behavior. Reuse cuML KMeans in the existing `atlas-rapids-cu13` environment after compact cards exist. PyTorch is not a second KMeans owner; reserve it for later learned ranker/low-rank work. simdjson is optional and measured only on metadata JSON/JSONL. No environment installation is included here.

10. **Compress only reviewed supersession.** A confirmed superseded task becomes one compact card with successor task, exact replacement reason, last valid revision, archive manifest, and `seaweedfs://` raw pointer. Do not remove old task/report artifacts until references, replay needs, sensitivity, source/canonical status, and archive readback are reviewed. Default retrieval includes `CURRENT`, `WAITING`, and `REVIEW_REQUIRED`; `SUPERSEDED` and `HISTORICAL` require an explicit history/debug query.

11. **Keep storage tiers distinct.** Valkey holds hot current-card pointers/routing; Postgres owns canonical task/evidence state and Qdrant is a warm rebuildable semantic projection; SeaweedFS holds cold immutable blobs; `.okf` holds schemas, manifests, compact receipts, pointers, and corpus revisions. The census and tracked reports remain below 10,000,000 bytes each.

## Risks / Trade-offs

- [OpenSpec ledgers contain legacy duplicate IDs and ambiguous lineage] → preserve source spans/checksums, emit ambiguity for review, and do not infer canonical identity from a title or ordinal.
- [Semantic similarity can incorrectly imply supersession] → use similarity only to nominate pairs; require an explicit successor reference or reviewed supersession receipt to change lifecycle state.
- [One daily Graphify run can be stale or incomplete] → bind every candidate to that run's exact revision/checksum and expose missing/failed producer receipts; never substitute yesterday's report silently.
- [Cache/centroid keys may outlive source revisions] → include all dependency revisions and fail closed on exact-key mismatch; cache remains rebuildable.
- [Archival can strand or corrupt the only raw copy] → keep local sources until verified SeaweedFS readback plus receipt; no delete/move in the plan-only phase.
- [Embedding/model/WSL dependencies add operational weight] → treat them as optional challengers; maintain a useful CPU/Node baseline and report actual capability state.

## Migration Plan

1. Capture a fresh, read-only baseline from current `tasks.md` files and latest available Graphify/evidence receipts; record exact revisions and reconcile stale Workboard snapshots.
2. Implement and replay the bounded parser, task identity, lifecycle, and evidence joins on fixtures before wiring optional retrieval or models.
3. Add task-specific embedding/retrieval and shadow tournament comparison over a frozen cohort; evaluate against human-reviewed labels without granting selection permission.
4. Add revision-keyed cache in read-only/audit mode, then a plan-only SeaweedFS archive inventory. Live cache/archive writes require separate authorization and verified receipts.
5. Roll back by disabling the daily adapter and discarding derived caches/manifests; canonical task ledgers and source reports remain unchanged.

## Open Questions

- Which exact existing Graphify daily receipt is the authoritative trigger/source revision for the task pipeline? Confirm from the live runner before wiring.
- Which model endpoint/revision currently serves EmbeddingGemma 768 for task text, and is task-specific indexing already measured? Do not infer this from code presence.
- Is there a verified SeaweedFS object-copy/readback adapter and archive receipt owner to reuse, or should this proposal stop at archive-plan output?
- Which manually reviewed task pair set will serve as the held-out relevance/supersession evaluation cohort?
- If GPU KMeans later earns a challenger slot, which pinned WSL Python environment and compatible CUDA/cuVS/PyTorch versions are supported?

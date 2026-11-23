# Agentic Error-Fix Vertical Slice — 2026-11-22

## Scope and result

Implemented four local handoff seams in the existing classifier lane:

1. Training and sidecar inference now call the same centroid-distance feature
   helper, including a count of successfully embedded chunks.
2. The v2 FastAPI facade now exposes the existing classification proposal route
   used by the sidecar process.
3. An authenticated SvelteKit task-ingress route now accepts only a task key,
   resolves current task text/revisions through the existing workboard reader,
   sends that verified snapshot to the sidecar, validates the source-bound
   proposal, and re-resolves the task before returning it.
4. The route invokes the existing deterministic domain taxonomy and OKF adapter
   to emit a task-domain tuple proposal bound to the task block hash and source
   span. It remains derived and proposal-only.

The result remains proposal-only. This is not an end-to-end authorized repair.

## Evidence

- `python/tests/test_domain_classifier_runtime.py` and
  `python/tests/test_nlp_sidecar_v2_classification.py`: **9 passed** under
  Python 3.13.
- `src/routes/api/atlas/openspec/classify-task/server.route.spec.ts`: **4 passed**.
  Cases cover successful task-derived input, revision change during the call,
  unauthenticated/completed-task rejection, and mismatched sidecar source.
- A read-only query of `codebase_chunk_index` for the classifier-sidecar
  `tasks.md` source returned **0 rows**. The task cannot be represented as a
  candidate in the existing codebase index yet; no synthetic candidate or ACE
  manifest was created.
- Full `npm run check` did not finish after more than two minutes without new
  diagnostics and was interrupted; typecheck is therefore not claimed.
- Route checks cover proposal shape/source echo, missing source-revision
  rejection, and resistance to caller-supplied `canonicalAuthority` and
  `writesPerformed` flags.
- `openspec validate parent-atlas-search-classifier-sidecar --strict`: valid.
- `git diff --check`: exit 0; output contained existing line-ending notices
  across the already-dirty worktree.
- `node scripts/atlas/gan-validation-hook.mjs`: PASS; census 348 tasks, 69 done,
  61 partial, 218 open. This is a repository census, not proof that this feature
  is done.
- WSL2 RAPIDS environment import probe: Python 3.14.6, CUDA available,
  cuDF 26.06.01, cuML/cuVS/cuGraph 26.06.00. WSL2 cuTile environment import
  probe: Python 3.14.6, CUDA available, `cuda.tile` importable.
- The checked-in trainer's `--help` completed under the WSL2 RAPIDS Python
  against the mounted Windows checkout. This confirms command/import
  compatibility only; it did not fetch labels/embeddings or train.
- WSL GPU telemetry: RTX 3060 Ti, 8,192 MiB total, 7,174 MiB used, **851 MiB
  free**. The repository's KMeans run requires at least 1,536 MiB free, so CUDA
  fitting was correctly not attempted.
- Read-only `:8095` health and OpenAPI probes succeeded. The live app reports
  `ornith-1.5-9b`; `/classify` is absent from its OpenAPI paths, and its loaded
  module hashes differ from local source. No service restart was performed.

## Still open

- Prove the Svelte route against the deployed sidecar after its operator-managed
  update. Current route resolves source/task revisions but only proves signed-in
  app access; organization/workspace ACL semantics remain to be confirmed.
- Bind the proposal and an admitted ontology tuple to the exact task revision
  and supporting source span. The route now emits an exact-revision OKF domain
  tuple proposal; OAK ontology admission remains outstanding.
- Admit only verified source/document packets to ACE and independently verify
  the resulting ContextManifest.
- Deploy the changed `:8095` source and read back its checkpoint after the
  operator-managed lifecycle step. The reachable process is running different
  source; no checkpoint was read or changed.
- Run the documented GPU admission gate before attempting CUDA fitting.
- Prove reviewer-approved bounded repair, targeted validation, and independent
  receipt readback. No task repair or receipt write was performed.
- The annotation's browser worker → binary decode → Three.js buffer path belongs
  to `crime-scene-reconstruction`; this classifier-sidecar change does not prove
  that renderer workflow.

## Status

`PROPOSAL_ROUTE_WIRED_AND_FIXTURE_PROVEN`; authorized source admission, ACE
context admission, deployed service, CUDA execution, approved repair, receipt
readback, and browser rendering remain unproven. No OpenSpec task was marked
complete based on this report.

# TRACE MCP Audit Findings

Findings from the audit requested at the start of this change (task 3), recorded here rather than
in tasks.md since they're a standalone deliverable, not a checklist item.

## (a) Missing domain-classification tool — confirmed, now fixed

Live grep against `sveltekit-frontend/src/mcp/trace-mcp-server.ts` (118 `server.registerTool(...)`
calls, verified before this change) covered graph search (`graph.*`), cluster sub-search
(`clusters.*`), topK KNN (`ops.gpu_topk`), HypergraphRAG (`hypergraph.*`), taxonomy (`taxonomy.*`),
and ontology-linked tuples (`atlas.pos_concept_tagging`) — but no domain-classification tool
existed. Fixed in this change: `domain.classify`, registered and live-proven (see tasks.md task
3.3).

## (b) `miniforge.*` tools remain reachable-but-coarse

TRACE's `miniforge.analyze`/`miniforge.extract` expose `extractionMode: entities|relationships|
concepts|full` and now `passes` (including the new `classify`), but there is no per-pass-only
invocation shape distinct from the full `/analyze` envelope — a caller always gets back the entire
`AnalyzeResponse` (entities, relationships, chunks, features, pass_results, control5, experiment
feature matrix, event hypergraph) even when only one pass's result is wanted. `domain.classify`
(this change) works around this narrowly by unwrapping just the `classify` pass_result before
returning — but that's a per-tool workaround, not a general solution. The general fix is
`parent-atlas-nlp-sidecar-feature-compiler` task 11.1's proposed coarse-grained ACP tools
(`analyze_structural`, `analyze_semantic_card`, `rerank_candidates`), which remain open — this
change adds a 4th tool alongside them, does not implement or close 11.1.

## (c) Naming-collision-adjacent pair — not proven duplicate

`graph.semantic_path_synthesis` (line ~1784) and `hypergraph.semantic_path_synthesis` (line ~2935)
share a name suffix across two different namespaces. Neither body was read as part of this audit —
flagging this as `not_proven` duplicate, per this repo's own evidence-integrity convention
(CLAUDE.md's Agent Execution Integrity rules: a naming coincidence is not evidence of duplication
without reading both implementations). Worth a follow-up read before assuming either is stale or
redundant.

## (d) Operational note: TRACE MCP restart requires its full launch environment

Found live 2026-09-03 while verifying (c) above: TRACE MCP's process (`node --loader
file:///.../scripts/node-ts-loader.mjs src/mcp/trace-mcp-server.ts`) depends on environment
variables set at its original launch time — specifically `ROTORQUANT_MODEL_PATH` (required by
`src/lib/server/llm/runtime-contract.ts`), which a bare `node trace-mcp-server.ts` relaunch does
not inherit, causing an immediate crash on startup. A fresh shell/subprocess does not automatically
pick up `.env` values the way the original launcher's environment did.

**Fix, confirmed working**: `node --env-file="<absolute path to sveltekit-frontend/.env>" --loader
<...> src/mcp/trace-mcp-server.ts` (Node 22's built-in `--env-file` flag). No canonical npm script
was found for launching this process directly (`package.json` has no `trace-mcp-server` script) —
worth adding one so future restarts don't require re-deriving this from a live process's command
line via `Get-CimInstance Win32_Process`, as was done here.

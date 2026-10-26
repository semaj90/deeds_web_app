# Parent Atlas Local Deep Research reports

## Verified integration and remaining boundary

The existing MCP owner is `sveltekit-frontend/scripts/mcp/ldr-mcp.mjs`; this directory does not introduce a second research engine. `scripts/atlas/ldr-report-v1.mjs` is its bounded stdio client and local report exporter.

The upstream project is LearningCircuit's `local-deep-research`, vendored at `tools/agentic-research/src/local-deep-research` and pinned in Docker. “LearningCircuit” identifies that upstream project; it is not a separate model-training circuit. The repository also contains `sveltekit-frontend/scripts/mcp/atlas-ldr-mcp.mjs` (`atlas_deep_research`, using AtlasTaskKernel repository retrieval) and TRACE `ldr_research` (the SvelteKit app orchestrator). These are separate owners and do not call the LearningCircuit container MCP by implication.

On October 17, 2026 (Pacific), Docker reported the pinned `ldr-local-deep-research-1` container and its SearXNG container healthy. Ornith's `/health` returned `status:ok`. This does not prove which model is loaded or a completed research job. LDR `/api/history` returned HTTP 401 without authentication. The first actual MCP start attempt returned HTTP 400; no task ID was returned. Authentication preflight was then added so an unauthenticated start is rejected before POST. No authentication bypass or account creation was attempted.

The bridge previously targeted `/api/research/start` and `/api/research/status/{id}`, unlike the vendored pinned API. It now uses `/api/start_research`, `/api/research/{id}/status`, and `/api/report/{id}`. Start arguments translate to `iterations` and one `search_engine`. Unsupported quick-summary calls fail explicitly rather than claiming a synthesized result. Session/CSRF values are never written into reports.

## Commands

From the repository root:

```powershell
node scripts/atlas/ldr-report-v1.mjs --probe
node scripts/atlas/ldr-report-v1.mjs --start --query="Research safe evidence-grounded repository decomposition; cite primary sources."
node scripts/atlas/ldr-report-v1.mjs --task-id="EXISTING_RESEARCH_ID"
node --test scripts/atlas/ldr-report-v1.test.mjs
```

The bridge loads credentials from the gitignored `sveltekit-frontend/.env.ldr.local` before the other frontend environment files; process environment values take precedence. Set `LDR_USERNAME` and `LDR_PASSWORD` locally. It obtains a session through the existing login endpoint, retains cookies in memory, verifies authentication, and refreshes CSRF after login. Login is attempted at most once per MCP process to avoid retry loops/account lockouts. Restart the MCP process if its authenticated session expires. Credential transmission is restricted to loopback hosts; redirects are not followed. `LDR_CREDENTIAL_LOGIN=false` disables automatic login. Existing `LDR_SESSION_COOKIE` and `LDR_CSRF_TOKEN` overrides remain supported. Do not commit credentials, paste them into reports, or disable server authentication. `LDR_BASE_URL` selects the existing container endpoint. The caller does not create accounts or start models/containers.

Starting research intentionally writes LDR's own research history. It does not authorize canonical PostgreSQL, Qdrant, Neo4j, Redis/Valkey, Graphify publication, or training writes. The exporter polls at most 12 times, with bounded MCP request timeouts; a pending job can continue in LDR and must be resumed by task ID. Each export creates new Markdown and JSON files here, with an execution UUID and SHA-256 of the exact Markdown bytes. It does not overwrite older reports. A blocked diagnostic is not an LDR-generated deep research report.

## Research brief: repository decomposition

This is a source-inspection brief and requested research plan, **not a completed LDR synthesis**. Repository findings must remain distinct from externally retrieved documentation and LLM proposals.

| Stage | Existing owner / evidence | Required research result and admission limit |
|---|---|---|
| Vocabulary and structural extraction | `docs/openspec/README.md`; `scripts/atlas/svelte-dom-splitter-v1.mjs`; frontend `scripts/atlas/batch-a-structural-materializer.mts` | Keep product labels, packet labels, summaries, domain labels, and ontology IDs separate. Diagnostic native AST indexing can proceed with deferred revision propagation; do not manufacture missing revisions or canonical node IDs. |
| Retrieval and documentation | `docs/architecture/runtime-ownership-registry.json`; frontend `src/lib/server/retrieval/search-runtime.ts` | Preserve canonical TopFiles and one logical semantic lane. Research URLs need acquired-content provenance and independent qualification before ACE admission. LDR citations alone do not qualify code evidence. |
| NLP and graph | `python/miniforge_nlp_sidecar.py`; `openspec/changes/parent-atlas-ontology-kernel/tasks.md` | Bounded native observations and grounded advisory proposals; reviewed ontology terms and role-preserving relations. Similarity and PageRank cannot invent relations. |
| Planning and context | Existing ACE/ContextManifest and PromptPlan owners documented in the ownership registry | Admit evidence and budgets before synthesis. Research output remains unreviewed until those owners validate it. Never export hidden reasoning, KV caches, or tensors. |
| CPU/GPU experiments | `docs/architecture/_cuda_rtx_toc.md` | Freeze input/checksums and numerical CPU references before GPU comparisons. Record parity, device, VRAM and latency; do not treat installed packages as executed kernels. |
| Learning | Existing OpenSpec evaluation/promotion owners | DSPy/GEPA and learned routing remain isolated challengers with held-out evaluation. Reports cannot change production weights, labels, or policy. |

## Acceptance and next step

Eight tests cover the MCP handshake, pinned start/status/report/history routes, login and cookie rotation, CSRF forwarding, one-attempt login failure, loopback/cross-origin protection, invalid input, unsupported quick summary, and HTTP 302/401/403 rejection. Live credential login succeeded on October 17; this exposed and corrected the history envelope (`{status, items}`, not a bare array). Authenticated history access is a connectivity proof, not a completed research job. Next: run one one-iteration research job, export its final report, verify Markdown checksum and sources independently, and review it before any Atlas evidence admission. Source-revision backfill remains deferred.

## Closeout

- likely_cause: Existing MCP endpoints and payloads did not match the pinned LDR API, and the container requires authenticated requests with CSRF protection.
- evidence: Docker health, Ornith health, unauthenticated HTTP 401, actual MCP HTTP 400 result, vendored research/auth routes, and focused stdio tests.
- patch_targets: `sveltekit-frontend/scripts/mcp/ldr-mcp.mjs`, `scripts/atlas/ldr-report-v1.mjs`, `scripts/atlas/ldr-report-v1.test.mjs`, `docs/ldr/`.
- safe_next_command: `node scripts/atlas/ldr-report-v1.mjs --probe`
- smoke_command: `node --test scripts/atlas/ldr-report-v1.test.mjs`
- report_path: `docs/ldr/README.md`

# Mastra / Deep Agents install gate — 2026-09-26

## Status

The `@deeds/atlas-orchestrator` package now resolves the current Mastra durable-agent APIs and the optional LangChain Deep Agents runtime. This closes AFC-14's install/import gate only. It does not prove suspend/resume across process restarts, durable task retries, application wiring, or production orchestration.

## Why installation was stuck

- At install time, the machine Node was `v22.17.1`; the selected transitive `posthog-node@5.54.1` declares `^20.20.0 || >=22.22.0`, so it warned as unsupported. A later live recheck on 2026-09-26 found PATH now resolves `C:\Program Files\nodejs\node.exe` at `v22.23.3` with npm `11.6.2`, matching the portable runtime. This records the current observation; it does not attribute who or what updated the system installation.
- `.npmrc` sets `workspaces=false`, making plain `npm install --workspace=...` fail with `Cannot use --no-workspaces and --workspace at the same time`.
- `packages/atlas-orchestrator/package.json` pinned `@mastra/core` to `^0.1.0`; the installed `0.1.26` runtime failed to import because it required `@prisma-app/client`, which is not an approved Parent Atlas persistence owner.
- Root and frontend LangChain versions differ, and both are below the peer ranges required by the current Deep Agents release. A repo-root upgrade would have broadened the change unnecessarily.

## Scoped install

The existing orchestrator package now pins:

- `@mastra/core@1.71.0`
- `@mastra/pg@1.27.1`
- `@mastra/redis@1.4.6`
- `deepagents@1.14.1`
- `langchain@1.5.12`
- `@langchain/core@1.2.12`
- `@langchain/langgraph@1.4.18`
- `@langchain/langgraph-checkpoint@1.1.5`
- `@langchain/langgraph-sdk@1.12.0`
- `langsmith@0.9.0` (within Deep Agents' `<0.10.0` peer range)

The package declares Node `>=22.13.0`. A portable official Node `v22.23.3` Windows x64 distribution was checksum-verified and placed under `.tmp/toolchains`. At install time the system Node was not changed; the later PATH check above confirms it is now also `v22.23.3`. Archive SHA-256: `2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71`.

Install command from repo root:

```powershell
npm install --workspaces=true --workspace=@deeds/atlas-orchestrator --install-strategy=nested --ignore-scripts
```

The deep/nested strategy keeps these dependencies under the existing orchestrator package instead of upgrading the SvelteKit app's dependency tree.

## Verification

`packages/atlas-orchestrator/scripts/runtime-import-smoke.mjs` imports and checks the runtime entry points. It only imports modules: zero agents instantiated, zero database connections, zero canonical writes, and `canonicalAuthority: false`.

Verified with Node `v22.23.3`:

```powe
.tmp/toolchains/node-v22.23.3/node-v22.23.3-win-x64/node.exe packages/atlas-orchestrator/scripts/runtime-import-smoke.mjs
.tmp/toolchains/node-v22.23.3/node-v22.23.3-win-x64/node.exe node_modules/typescript/bin/tsc --noEmit -p packages/atlas-orchestrator/tsconfig.json
```
Both passed. The full-repository install summary reported 9 npm audit advisories (3 moderate, 5 high, 1 critical). A scoped production audit for `@deeds/atlas-orchestrator` found 2 high advisories (`brace-expansion`, `js-yaml`), with no critical. No automatic audit fix was run; investigate before deployment.

## Follow-up validation (2026-09-26)

- Rehomed the Mastra route fixture from the SvelteKit `+server` route directory to `sveltekit-frontend/src/lib/server/atlas/mastra-agent-route.spec.ts`; SvelteKit reserves `+`-prefixed route files. The focused route suite passes 3/3 under PATH Node `v22.23.3`.
- Re-ran the orchestrator runtime import smoke and TypeScript check under PATH Node `v22.23.3`; both pass. The smoke instantiated no agent and opened no database connection.
- Ran the full Svelte check with `NODE_OPTIONS=--max-old-space-size=8192`. It completed with 36 errors and 291 warnings across 119 files; the reserved-route preprocessing cascade is gone. Remaining errors include unresolved optional modules/types (`nodejs-whisper`, `form-data`, `pdf-lib`, `fastmcp`, and the DuckDB package path) and existing type/library mismatches. App-wide type validation therefore remains open under AFC-17; these results do not close AFC-14B-02 or prove live inference.
- No model inference, database connection/write, queue publication, projection write, or Graphify run occurred.

## OpenWiki / OKF check
- Google OKF is a portable Markdown + YAML-frontmatter knowledge format, not an agent runtime or a Google-hosted persistence requirement. LangChain OpenWiki is a separate CLI built on Deep Agents that emits OKF-compatible wiki pages. The repo's `.okf` is a local contract/taxonomy area and the Obsidian vault under `sveltekit-frontend/docs/obsidian-vault` is a separate generated documentation surface. The local module index still lists npm `openwiki@0.3.1`, LangChain `1.5.5`, and Mastra `1.23.0`; those entries are stale against current registry values. Its `docs/openwiki` local source lane is also marked `openwiki_root_missing`.
- Installed `openwiki@0.6.0` temporarily under `.tmp/toolchains/openwiki-cli` using portable Node `v22.23.3`. The CLI requires Node `>=22.22.0`. Its read-only `integrations list` reports Codex and all other host integrations as `not-installed`. - No global OpenWiki install, Codex integration install, `openwiki --init`, Obsidian vault rewrite, or OKF corpus generation was run. Invoking the CLI with `--help` enters its interactive mode in this release and failed in the non-TTY shell (`raw mode is not supported`); it did not initialize or write a wiki.

## Open boundaries

- AFC-15 still needs a real suspend/resume restart-parity proof with the selected persistence owner.
- The SvelteKit `defineWorkflow` shim remains in place; no frontend runtime wiring was changed.
- The durable-agent stream cache is not the canonical workflow ledger. Mastra's durable-agent API supports resumable event streams; for worker-crash-resilient long-running DAG execution, separately evaluate its Inngest/Temporal-backed workflow path.
- Deep Agents is an optional harness over LangChain/LangGraph, not a second DAG, identity, retrieval, or persistence owner.
- Token maps, ACE packet composition, simdjson N-API fanout, CuTile/SIMT execution, and ContextManifest/PromptPlan integration were not implemented or run.
- No PostgreSQL, Qdrant, Valkey/Redis, RabbitMQ, Neo4j, or Graphify runtime was contacted.

## Sources

- Google Open Knowledge Format / local OKF: `https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md`
- LangChain Deep Agents overview: `https://docs.langchain.com/oss/javascript/deepagents/overview`
- Mastra durable agents: `https://mastra.ai/blog/introducing-durable-agents`
- Mastra workflow snapshots: `https://mastra.ai/en/reference/workflows/snapshots`
- Mastra Temporal workflows: `https://mastra.ai/blog/introducing-temporal-workflows`
- Node 22 release archive: `https://nodejs.org/en/download/archive/v22.23.3`
- LangChain OpenWiki install / OKF output: `https://github.com/langchain-ai/openwiki`
- Google Open Knowledge Format repository: `https://github.com/GoogleCloudPlatform/open-knowledge-format`

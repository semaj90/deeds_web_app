# CLAUDE.md small reference sections — archived verbatim 2026-10-03

Source: root CLAUDE.md. Condensed rules were kept in place; these are the original full texts.

## Backend Infrastructure Audit (17 Gates)

**Complement to 20-gate code audit above** — the code audit checks **static codebase health**, this audit checks **runtime service health**.

**When to run**: Pre-deployment, post-Docker restart, debugging cache/inference issues, validating observability stack.

**Quick run**: `bash scripts/audit/backend-infrastructure-audit.sh` (~30s)

**Documentation**: See [BACKEND_INFRASTRUCTURE_AUDIT.md](BACKEND_INFRASTRUCTURE_AUDIT.md) for detailed gate definitions, troubleshooting, and fix commands.

### 17-Gate System (5 Tiers)

| Tier | Gates | Services Checked |
|------|-------|------------------|
| **A: Cache** | G1-G5 | Redis connection/keys/memory, Bifrost semantic cache, Qdrant vector store |
| **B: Inference** | G6-G9 | Ollama service, GPU availability, model files, inference latency |
| **C: Message Queue** | G10-G12 | RabbitMQ service, queue consumers, message flow |
| **D: Observability** | G13-G15 | Langfuse UI, trace ingestion, cache monitoring endpoint |
| **E: Codebase Intelligence** | G16-G17 | Codebase index (Qdrant codebase_chunks_768), simdjson native addon |

### Integration with Code Audit

**Use both audits together**:

```bash
# Before deployment (full validation)
bash sveltekit-frontend/scripts/audit/orphan-detector.sh src/  # 20-gate code audit
bash scripts/audit/backend-infrastructure-audit.sh             # 17-gate backend audit

# After code changes (quick code check)
# Run specific gates: G1-G9 for imports, G18-G19 for auth/validation
rg "from.*NewModule" src/ --type ts --type svelte  # G1 example

# After Docker restart (backend health only)
bash scripts/audit/backend-infrastructure-audit.sh

# Debugging inference issues (backend Tier B only)
# Check gates G6-G9 manually or run full script
```

**Division of responsibility**:
- **20-gate code audit**: Static imports, DB schema refs, auth guards, Zod validation
- **17-gate backend audit**: Docker services, Redis cache, Ollama/GPU, RabbitMQ, Langfuse, Codebase index

**Service ports reference** (from backend audit):
| Service | Port | Health Check |
|---------|------|--------------|
| SvelteKit Dev | 5173 | `curl localhost:5173` |
| Redis | 6379 | `docker exec deeds-redis-prod redis-cli ping` |
| Bifrost | 3040 | `curl localhost:3040/health` |
| Qdrant | 6333 | `curl localhost:6333/` |
| Ollama | 11434 | `curl localhost:11434/api/tags` |
| RabbitMQ | 5672, 15672 | `curl -u guest:guest localhost:15672/api/overview` |
| Langfuse | 3030 | `curl localhost:3030` |
| SeaweedFS S3 | 8333 | `curl localhost:9333/cluster/status` (probe via master) |
| SeaweedFS Master | 9333 | `curl localhost:9333/cluster/status` |
| SeaweedFS Filer | 8382 | `curl localhost:8382/` |

**Expected performance baselines** (from your RTX 3060 Ti setup):
| Metric | Value | Acceptable Range |
|--------|-------|------------------|
| Redis GET | 5ms | <10ms |
| Bifrost L2 Hit | 2-5s | <10s |
| Ollama GPU | 25s | <60s |
| Cache Speedup | 6,542× (vs CPU) | >1,000× |

---

## TypeScript 7 Native-Preview Lane (May 5, 2026)

Microsoft's Go-based TS 7.0 compiler (`tsgo`) now runs as a parallel audit lane. **Does NOT replace `tsc` / `svelte-check`** — keep both. Per Microsoft, the stable programmatic API isn't expected until 7.1.

**Install** (already in `package.json` devDependencies; `package-lock.json` is gitignored so re-run after pulling):
```bash
cd sveltekit-frontend && npm install
npx tsgo --version   # → Version 7.0.0-dev.20260421.2
```

**Scripts**:
- `typecheck:native` — `tsgo --noEmit` (~10× faster than tsc on full repo)
- `typecheck:native:pretty` — developer-friendly output
- `typecheck:native:nightly` — pulls `@typescript/native-preview@latest` at run
- `audit:tsgo` — `pretty=false` for CI parsing
- `audit:tsgo:json` — runs tsgo + writes JSONB report to `scratch/audits/tsgo-diagnostics.json`

**JSONB diagnostics importer** (`scripts/tsgo-diagnostics-to-jsonb.mjs`): output shape feeds directly into the AGENTS.md spine tables `metadata_envelopes(source_type='diagnostic')`, `code_relations(DIAGNOSTIC_IN_FILE)`, `ace_context_sources(source_kind='tsgo_diagnostic')`. Each diagnostic carries a stable_key (sha1 of file:line:col:code:msg) so re-runs are idempotent.

**Side-by-side rule**: `typescript` package stays installed for SvelteKit, eslint, typescript-eslint, and any compiler-API consumer. CI keeps using `svelte-check` until TS 7 stable lands.

Baseline run uncovered exactly 1 real error tsc/svelte-check missed (TS2345 in `sync-to-obsidian/+server.ts:51` — wrong arg order on `listWikiNotes`). After fix: `tsgo` reports 0 errors, 0 warnings repo-wide.

---

## AGENTS.md Relationship Spine (May 5, 2026)

Path-first NES-arch memory bank now has structural backing. Three Postgres tables tie every `AGENTS.md` to the directory graph + retrieval scoring + ACE source-of-truth audit.

**Tables** (`drizzle/manual/agents_md_relations.sql`):
- `agent_context_files` — parsed envelope per AGENTS.md (rules JSONB, tools JSONB, constraints JSONB, semantic_tags TEXT[], qdrant_tags TEXT[], content_hash for idempotent re-index, schema_version for shape evolution). GIN indexes on tags + rules JSONB path ops.
- `directory_context_bindings` — walk-up resolution map. binding_type ∈ {exact, nearest-parent, inherited, override}; depth, priority, confidence. Unique on (agent_context_key, directory_path, binding_type).
- `ace_context_sources` — audit trail. source_kind ∈ {agents_md, qdrant_chunk, wiki_note, code_llm_cache, prior_answer, graph_neighbor, fast_ast}. Powers `yorha.agentsMdFiles` transparency in OpenAI facade responses.

**Code** (`src/lib/server/agents-md/`):
- `schema.ts` — Zod `agentsMdEnvelopeSchema` + `AGENTS_MD_SCHEMA_VERSION` constant
- `parse-agents-md.ts` — pure function (no I/O). Lenient extraction: title (first H1), summary (first para after H1), rules (bullets under "Rules"/"Conventions"/"Standards" with inline `[tag,tag]` suffix + severity inferred from Critical/High/Note keywords), tools (bullets OR markdown table, allowed/forbidden + scope + reason), constraints (bullets under "Forbidden"/"Constraints"), tags (bullets under "Semantic Tags"/"Qdrant Tags"). Confidence rises with structure, floor 0.5. content_hash = sha256(normalised body).
- `resolve-directory-context.ts` — pure-function resolver: `candidateAgentsMdPaths(filePath)` walks UP nearest-first; `nearestAgentsMdForFile(path, knownSet)` matches direct path, `agents:<file>` prefix, OR `agents:dir:<dir>` shape (the live Redis key form); `bindingsForAgentsMd({key, path, dirs})` produces 1 exact (depth=0, priority=100) + N inherited (priority+10*depth, confidence decays 0.1/depth, floor 0.4)

**Tests**: `tests/agents-md-relations.spec.ts` — 7 tests covering parser structured/bare/table forms + resolver walk-up + binding generation.

---

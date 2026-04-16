# Error Analysis Architecture

## Purpose

This repo uses two complementary paths for diagnosing and fixing errors:

1. **Fast deterministic verification**
2. **Deep retrieval-assisted error analysis**

The fast path is the source of truth for whether the codebase is healthy.  
The deep path helps prioritize, cluster, and suggest fixes at scale.

---

## Core Principles

- **Build verification is authoritative.**
- **Retrieval and clustering are advisory.**
- **Workspace exclusions are for search/index hygiene, not build logic.**
- **Every suggested fix must pass the deterministic verifier.**
- **Keep the verifier lean; keep analysis separate.**

---

## Path 1: Fast Deterministic Verification

This path is used for direct error fixing and production wiring validation.

### Canonical checks

- `check:typescript`
- `check:app`
- `check:vite`
- `check:all` (runs all three above in sequence)

### Responsibilities

The fast path is responsible for catching:

- TypeScript type errors
- Svelte/SvelteKit template issues
- path and alias wiring failures
- broken imports
- SSR/client boundary mistakes
- production-only bundling failures
- chunking/build-time resolution issues

### Source of truth

The following commands determine whether a fix is valid:

```bash
npm run check:typescript   # tsc --noEmit (TypeScript only)
npm run check:app          # svelte-kit sync && svelte-check (Svelte + templates)
npm run check:vite         # vite build (production bundling)
npm run check:all          # all three above in sequence
```

**Rule:** A fix is not considered complete until it passes the relevant deterministic checks.

---

## Path 2: Deep Retrieval-Assisted Error Analysis

This path is used when the repo has many errors and they need to be grouped, ranked, and analyzed efficiently.

### Use this path when

- there are many errors across multiple files
- repeated failure patterns exist
- prioritization is needed
- a fix may apply to a whole cluster of related issues
- past similar errors may help inform likely solutions

### Responsibilities

The deep path may:

- collect machine-readable errors
- normalize and hash error signatures
- embed error descriptions
- store vectors in Qdrant
- retrieve nearest prior failures by similarity
- cluster similar failures
- rerank likely fixes using AST or symbol-aware scoring
- generate suggested fixes

**Rule:** The deep path may propose fixes, but it may never replace deterministic verification.

---

## Layered Architecture

### L1: Exact-Match Cache

**Backend:** Redis / Bifrost exact cache

Use for:
- repeated identical errors
- normalized signature hits
- prior exact fix lookups

This is the fastest lookup layer.

### L2: Semantic Retrieval Memory

**Backend:** Qdrant

Use for:
- similar past failures
- semantically related error patterns
- alias/path regressions that look like prior incidents
- repeated framework-specific issues

Qdrant stores vector embeddings plus payload metadata for retrieval and filtering.

### L3: Precision Reranking

**Backend:** AST-aware / symbol-aware / path-aware scoring

Use for:
- preferring fixes from similar import graphs
- preferring fixes from the same route/package/module area
- raising confidence for structurally similar failures
- narrowing semantic matches to the most relevant candidates

---

## Deterministic vs Advisory

### Deterministic

These decide whether the code is correct:

- TypeScript
- Svelte check
- Vite production build

### Advisory

These help suggest what to fix first:

- clustering
- embeddings
- semantic retrieval
- ANN search
- AST ranking
- LLM-generated fix suggestions

---

## Workspace and VS Code Scope

### .code-workspace

Workspace-level exclusions are for:
- Explorer noise reduction
- search filtering
- agent context hygiene
- multi-root workspace cleanliness

They are **not** used for:
- TypeScript compilation
- Svelte compilation
- Vite resolution rules
- production build configuration

### .vscode/settings.json

Repo-local VS Code settings are used for:
- frontend-specific editor behavior
- excludes for search and indexing
- Python interpreter path for local tooling
- TypeScript SDK selection
- task ergonomics

### Exclusion Policy

The following directories should generally be excluded from workspace search/indexing unless debugging specifically requires them:

- `node_modules`
- `.svelte-kit`
- `dist`
- `build`
- `coverage`
- `.vite`
- `.venv`
- `__pycache__`
- `.pytest_cache`
- `.mypy_cache`
- `.ruff_cache`
- Go vendor directories
- generated Docker/build outputs

**Why:** These exclusions improve search quality, agent retrieval quality, indexing performance, signal-to-noise ratio for debugging, and context efficiency for AI-assisted workflows.

---

## Script Contract

### Lean verifier

These scripts are the expected verification contract:

| Script | Command | Purpose |
|--------|---------|---------|
| `check:typescript` | `tsc --noEmit` | TypeScript-only verification |
| `check:app` | `svelte-kit sync && svelte-check` | Svelte template + type validation |
| `check:vite` | `vite build` | Production bundling/path verification |
| `check:all` | runs the 3 above in sequence | Full 3-stage verification pipeline |

**Rule:** `check:vite` answers a narrow question: *Does the production build and wiring succeed?*

For production deploys, prefer `check:all` which runs all three stages. The `build` script adds wasm compilation and audit pre-steps on top of that — use it for actual artifact production, not verification.

---

## Phase 78 / Deep Analysis Contract

Phase 78 is the repo's deep error-analysis pipeline.

Typical stages include:

1. collect machine-readable errors
2. normalize and rank errors
3. persist error records
4. cluster semantically related failures
5. embed clusters or error descriptions
6. retrieve similar prior failures from Qdrant
7. generate fix suggestions
8. verify suggested fixes with deterministic checks

**Rule:** Phase 78 improves prioritization and suggestion quality. It does not define truth.

---

## Suggested Error Record Schema

Each normalized error should store:

```
tool
file_path
line
column
error_code
normalized_message
raw_message
import_path
alias
package
workspace
error_family
signature_hash
timestamp
commit_sha
```

---

## Suggested Qdrant Payload Fields

Each vector record should include payload metadata such as:

```
repo
workspace
tool
file_extension
package
error_family
signature_hash
commit_sha
timestamp
```

**Why:** This allows semantic search to be narrowed by filters before reranking.

---

## Retrieval Order Contract

When analyzing a new error, follow this order:

1. exact signature lookup in Redis/Bifrost
2. if miss, semantic retrieval from Qdrant
3. rerank using AST/symbol/path context
4. generate suggested fix
5. verify with deterministic checks

**Rule:** Never skip the final verification step.

---

## Recommended Usage Flow

### Fixing a few direct errors

Use the fast path:

```bash
npm run check:all
```

Then:
1. inspect first failures
2. apply minimal patch
3. rerun checks

### Fixing many errors at once

Use the deep path:
1. run Phase 78 full pipeline
2. cluster and rank failures
3. generate likely fixes
4. apply small changes
5. verify with `npm run check:all`

### End-to-end validation

Use the combined flow when you want both:
- direct verification
- deep GPU/retrieval analysis
- cache health visibility
- prioritization support

---

## Agent Guidance

AI/code agents operating on this repo should follow these rules:

- prefer the smallest valid patch
- inspect configs before changing alias logic
- do not add duplicate alias systems unless required
- treat Vite build failures as production wiring evidence
- do not scan excluded/generated folders unless the error points there
- retrieval may suggest fixes, but the build decides correctness
- summarize: root cause, files changed, why the fix works, which checks passed

---

## Web Search — When to Use and What to Search

### When to escalate to web search

Use web search when:
- the error references a third-party package and the local fix is unclear
- a framework error message looks like a known upstream bug (Svelte, Vite, bits-ui, Drizzle, etc.)
- the error code or message appears verbatim in changelogs or GitHub issues
- you've applied a patch and the same error recurs in an unexpected way

Do **not** use web search for:
- TypeScript type errors that can be diagnosed from the schema
- Import path failures (use G1-G9 audit gates first)
- Svelte 4→5 rune migration issues (covered in CLAUDE.md)
- Drizzle query shape issues (covered in `memory/drizzle-schema-reference.md`)

### Effective search patterns

```
# Framework-specific error
"<exact error message>" site:github.com svelte OR sveltekit

# Package version regression
"<package name>" "<version>" breaking change OR regression

# Vite bundling issue
vite "<error text>" SSR OR build

# Bits-ui / Svelte 5 TDZ
bits-ui svelte 5 TDZ OR "temporal dead zone" props

# Drizzle ORM
drizzle-orm "<error text>" postgres OR pgvector
```

### Trusted sources (ranked)

1. **GitHub Issues** — `github.com/<org>/<repo>/issues` — verbatim error matches
2. **Official changelogs** — CHANGELOG.md in the package repo (check for your version)
3. **Svelte docs** — `svelte.dev/docs` for runes migration and SSR rules
4. **Vite docs** — `vitejs.dev/guide` for SSR/build config
5. **bits-ui docs** — `bits-ui.com/docs` for component API and migration guide
6. **Drizzle docs** — `orm.drizzle.team` for schema and query patterns
7. **Stack Overflow** — useful for normalized error messages, but verify version match

### What to do with search results

- Confirm the package version in the result matches this repo's version (`package.json`)
- If a workaround is found, apply it as a minimal patch
- Run `npm run check:all` to verify the fix
- If the result suggests a config change, cross-check `vite.config.ts`, `svelte.config.js`, `tsconfig.json` before editing

---

## Non-Goals

This architecture is not intended to:

- replace the build system with semantic search
- let vector retrieval decide correctness
- use workspace exclusions as compilation rules
- overfit to one error trace without verification
- treat AI suggestions as authoritative

---

## Bottom Line

This repo uses a two-lane model:

- **Fast path:** deterministic verifier for truth
- **Deep path:** retrieval-assisted analysis for scale

That split is intentional.

> Truth comes from checks.  
> Speed and prioritization come from retrieval.

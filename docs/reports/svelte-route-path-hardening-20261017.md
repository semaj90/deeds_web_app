# Svelte Route Path Hardening — 2026-10-17

## Result

`@` route segments are accepted without weakening source-path containment. The splitter, rune/markup crosscheck, event-handler crosscheck, and N-ary dry-run now share `resolveSvelteSourceFileV1`, which delegates workspace containment and exact path-segment checks to the existing exact-index target resolver. Input paths are handled independently so a rejected candidate does not discard valid siblings.

## Verification

| Scope | Requested | Processed | Failed | Rejected | Skipped |
|---|---:|---:|---:|---:|---:|
| Tracked Svelte components | 606 | 606 | 0 | 0 | 0 |
| SvelteKit route files, splitter | 301 | 301 | 0 | 0 | 0 |
| Previously excluded `@` routes, splitter | 4 | 4 | 0 | 0 | 0 |
| Previously excluded `@` routes, rune/markup check | 4 | 4 | 0 | 0 | 0 |
| Previously excluded `@` routes, handler check | 4 | 4 | 0 | 0 | 0 |
| Previously excluded `@` routes, N-ary dry-run | 4 | 4 | 0 | 0 | 0 |

The N-ary dry-run produced 56 unique edges with minimum arity 3 and `canonicalAuthority=false`. A mixed-path negative test rejected `../outside.svelte` while still processing its valid route sibling. The focused path-target test suite passed 6/6; strict OpenSpec validation, JavaScript syntax checks, and scoped `git diff --check` passed.

## Limits

- The default filesystem listing exposed 603 component files, while `git ls-files` identified the requested tracked cohort of 606; all 606 tracked paths were processed in bounded batches.
- The three crosschecks were rerun over the four previously excluded `@` routes, not the entire route cohort. The 301/301 full-route result is the splitter run.
- The shared exact-target resolver implements symlink and resolved-path containment checks, but no new symlink-escape fixture was run in this pass.
- These are extraction and diagnostic proofs only. No canonical identities, graph edges, Valkey, database, or production projections were written.

## Graphify Audit / Ornith Runtime

The existing audit script is already partly model-neutral: it checks `/v1/models`, requests advisory extraction, validates output shape, and rejects failed model calls by default. This pass added `/health` readiness and constrained JSON response mode, removed the Gemma4 environment flag from the generic `graphify:audit` entry, and added an import guard so importing the module does not run the workflow. Live verification is blocked: both `GET http://127.0.0.1:8090/health` and `GET /v1/models` were refused. No model request, audit scan, or publication was run. The legacy quick-start references were qualified accordingly; broader source-span grounding and frozen-cohort evaluation remain open.

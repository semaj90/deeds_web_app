# Phase 18 — Messy Query Routing Evaluation

## What it is

A validation harness for the 4-signal query router used by the HyperRAG pipeline. It classifies
incoming queries by signal type, decides whether CHR97 fast-path or HyperRAG fallback fires, and
produces a per-query tool plan.

## Run it

```bash
# from sveltekit-frontend/
npm run atlas:messy-routing
```

Produces:
- `docs/reports/messy-query-routing-eval.json` — full structured report
- `docs/reports/messy-query-routing-eval.md` — human-readable summary

Dry-run (no Redis required):
```bash
npm run atlas:messy-routing:dry
```

## How the router works

Each query is scored across 4 signal dimensions:

| Signal | What it detects | Example keywords |
|---|---|---|
| `semantic` | natural-language explanation intent | why, how, explain, compare, summarize |
| `lexical` | specific file/service/tech references | `.ts`, `qdrant`, `neo4j`, `Gemma4`, `MCP` |
| `graph` | structural relationship intent | depend, import, topology, cluster, path |
| `trust` | privileged/destructive operations | delete, drop, admin, token, credential |

Scores are 0–1. A query is `messy=true` when two or more signals exceed 0.4 simultaneously.

### Dispatch table

| Condition | Dispatch |
|---|---|
| `lexical ≥ 0.72` | `chr97` fast-path (cartridge lookup, no HyperRAG) |
| `graph ≥ 0.7` | `graphrag` (Neo4j neighborhood expansion) |
| `semantic ≥ 0.7` | `hyperrag` (multi-lane Qdrant + wiki enrichment) |
| `trust > 0` | `trust-gate` (blocked, no tool plan emitted) |
| fallback | `hyperrag` at `FALLBACK_THRESHOLD=0.7` |

CHR97 fast-path fires when `lexical ≥ CHR97_FAST_PATH_THRESHOLD (0.72)` — skips the full
HyperRAG pipeline and hits the cartridge reader directly. Check `chr97FastPath: true/false`
in the JSON report per query.

## Reading the report

```json
{
  "signal": { "semantic": 0.9, "lexical": 0.9, "graph": 0.25, "trust": 0.1, "messy": true },
  "routerDispatch": ["chr97", "hyperrag"],
  "chr97FastPath": false,
  "chr97FastPathScore": 0.35,
  "toolPlan": ["mcp:service-inspector"]
}
```

- `chr97FastPathScore` below 0.72 means full HyperRAG runs; above means cartridge shortcut
- `toolPlan` lists the MCP tools the router recommends for this query shape
- `subqueries` shows how compound messy queries were decomposed

## Thresholds

Defined at the top of `scripts/atlas/eval-messy-query-routing.mjs`:

```js
const FALLBACK_THRESHOLD       = 0.7;   // minimum signal to trigger HyperRAG
const CHR97_FAST_PATH_THRESHOLD = 0.72;  // lexical score needed for cartridge shortcut
```

Raise `CHR97_FAST_PATH_THRESHOLD` to reduce false CHR97 fast-paths on partially-lexical queries.
Lower `FALLBACK_THRESHOLD` to catch more borderline queries in HyperRAG.

## Script location

`scripts/atlas/eval-messy-query-routing.mjs` (repo root `scripts/atlas/`, not inside `sveltekit-frontend/`)

The script uses `REPO_ROOT` to resolve output paths, so reports always land at the repo-root
`docs/reports/` regardless of which directory you run from.

## Dependencies

| Service | Required for | Fallback |
|---|---|---|
| Redis `:6379` | `gpu:karpathy:scores` boost sample in report | skipped, report still writes |
| None | signal scoring, routing, tool plan | always runs |

The harness is **read-only** — it does not write to Qdrant, Neo4j, or Postgres.

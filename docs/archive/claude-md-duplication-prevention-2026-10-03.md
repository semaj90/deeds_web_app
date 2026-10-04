# CLAUDE.md archive — Duplication Prevention lead + Runtime Owner governance (verbatim)

Archived 2026-10-03 from root CLAUDE.md (size limit). Unchanged; condensed rules stay in CLAUDE.md.
Source ranges (pre-trim line numbers): 773-831 (lead: 4 Aug-9 incidents, 6 rules) and 836-888 (One Canonical Runtime Owner governance layer).

---

## 🚫 Duplication Prevention — Audit Before You Build (HARD RULE, Aug 9 2026)

**The recurring failure mode**: a new capability gets implemented without first checking
whether one already exists, producing N silently-competing owners where only one (or zero)
is actually live. This happened **four separate times in one session** (Aug 9 2026):

1. **5 competing PageRank implementations** — `atlas_graph_authority_runs` (v1, dead, zero
   callers), `atlas_graph_authority_runs_v2` (writer functions exist, zero callers, one
   fixture-oracle row inserted ad hoc), `graphify-authority.mjs` (Neo4j-property path),
   `run-pagerank.ts` (CouchDB+GPU path), and `neo4j-gds-client.ts::runPageRankClient` (the
   only one with a live runtime proof). Two of the five had **zero callers anywhere in the
   repo** — dead code sitting in production tables looking live.
2. **4 nonexistent relationship types silently accepted** — `NAMED_PROJECTION_CANDIDATES`
   referenced `REQUIRES`/`RETURNS`/`PARAMETER_OF`/`IMPLEMENTS_REQUIREMENT`/`EXTENDS`; none
   exist in the live Neo4j graph (`CALL db.relationshipTypes()` returned zero matches). A
   "named projection" silently resolved to the same graph as no filter at all.
3. **14 reranker files** in `sveltekit-frontend/src/lib/server/retrieval/` (`*reranker*` +
   `canonical-rerank-executor.ts`) — only one (`canonical-rerank-executor.ts`) is confirmed
   canonical by its own docstring and by importing `blendScores`/`RuntimeReranker` from
   `runtime-reranker.ts`; the other 13 are unclassified.
4. **A live Docker NLP sidecar with zero ACP registrations** — `miniforge_nlp_sidecar.py`
   has real capabilities (structural/linguistic/rerank passes) but `ACPToolRegistry.ts` has
   no reference to it, so agents can't discover it through `GET /api/acp/tools` and would be
   tempted to hand-roll a second integration path instead of using tool discovery that
   already exists.

**Hard rule — before implementing any new owner of a capability** (a ranking algorithm, a
retrieval lane, an identity join, a background job, a cache key pattern, anything with a
plausible "the codebase probably already does this somewhere" smell):

1. **Grep first.** Search for the capability by name/purpose across `src/`, `scripts/`,
   `python/` before writing new code. If something matches, read it before deciding it's
   dead — check for actual callers (`grep -rl "functionName("`), not just file existence.
2. **A file existing is not evidence it's live.** Check for callers. Check whether the
   Postgres/Redis/Neo4j data it reads/writes is fresh or stale. A table having rows doesn't
   mean the writer that produced them still runs — verify against `git log`/call-site greps,
   not against "there's data in the table."
3. **A config value existing is not evidence it's correct.** If a projection/allowlist/enum
   references named entities (relationship types, table names, service endpoints), verify
   each one actually exists in the live system before trusting the config — `grep`-checking
   the *reference* is not the same as checking the *referent*.
4. **Layered ownership, not competing owners.** When multiple tools plausibly overlap (e.g.
   a parser engine vs. the chunking application built on it vs. a structural query/rewrite
   tool vs. the canonical data contract they all feed), name each one's distinct layer
   instead of picking one as "the" owner and treating the others as redundant. Canonical
   contracts stay stable; producers underneath them can be swapped later.
5. **New agent-facing capabilities register in ACP, not just HTTP.** If a new service or
   pass is meant to be callable by an agent (Ornith, MCP tool loops, etc.), register it in
   `ACPToolRegistry.ts` (`GET /api/acp/tools`) so it's discoverable — don't leave it as a
   side-channel HTTP contract known only to hand-written TypeScript client code.
6. **Record what you found, even when you don't fix it.** If an audit turns up dead code or
   unclear ownership that's out of scope to resolve immediately, write it into the relevant
   `openspec/changes/*/tasks.md` or this file — a flagged-but-unfixed duplicate is still
   strictly better than an unflagged one nobody knows to distrust.

**Where this is being actively tracked**: `openspec/changes/parent-atlas-graph-analysis-contract/`
(PageRank/projection findings above), `openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/`
(reranker audit + ACP registration, tasks.md sections 6 and 11).



---

### One Canonical Runtime Owner Per Capability (governance layer, Aug 9 2026)

The 6 rules above are the discipline an agent follows in the moment. This section is the
**institutionalized** version — a durable classification vocabulary plus a machine-readable
registry (`docs/architecture/runtime-ownership-registry.json`) and an audit script
(`npm run atlas:audit:ownership`, `scripts/atlas/audit-runtime-ownership.mjs`) so the check
doesn't depend on an agent remembering to grep first.

**Invariant**: ONE logical capability → ONE canonical runtime owner → MANY backends/adapters/
experiments allowed → ZERO uncoordinated peer owners.

**Classification vocabulary** — every implementation of a capability gets exactly one label:

| Label | Meaning |
|---|---|
| `CANONICAL_OWNER` | The one contract other code depends on. Exactly one per capability. |
| `BACKEND` | A swappable implementation behind the canonical owner (e.g. MiniLM vs. Mixedbread behind `canonical-rerank-executor.ts`). |
| `ADAPTER` | Wraps an external tool/library to conform to the canonical contract (e.g. a `treesitter-chunker`-backed producer of `AstUnit`). An adapter is never the source of truth and must not become a second owner. |
| `EXPERIMENT` | Explicitly non-production, evaluated but not wired into the canonical path. |
| `COMPATIBILITY` | Kept only so an old caller doesn't break; not for new use. |
| `FIXTURE_ONLY` | Test/proof-of-concept data, never touches production tables for real traffic. |
| `DEAD` | Confirmed zero callers — flagged for archival, not deleted (see Archival Rules). |

**Before adding any new retrieval lane, reranker, graph algorithm, representation, sidecar
service, ACP/MCP tool, persistence writer, cache, feature producer, or chunking
implementation**: search existing implementations, identify their callers/contract/persistence
boundary, classify each one found, and extend the `CANONICAL_OWNER` rather than create a peer
owner. **If ownership can't be established, stop and record the ambiguity in an OpenSpec
change — don't implement past that point.**

**Explicitly prohibited without an explicit classification decision first**: a second
independently-selectable production RRF vote for one logical retrieval lane; a second
canonical persistence writer for one capability; a second canonical `representation_id` for
what's conceptually the same semantic representation (though same vector *dimension* — e.g.
`semantic_768` vs. a future `codebert_768` — never implies representation identity on its own,
they can legitimately coexist as distinct representations); a second graph-algorithm
dispatcher; a second reranker external contract; a second ACP/MCP tool exposing the same
capability; a second AST identity authority; a new sidecar service created only because a
library happens to expose a convenient API.

**Baseline vs. new violations**: `docs/architecture/runtime-ownership-baseline.json` records
already-known duplication (the 13 unclassified reranker files, the dead/fixture-only PageRank
paths, etc.) so the audit script doesn't fail on debt that predates it. The rule is **existing
debt is a documented, tolerated warning; a *new* uncoordinated peer owner introduced by a
current diff is a failure.** Do not let a governance audit turn into a mandate to refactor
everything it finds — inventory first, remediate later, as its own explicit task.

**See**: `docs/architecture/runtime-ownership-registry.json` (the data),
`docs/architecture/runtime-ownership-baseline.json` (tolerated existing debt),
`scripts/atlas/audit-runtime-ownership.mjs` (the mechanical check),
`openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/specs/runtime-owner-deduplication/`
(the spec-level requirements this governance layer enforces).


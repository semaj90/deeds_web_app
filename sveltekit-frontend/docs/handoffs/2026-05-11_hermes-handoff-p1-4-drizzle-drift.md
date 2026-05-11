# Hermes Agent Handoff — P1.4 Drizzle / DB drift triage

**Author**: Claude Code session ending 2026-05-11
**Target agent**: Hermes Agent desktop (WSL2 or Windows)
**Mode**: read-only research + per-table diagnostic write-up
**Why Hermes**: P1.4 is the "broad research / planning" lane in
  `docs/architecture/hermes-agent-windows-gemma4-guide.md §"Recommended workflow"`.
  Read-only TRACE MCP + local Gemma4 is exactly the right shape;
  Claude Code's strengths are wasted on a 61-table audit.

---

## 0. Pre-flight (verified by Claude Code at handoff time)

| Check | Status |
|---|---|
| TRACE MCP `:8788/mcp` reachable | ✓ |
| `db.schema_overview` registered | ✓ |
| `db.table_inspect` registered | ✓ |
| `kb.hybrid_search` registered | ✓ |
| `kb.trace_search` registered | ✓ |
| `graph.expand_neighborhood` registered | ✓ |
| Phase A regen pipeline at HEAD | `ce6e9c5ce8` (CI gate green) |

Live tools/list count at handoff: ~88 distinct tools. P1.4 needs only the
read-only subset (see §3 allowlist).

---

## 1. The task

`docs/audits/db-schema-drift-2026-05-10.md` reports **61 Drizzle-declared
tables that are missing from the live Postgres DB**. Per `CLAUDE.md`
§"Drizzle Safety Rule" (2026-05-11), none of these can be migrated
without operator review because:

- 24 of 61 are `user_id`-bearing → blocks on the unresolved identity-strategy
  decision (Path A integer / B uuid / C two-tier / D defer)
- The other 37 mix stub-decls, renamed-but-not-deleted, and planned-features

**Goal**: produce a per-table report classifying each of the 61 into one of:

| Classification | Action implied | Risk |
|---|---|---|
| `stub-delete-decl` | The Drizzle decl is unused — delete the export | Low (no DB change) |
| `renamed-elsewhere` | Live DB has the renamed equivalent (e.g. `messages` → `chat_messages`) | Low (rename Drizzle decl + update consumers) |
| `planned-migration` | Real feature waiting for a migration script | Medium (operator decides timing) |
| `identity-blocked` | Decl uses `user_id` and intersects identity-strategy | HARD-BLOCK on operator |
| `unknown` | Needs more investigation | High (don't act) |

**Deliverable**: `docs/audits/p1-4-drizzle-drift-triage-2026-05-11.md` with one
row per table.

---

## 2. Hard rules (operator-enforced — do NOT violate)

These are the same hard rules Claude Code has been respecting all session.
Hermes must respect them too:

- **No `drizzle-kit push`** under any circumstance.
- **No DDL** — `ALTER TABLE`, `CREATE TABLE`, `DROP TABLE` all out of scope.
- **No `0018_ace_observability_canonicalize.sql` apply** — staged but not applied.
- **No edits to `src/lib/server/db/schema-postgres.ts`** in this pass — that's
  the operator's call once the report is in hand.
- **No identity-strategy decision** — the 24 user_id tables get classified
  `identity-blocked` and stop there. Hermes does NOT recommend Path A/B/C/D.
- **No `buildHypergraph4D()` fire**, no `Stage A0` prefilter touch, no
  `encoded_64` backfill — those are gated on other operator calls.

If any tool result tempts you toward writing, **stop and append to the
report's "operator review needed" list instead**.

---

## 3. Hermes MCP allowlist (read-only)

Per `docs/architecture/hermes-agent-windows-gemma4-guide.md §"Wiring Hermes
to TRACE MCP"`:

**Allowed for this task:**
- `db.schema_overview` — list all tables, columns, types
- `db.table_inspect` — per-table inspection (Drizzle ↔ DB diff)
- `kb.hybrid_search` — find route handlers that import a given table
- `kb.trace_search` — semantic search over the codebase chunks
- `kb.wiki_note_lookup` — read directory KAG cards
- `graph.expand_neighborhood` — find code neighbors of a schema file
- `graph.pagerank_top` — surface high-authority consumers
- `topology.search_4d` / `topology.search_som_neighborhood` — optional
  topology lookup if a table groups by feature cluster

**Blocked (Hermes' MCP client should refuse, but call it out if not):**
- `shell.*`, `bash.*`, `exec.*` — no shell from Hermes
- `db.execute_write`, `db.run_migration`, `db.*write*` — never
- `cache.delete_*`, `redis.flush*`, `rabbitmq.publish_*` — never
- `graph.materialize_pathway`, `topology.recompute*` — heavy jobs only
- `kag.ingest_*` (write side) — owned by daily/heavy lane

---

## 4. Source inputs

Hermes should consume these files (each path is repo-rooted from
`C:\Users\james\Videos\deeds-web-app\`):

1. `sveltekit-frontend/docs/audits/db-schema-drift-2026-05-10.md`
   The original audit listing the 61 missing tables.
2. `CLAUDE.md` §"Drizzle Safety Rule (May 11, 2026)" — the operator's
   four preconditions that must hold before any migration moves.
3. `CLAUDE.md` §"Schema Mismatch: user_id columns split across 3 types"
   — the identity-strategy crisis context.
4. `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` — the
   canonical Drizzle declarations (148 tables).
5. `sveltekit-frontend/drizzle.config.ts` — the `tablesFilter` band-aid
   that protects 50 DB-only live tables.
6. Live DB column inventory: query via `db.schema_overview` MCP tool.

---

## 5. Workflow for Hermes

```
For each of the 61 tables:
  1. db.table_inspect(table)          → confirm absent from live DB
  2. kb.hybrid_search(query=table)    → find import sites (route handlers, services, scripts)
  3. graph.expand_neighborhood(file)  → find the schema-postgres.ts decl + consumers
  4. Decide classification (§1 matrix)
  5. Append a row to the report:
       | table_name | classification | consumer_count | identity_blocked | notes |

After all 61 → summarize:
  - count per classification
  - lowest-risk batch (likely `stub-delete-decl`) to surface first
  - list the 24 identity-blocked tables verbatim so operator can map them
    to the Path A/B/C/D decision when they're ready

Write to: docs/audits/p1-4-drizzle-drift-triage-2026-05-11.md
```

---

## 6. Deliverable shape

```markdown
# P1.4 Drizzle drift triage — 2026-05-11
**Triaged by**: Hermes Agent
**Read-only**: yes — no schema or DB writes performed

## Summary
- Total tables triaged: 61
- stub-delete-decl: N
- renamed-elsewhere: N
- planned-migration: N
- identity-blocked: 24
- unknown: N

## Per-table report
| Table | Classification | Consumers | Notes |
|---|---|---|---|
| messages | renamed-elsewhere | 3 routes | live DB has `chat_messages`; Drizzle decl is stale |
| ... | ... | ... | ... |

## Operator review needed
- [ ] N tables classified `unknown` (listed below)
- [ ] Identity-strategy decision blocks 24 tables (listed below)
```

---

## 7. What Claude Code is NOT doing here

- Not running this triage myself — Hermes is the right tool, my context is
  saturated with the agents-regen pipeline, and the work is read-heavy
  + planning-heavy which is Hermes' strength.
- Not making the identity-strategy call. Operator-only.
- Not touching `schema-postgres.ts`. Operator-only.
- Not modifying any `drizzle/*` migration. Operator-only.

When Hermes finishes the report, the operator decides which subset to act
on. Claude Code can then implement the operator-approved changes one batch
at a time (e.g. "delete these 12 stub decls" lands in a single PR).

---

## 8. Cross-references

- Agents-regen pipeline state (Phase A complete): `ce6e9c5ce8`
- Agents-smoke CI gate: `npm run agents:smoke:all`
- Phase A design doc: `docs/design/2026-05-11_agents-directory-card-regen.md`
- Hermes Agent install guide: `docs/architecture/hermes-agent-windows-gemma4-guide.md`
- Agent surface decision matrix: `docs/architecture/agent-surface-decision-matrix.md`
- Original drift audit: `docs/audits/db-schema-drift-2026-05-10.md`
- Identity crisis context: `CLAUDE.md` §"Schema Mismatch"

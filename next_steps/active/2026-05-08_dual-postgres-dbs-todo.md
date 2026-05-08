# Dual Postgres Instance Cleanup — TODO

> Surfaced while fixing `hypergraph.search` (commit `6a36c73776`).
> The repo runs two Postgres instances with the same database name but
> different schemas. Pick one as canonical and decommission the other.

## What we found

| Port | Role | hypergraph_edges schema | Row counts |
|---|---|---|---|
| `5434` | modern / dev / where seeders write | full schema (title, summary, member_ids, grade_*, edge_hash, glyph_cluster, manifold4, …) | 71 edges, 16,379 members (after seeding) |
| `5432` | legacy stub / SvelteKit fallback | minimal columns (id, edge_type, label, query_hash, run_id, weight, metadata, created_at, topology) | was 0 edges; manually patched + restored to match :5434 |

`.env` points at `:5434`. `env.server.ts` has `DATABASE_URL_FALLBACK` set to `:5432`. SvelteKit's pool layer sometimes resolves to the fallback (especially when the dev server was started before the `.env` had its current values).

This caused the live `hypergraph.search` MCP call to fail with `column "title" does not exist` — the API was hitting `:5432` while the seeder wrote to `:5434`.

## Workaround applied (`6a36c73776`)

1. `ALTER TABLE hypergraph_edges ADD COLUMN IF NOT EXISTS …` on `:5432` to match `:5434` schema
2. `pg_dump --data-only --column-inserts` from `:5434`, restored to `:5432`
3. The new free-text ILIKE branch in `+server.ts` pins to `ENV.DATABASE_URL` instead of `process.env.DATABASE_URL ?? '...'` — same intent, but uses the env-server resolution

`hypergraph.search` works in both directions now, but only because both DBs hold the same 71 edges. Any future seeder must write to both, or this drifts again.

## Decision pending

Pick one:

### Option A — Promote `:5434` to canonical, decommission `:5432`
- Most code already aligns (seeders, `.env`, `env.server.ts` primary)
- Stop the `:5432` Postgres container; remove `DATABASE_URL_FALLBACK` from `env.server.ts`
- Restart the SvelteKit dev server with the cleaned env
- Risk: anything that hard-codes `5432` as a default breaks

### Option B — Promote `:5432` to canonical (treat `:5434` as legacy)
- Run a full migration of all `:5434` data to `:5432` (large — many tables not just hypergraph)
- Update `.env` to point at `:5432`
- Risk: bigger blast radius — more tables to migrate

### Option C — Make `:5434` an actual proxy of `:5432`
- Run `pgcat` / `pgbouncer` on `:5434` pointing at `:5432`
- Both hostnames hit the same physical DB
- Risk: extra moving piece; only worth it if there's a real connection-pooling reason

**Recommendation: Option A.** The schema drift is one-way (5434 has more), the seeders all write to 5434, and the only thing forcing 5432 into the loop is a stale `DATABASE_URL_FALLBACK`. Removing it should be a one-commit change once the dev server is restarted to clear its env cache.

## Verification command (to run after picking a path)

```bash
# Both URLs must point at the same data after the fix
PGPASSWORD=123456 psql -h 127.0.0.1 -p 5434 -U legal_admin -d legal_ai_db \
  -c "SELECT count(*) AS p5434 FROM hypergraph_edges;"
PGPASSWORD=123456 psql -h 127.0.0.1 -p 5432 -U legal_admin -d legal_ai_db \
  -c "SELECT count(*) AS p5432 FROM hypergraph_edges;"

# (After Option A): expect p5432 to fail with "could not connect" since the
# instance is shut down, and p5434 to return 71+
```

## Related files

- `.env` — `DATABASE_URL=postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db`
- `src/lib/server/env.server.ts:44-49` — `DATABASE_URL_FALLBACK` defaulted to `:5432`
- `scripts/seed-hypergraph-edges.mjs` — writes to `process.env.DATABASE_URL`
- `src/routes/api/hypergraph/search/+server.ts` — pinned to `ENV.DATABASE_URL` (post-fix)

## Why this matters

The atlas + AGENTS.md + screenshot lanes all assume one canonical DB. If one writer goes to `:5434` and one reader hits `:5432` (or vice versa), users see "column does not exist" / "0 results" with no obvious cause. The fix is one decision + one env edit + one dev-server restart.

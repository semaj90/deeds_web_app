# FANOUT disposable proof DB — 2026-08-22

Disposable, isolated Postgres proof database used to validate the two migration
files fixed on `agent/fanout-proof-db-readiness-20260822` actually apply
cleanly on PostgreSQL 18, without touching the shared 5434 instance.

## Setup (reproducible)

```bash
docker rm -f parent-atlas-fanout-proof 2>/dev/null
docker run -d --name parent-atlas-fanout-proof \
  -e POSTGRES_USER=atlas_proof \
  -e POSTGRES_PASSWORD=<random> \
  -e POSTGRES_DB=parent_atlas_fanout_proof \
  -p 127.0.0.1:55432:5432 \
  pgvector/pgvector:pg18   # local image reused, no pull — pg18.4 + pgvector 0.8.3, already current
```

Shell-side guard used before any write: refuse `DATABASE_URL` containing `5434`,
require it contains `55432`.

## Schema clone

Schema-only `pg_dump` from `legal-ai-postgres` (shared instance), restored into
the proof DB. 498 tables created. `graphify_runs`/`graphify_files` did NOT
exist in the shared instance's dump — confirmed these are genuinely still
"manual / intentionally unapplied" migrations, not yet live anywhere.

Windows/Git-Bash note: `docker exec ... -f /tmp/foo.sql` gets MSYS-path-mangled
into a Windows host path. Use `//tmp/foo.sql` (double leading slash) to
suppress the conversion.

## Migrations proven

Both applied with `psql -v ON_ERROR_STOP=1` (fails loud on any real error,
unlike a bare `-f` run which just logs and continues):

1. `20260822_graphify_revision_authority_v2.sql` (repaired version, from
   `agent/fanout-proof-db-readiness-20260822`) — applied cleanly. Confirmed all
   five constraints created: `graphify_runs_workspace_revision_sha256_v2`,
   `graphify_runs_source_manifest_digest_sha256_v2`,
   `graphify_runs_source_manifest_source_count_v2`,
   `graphify_files_code_source_revision_sha256_v2`,
   `graphify_files_content_hash_sha256_v2`.
2. `20260822_graph_snapshot_revision_owner_v1.sql` — applied cleanly against
   the cloned `atlas_graph_snapshots_v2`/`atlas_graph_nodes_v2` tables.

## Known slow step

The V3 source-inventory writer (`materialize-graphify-source-inventory-v3.mts`)
computes `origin.bindings` (a full-workspace exact-byte content hash walk) via
`materializeWorkspaceRevisionOriginV1` **unconditionally**, before filtering to
a single `--source`. On this machine, under heavy concurrent multi-agent load
(dozens of active worktrees/processes), a single-source dry run took 10+
minutes of real time (though CPU time was climbing throughout — genuinely
computing, not hung). A full-manifest `--apply` run will do the same full walk
and will likely take at least as long. Budget for this before running it.

## Teardown (when proof work is fully done)

```bash
docker rm -f parent-atlas-fanout-proof
```

Not run yet as of this writing — container intentionally left running so the
remaining proof steps (Graphify writer canary, full V3 apply, independent
revision-owner proof, graph-snapshot writer proof, FANOUT admission proof) can
continue against it without re-cloning the schema.

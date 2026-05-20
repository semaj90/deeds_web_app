# PostgreSQL 18 Integration Notes

Last reviewed: 2026-05-19

## Summary

This repo can likely run on PostgreSQL 18 without application-level breakage, but the upgrade is **not zero-touch**.

The main risks are not SvelteKit 2, Drizzle ORM, or the Node Postgres clients themselves. The real risks are:

- Windows service and local admin scripts hard-coded to PostgreSQL 17 paths
- `pgvector` extension install/upgrade procedure on the target Postgres 18 instance
- Existing operational assumptions around local ports, data directories, and extension binaries

Short recommendation:

- **Stay on PostgreSQL 17** if the current stack is stable and you do not need AIO right now.
- **Upgrade to PostgreSQL 18** if you want better read-heavy performance and are willing to do a controlled infra pass on local scripts, extension install, and migration validation.

## Current repo state

Observed in this codebase:

- `drizzle-orm`: `0.45.2`
- `drizzle-kit`: `0.31.10`
- `pg`: `8.16.3`
- `postgres`: `3.4.7`
- `pgvector` npm package: `0.1.8`
- Runtime DB URL is usually Postgres on `127.0.0.1:5434`
- There are repo scripts explicitly named around PG17, including `pg17:ensure`
- There are Windows admin scripts hard-coded to `C:\Program Files\PostgreSQL\17\...`

Files with direct PG17 operational coupling:

- [package.json](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/package.json:1012)
- [package.json](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/package.json:1013)
- [package.json](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/package.json:1072)
- [scripts/start-services.ps1](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/scripts/start-services.ps1:15)

## Will PostgreSQL 18 break SvelteKit 2?

Probably not.

SvelteKit itself does not care about the Postgres major version. It talks to the database through Node clients and your server-side code. As long as the connection string, auth method, schema, and extensions remain valid, the framework layer should be unaffected.

Risk level: low.

## Will PostgreSQL 18 break Drizzle ORM?

Probably not at the ORM/runtime level.

Drizzle targets PostgreSQL through SQL generation and standard clients. There is nothing in this repo that suggests a hard dependency on PostgreSQL 17-only SQL behavior.

What can break is the **migration workflow**, not the ORM abstraction itself:

- `drizzle-kit push` / `generate` behavior still depends on your live schema shape
- manual sidecar SQL migrations still need to apply cleanly
- extension availability still matters before schema objects referencing `vector` can be created

Risk level: low for query/runtime, medium for migration/ops.

## Will PostgreSQL 18 break pgvector?

Not inherently, but this is the most important moving part to verify.

`pgvector` itself supports PostgreSQL 18. The upstream README includes install instructions for PostgreSQL 18 and package/build examples for PG18. That means the extension is expected to work on PostgreSQL 18.

The actual risk in this repo is operational:

- the Postgres 18 server must have the `vector` extension installed
- the extension version on the new cluster must be upgraded explicitly if needed
- any local Docker image or Windows install path that currently assumes PG17 must be updated

If you upgrade the server but do not install the matching PG18 `pgvector` extension build, vector tables and indexes will fail immediately.

Risk level: medium, but manageable.

## What PostgreSQL 18 gives you

From the official PostgreSQL 18 release notes and docs:

- asynchronous I/O (AIO) for sequential scans, bitmap heap scans, vacuums, and related operations
- `io_method` to choose async behavior
- `pg_aios` view for observing active async I/O handles
- `pg_upgrade` now retains optimizer statistics

Why this matters here:

- this repo is retrieval-heavy and read-heavy
- codebase search, metadata scans, audit jobs, and indexing jobs are more likely to benefit than write-heavy OLTP paths
- preserving optimizer statistics during major upgrade reduces the usual post-upgrade cold-plan period

This is useful, but it does **not** directly change llama-server, Redis, Qdrant, or MCP behavior.

## Upgrade vs stay

### Stay on PostgreSQL 17 if

- your local stack is already stable
- your current pgvector indexes and retrieval paths are healthy
- you do not want to touch Windows service paths and local admin scripts yet
- you want to avoid mixing database-upgrade work into current ACE / GraphRAG / inference work

This is the conservative choice.

### Upgrade to PostgreSQL 18 if

- you want the AIO improvements for read-heavy workloads
- you are already doing infra cleanup
- you are willing to validate pgvector install on the new cluster
- you can update all PG17-specific repo scripts in one pass

This is the right choice if you want to modernize the local DB stack and are ready to treat it as an infra change, not just a package bump.

## Repo-specific blockers before upgrading

These should be fixed first.

1. Hard-coded PostgreSQL 17 paths in `package.json`

Current examples:

- `postgres:stop`
- `postgres:status`
- `postgres:restart`
- `pg17:ensure`

These should become env-driven or version-agnostic.

2. Hard-coded `pg17` Docker/service reference

- [scripts/start-services.ps1](/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/scripts/start-services.ps1:15)

3. Extension install assumptions

You need a repeatable PG18 extension check:

```sql
SELECT version();
SELECT extversion FROM pg_extension WHERE extname = 'vector';
SELECT installed_version FROM pg_available_extensions WHERE name = 'vector';
```

4. Migration safety validation

Before switching dev or prod-like workflows to PG18, rerun:

- `npm run audit:pgvector`
- `npm run audit:drizzle`
- `npm run audit:drizzle-meta`

## Recommended upgrade plan

1. Make Postgres admin scripts version-agnostic.
2. Stand up a PostgreSQL 18 instance on a different port or container first.
3. Install `pgvector` on the PG18 instance.
4. Run schema and extension validation.
5. Run Drizzle and pgvector audits.
6. Run retrieval smoke tests against the PG18 instance.
7. Only then switch the main `DATABASE_URL`.

## Recommended decision for this repo

Today, I would keep PostgreSQL 17 as the default unless one of these is true:

- you are bottlenecked on read-heavy DB work that AIO may help
- you already need to touch local DB ops scripts
- you want to normalize the stack around PG18 now

If you do upgrade, the likely breakage is operational, not application-level.

## Notes on client compatibility

### `pg` and `postgres`

These talk standard PostgreSQL protocol. A server move from 17 to 18 should not require app code changes by itself.

### Drizzle ORM

Drizzle is unlikely to care about the major version as long as the server behaves like PostgreSQL and required extensions/types are present.

### SvelteKit 2

No direct coupling to PostgreSQL 17 was found.

### pgvector

Use PostgreSQL 18 only if the matching `vector` extension is installed on that cluster.

## Sources

- PostgreSQL 18 release notes: https://www.postgresql.org/docs/18/release-18.html
- PostgreSQL 18 `pg_aios`: https://www.postgresql.org/docs/18/view-pg-aios.html
- PostgreSQL 18 resource settings / `io_method`: https://www.postgresql.org/docs/18/runtime-config-resource.html
- pgvector README: https://github.com/pgvector/pgvector/blob/master/README.md

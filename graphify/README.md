# graphify/

Canonical output directory for graphify pipeline artifacts (graph snapshots, edge
lists, cluster/topology reports, etc.). This directory is gitignored — its contents
are large, regenerable, and not meant to be versioned — but it stays greppable via
the `!graphify/` negation in `.rgignore`, matching the existing pattern used for
`.opencode/ndjson/`.

**Status (2026-08-09): infra only.** This directory was just created; no graphify
scripts write here yet. Existing scripts still write to their historical scattered
locations (`.tmp/`, `docs/reports/`, `docs/graph/`, `sveltekit-frontend/memory/graphify/`).
Migrating scripts to write here is a separate, audited sweep — do not assume any
script output lives in this directory yet. Check the script's own source for its
actual output path.

This README is the one file in this directory NOT gitignored, so the directory's
existence and purpose survive a fresh clone.

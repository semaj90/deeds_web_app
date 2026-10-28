#!/usr/bin/env bash
# Rehearse the DRAFT alignment migration on a DISPOSABLE database. Never touches the live database for writes (pg_dump -s is read-only).
# Run from the repo root:  bash sveltekit-frontend/scripts/atlas/rehearse-drizzle-alignment-v1.sh
set -u
N=atlas-align-rehearsal; PW=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')
cleanup(){ docker rm -f "$N" >/dev/null 2>&1; }; trap cleanup EXIT
SQL=sveltekit-frontend/drizzle/manual/20261028_align_task_semantic_and_route_runtime_packets_DRAFT.sql
docker run -d --rm --name "$N" -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$PW" -p 127.0.0.1:55433:5432 pgvector-pgsearch:pg18-local >/dev/null || { echo "container start failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$N" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
q(){ docker exec -i "$N" psql -U postgres -v ON_ERROR_STOP=1 -At "$@"; }
echo "server: $(q -c 'show server_version')"
q -c 'CREATE EXTENSION IF NOT EXISTS vector' -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm' >/dev/null 2>&1
# schema-only shape of the live tables (read-only dump), loaded into the disposable database
docker exec legal-ai-postgres pg_dump -U legal_admin -d legal_ai_db -s --no-owner --no-privileges -t task_semantic_packets -t route_runtime_packets -t atlas_tree_nodes -t workspace_tasks \
  | docker exec -i "$N" psql -U postgres -At -q > /tmp/rehearse-load.log 2>&1
echo "load errors: $(grep -c -i 'error' /tmp/rehearse-load.log)"
echo "columns BEFORE: tsp=$(q -c "select count(*) from information_schema.columns where table_name='task_semantic_packets'") rrp=$(q -c "select count(*) from information_schema.columns where table_name='route_runtime_packets'")"
export PROBE_DATABASE_URL="postgres://postgres:$PW@127.0.0.1:55433/postgres"
echo "--- probe BEFORE migration"; (cd sveltekit-frontend && npx tsx scripts/atlas/drizzle-alignment-probe-v1.mts 2>&1 | tail -8)
q < "$SQL" >/dev/null 2>&1 && echo "PASS  apply draft" || echo "FAIL  apply draft"
q < "$SQL" >/dev/null 2>&1 && echo "PASS  re-apply is idempotent" || echo "FAIL  re-apply is idempotent"
echo "columns AFTER: tsp=$(q -c "select count(*) from information_schema.columns where table_name='task_semantic_packets'") rrp=$(q -c "select count(*) from information_schema.columns where table_name='route_runtime_packets'")  (expect 55 / 51)"
echo "--- probe AFTER migration"; (cd sveltekit-frontend && npx tsx scripts/atlas/drizzle-alignment-probe-v1.mts 2>&1 | tail -8)
echo "== container removed on exit; live DB was only read (pg_dump -s)"

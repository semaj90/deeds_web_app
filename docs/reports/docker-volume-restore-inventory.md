# Docker Volume Restore Inventory

Generated from the current `deeds-web-app` Docker state on 2026-06-28.

## What Exists Right Now

Current `docker volume ls` shows these named volumes:

- `deeds-web-app_caddy_config`
- `deeds-web-app_caddy_data`
- `deeds-web-app_postgres_data`
- `deeds-web-app_qdrant_data`
- `deeds-web-app_rabbitmq_data`
- `deeds-web-app_seaweed_master_data`
- `deeds-web-app_seaweed_volume_data`
- `deeds-web-app_valkey_data`

Two anonymous-looking volumes are also present:

- `56a1197f6e3c46e878f9bd2c7dbef8d17c25e08fd02095d7f45de2a99e68f01b`
- `f08367f9815733858e8bbe24638adbab7f3ec91c9248ae5e7c469eabd0b67009`

## Compose-Defined Persistent Volumes Across Profiles

The root compose file currently defines these persistent volumes when all profiles are included:

- `postgres_data`
- `qdrant_data`
- `langfuse_clickhouse_data`
- `langfuse_clickhouse_logs`
- `couchdb_data`
- `couchdb_config`
- `seaweed_volume_data`
- `triton_cache`
- `caddy_config`
- `caddy_data`
- `valkey_data`
- `nats_data`
- `neo4j_logs`
- `torchinductor_cache`
- `rabbitmq_data`
- `bifrost_data`
- `neo4j_data`
- `seaweed_master_data`

## Current Gap

The current Docker daemon does not show volumes for several compose-defined services that normally carry durable state:

- `langfuse_clickhouse_data`
- `langfuse_clickhouse_logs`
- `couchdb_data`
- `couchdb_config`
- `nats_data`
- `neo4j_data`
- `neo4j_logs`
- `bifrost_data`
- `triton_cache`
- `torchinductor_cache`

That does not prove the data is gone. It does prove those volumes are not present in the active Docker volume set right now.

## Important Restoration Rule

The SeaweedFS data issue is separate from the rest of the stack:

- SeaweedFS uses stable named volumes now.
- The current SeaweedFS volumes were recreated freshly.
- The other persistent services must be checked volume by volume before any restore attempt.

## Safe Recovery Order

1. Verify whether a volume already exists in `docker volume ls`.
2. Inspect container mounts for the live service.
3. Restore only if a backup or old volume is found.
4. Never run `docker volume prune` on this stack.
5. Pin compose project name before starting the stack.


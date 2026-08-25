import { createHash } from 'node:crypto';

export function connectionSource(env = process.env) {
  if (String(env.DATABASE_URL ?? '').trim()) return 'DATABASE_URL';
  if (String(env.ADMIN_DATABASE_URL ?? '').trim()) return 'ADMIN_DATABASE_URL';
  if (env.DB_HOST || env.DB_PORT || env.DB_NAME || env.DB_USER) return 'EXPLICIT_DB_CONFIG';
  if (env.POSTGRES_HOST || env.POSTGRES_PORT || env.POSTGRES_DB || env.POSTGRES_USER) return 'POSTGRES_ENV';
  return 'FALLBACK_DEFAULTS';
}

export function buildDatabaseConnectionFingerprint(row, relations = []) {
  const normalizedRelations = relations
    .map((relation) => ({
      schemaName: relation.schemaName ?? relation.schema_name ?? null,
      relationName: relation.relationName ?? relation.relation_name ?? null,
      kind: relation.kind ?? relation.relkind ?? null,
      visibleInSearchPath: relation.visibleInSearchPath ?? relation.visible_in_search_path ?? null,
      selectable: relation.selectable ?? null,
    }))
    .sort((a, b) => `${a.schemaName}.${a.relationName}`.localeCompare(`${b.schemaName}.${b.relationName}`));
  const fingerprint = {
    schema: 'atlas.database-connection-fingerprint.v1',
    databaseName: row.databaseName ?? row.database_name ?? null,
    currentUser: row.currentUser ?? row.current_user ?? null,
    sessionUser: row.sessionUser ?? row.session_user ?? null,
    currentSchema: row.currentSchema ?? row.current_schema ?? null,
    configuredSearchPath: row.configuredSearchPath ?? row.configured_search_path ?? null,
    effectiveSearchPath: row.effectiveSearchPath ?? row.effective_search_path ?? null,
    serverVersion: row.serverVersion ?? row.server_version ?? null,
    serverAddress: row.serverAddress ?? row.server_address ?? null,
    serverPort: row.serverPort ?? row.server_port ?? null,
    relations: normalizedRelations,
  };
  const canonical = JSON.stringify(fingerprint);
  return {
    ...fingerprint,
    fingerprintSha256: createHash('sha256').update(canonical, 'utf8').digest('hex'),
  };
}

import { buildCallableProjectionRefreshPlanV1 } from './callable-projection-refresh-plan-v1.mjs';
import { createFunctionRegistryPostgresReadPortsV1, createFunctionRegistrySidecarAstProviderV1 } from '../../../sveltekit-frontend/src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.ts';
import { createFunctionRegistrySnapshotLoaderV1, type FunctionSnapshotLoadResultV1 } from '../../../sveltekit-frontend/src/lib/server/atlas/function-registry/function-registry-snapshot-loader-v1.ts';
import { createMiniforgeNlpSidecarClient } from '../../../sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.ts';
import type pg from 'pg';

export async function planCallableProjectionRefreshV1(input: {
  pool: pg.Pool;
  root: string;
  symbolVersionId: string;
  workspaceRevision: string;
}) {
  if (!/^symbol-version:[a-f0-9]{64}$/.test(input.symbolVersionId)
    || !/^sha256:[a-f0-9]{64}$/.test(input.workspaceRevision)) throw new Error('CALLABLE_PLAN_EXPLICIT_SYMBOL_AND_WORKSPACE_REQUIRED');
  const client = await input.pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const readOnly = (await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only === 'on';
    if (!readOnly) throw new Error('CALLABLE_PLAN_READ_ONLY_NOT_CONFIRMED');
    const symbols = await client.query(`
      SELECT v.symbol_version_id, v.stable_symbol_id, v.packet_key,
        v.source_ref, v.source_revision, v.workspace_revision, v.qualified_name,
        v.signature_normalized, v.upstream_node_id, v.producer_revision,
        r.status AS registry_status
      FROM atlas_symbol_versions v
      JOIN atlas_symbol_registry r USING (stable_symbol_id)
      WHERE v.symbol_version_id = $1 LIMIT 2
    `, [input.symbolVersionId]);
    const projections = await client.query(`
      SELECT symbol_version_id, stable_symbol_id, tree_node_id, source_ref,
        source_revision, workspace_revision, qualified_name, signature_normalized,
        producer_revision, projection_revision, updated_at
      FROM atlas_callable_search WHERE symbol_version_id = $1 LIMIT 2
    `, [input.symbolVersionId]);
    const symbol = symbols.rows.length === 1 ? symbols.rows[0] : null;
    let qualification: FunctionSnapshotLoadResultV1 | null = null;
    if (symbol && /^sha256:[a-f0-9]{64}$/.test(symbol.source_revision ?? '')
      && symbol.workspace_revision === input.workspaceRevision && symbol.registry_status === 'active') {
      const sidecar = createMiniforgeNlpSidecarClient();
      const provider = createFunctionRegistrySidecarAstProviderV1({ astChunk: (request) => sidecar.astChunk(request) });
      const readPort = {
        async query<Row>(sql: string, parameters?: unknown[]) {
          return { rows: (await client.query(sql, parameters)).rows as Row[] };
        },
        release() {},
      };
      qualification = await createFunctionRegistrySnapshotLoaderV1({
        ports: createFunctionRegistryPostgresReadPortsV1(readPort, input.root, { astObservationProvider: provider }),
      }).loadQualified({ symbolVersionId: input.symbolVersionId, expectedSourceRevision: symbol.source_revision, expectedWorkspaceRevision: input.workspaceRevision });
    }
    return {
      ...buildCallableProjectionRefreshPlanV1({ symbol, projections: projections.rows, qualification, workspaceRevision: input.workspaceRevision }),
      transactionReadOnly: readOnly,
      observedProjectionRows: projections.rows,
      canonicalSymbolReadback: symbol,
      qualificationReceipt: qualification?.receipt ?? null,
    };
  } finally {
    try { await client.query('ROLLBACK'); } finally { client.release(); }
  }
}

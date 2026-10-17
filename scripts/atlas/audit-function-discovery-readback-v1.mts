import pg from 'pg';
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { createFunctionRegistryPostgresReadPortsV1, createFunctionRegistrySidecarAstProviderV1, queryCallableSearchProjectionInReadOnlyTransactionV1 } from '../../sveltekit-frontend/src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.ts';
import { createFunctionRegistrySnapshotLoaderV1 } from '../../sveltekit-frontend/src/lib/server/atlas/function-registry/function-registry-snapshot-loader-v1.ts';
import { createMiniforgeNlpSidecarClient } from '../../sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.ts';
import { summarizeFunctionDiscoveryReadbackV1 } from './lib/function-discovery-readback-v1.mjs';

const { values } = parseArgs({ options: {
  query: { type: 'string' },
  'workspace-revision': { type: 'string' },
  limit: { type: 'string', default: '4' },
  qualify: { type: 'boolean', default: false },
} });
const query = values.query?.trim();
const workspaceRevision = values['workspace-revision'];
const limit = Number(values.limit);
if (!query || query.length > 512 || !/^sha256:[a-f0-9]{64}$/.test(workspaceRevision ?? '')
  || !Number.isInteger(limit) || limit < 1 || limit > 64 || (values.qualify && limit > 4)) {
  throw new Error('EXPECTED_QUERY_WORKSPACE_SHA256_AND_LIMIT_1_TO_64');
}

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 12000,
  application_name: 'atlas-function-discovery-readback-v1',
});
const client = await pool.connect();
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const readPort = {
    async query<Row>(sql: string, parameters?: unknown[]) {
      return { rows: (await client.query(sql, parameters)).rows as Row[] };
    },
    release() { client.release(); },
  };
  const candidates = await queryCallableSearchProjectionInReadOnlyTransactionV1(readPort, { query, workspaceRevision: workspaceRevision!, limit });
  const readback = await client.query(`
    SELECT c.symbol_version_id,
      c.source_revision AS projection_source_revision,
      c.workspace_revision AS projection_workspace_revision,
      c.producer_revision AS projection_producer_revision,
      c.updated_at AS projection_updated_at,
      sv.source_revision AS canonical_source_revision,
      sv.workspace_revision AS canonical_workspace_revision,
      sv.producer_revision AS canonical_producer_revision,
      registry.status AS registry_status
    FROM public.atlas_callable_search c
    JOIN public.atlas_symbol_versions sv USING (symbol_version_id)
    JOIN public.atlas_symbol_registry registry ON registry.stable_symbol_id = sv.stable_symbol_id
    WHERE sv.symbol_version_id = ANY($1::text[])
    ORDER BY sv.symbol_version_id
  `, [candidates.map((candidate) => candidate.symbolVersionId)]);
  const { canonicalReadbackVerified, projectionRevisionDifferenceCount, projectionReadbackVerified } =
    summarizeFunctionDiscoveryReadbackV1(candidates, readback.rows, workspaceRevision);
  const snapshotOutcomes = [];
  const astDiagnostics = [];
  if (values.qualify && canonicalReadbackVerified) {
    const sidecar = createMiniforgeNlpSidecarClient();
    const astObservationProvider = createFunctionRegistrySidecarAstProviderV1({
      astChunk: (request) => sidecar.astChunk(request),
    });
    const ports = createFunctionRegistryPostgresReadPortsV1(readPort, REPO_ROOT, { astObservationProvider });
    const loader = createFunctionRegistrySnapshotLoaderV1({
      ports,
    });
    for (const candidate of candidates) {
      const symbol = await ports.getSymbolVersion(candidate.symbolVersionId);
      const bindings = symbol ? await ports.getWorkspaceSourceBindings(
        symbol.sourceRef,
        symbol.sourceRevision,
        symbol.workspaceRevision,
      ) : [];
      const exactBindings = bindings.filter((binding) => binding.canonicalSourceRef === symbol?.sourceRef
        && binding.sourceRevision === symbol?.sourceRevision
        && binding.workspaceRevision === symbol?.workspaceRevision);
      const sourceBytes = symbol && exactBindings.length === 1
        ? await ports.readSourceBytes(symbol.sourceRef, symbol.sourceRevision)
        : null;
      const observations = symbol && exactBindings.length === 1 && sourceBytes
        ? await astObservationProvider({ symbol, binding: exactBindings[0], sourceBytes })
        : [];
      astDiagnostics.push({
        symbolVersionId: candidate.symbolVersionId,
        upstreamNodeId: symbol?.upstreamNodeId ?? null,
        qualifiedName: symbol?.qualifiedName ?? null,
        signatureNormalized: symbol?.signatureNormalized ?? null,
        sourceRef: symbol?.sourceRef ?? null,
        byteStart: symbol?.byteStart ?? null,
        byteEnd: symbol?.byteEnd ?? null,
        bindingCount: exactBindings.length,
        astObservationCount: observations.length,
        observedNodeIds: observations.map(({ node }) => node.treeNodeId),
        observedNames: observations.map(({ node }) => node.qualifiedSymbol),
      });
      const result = await loader.loadQualified({
        symbolVersionId: candidate.symbolVersionId,
        expectedSourceRevision: candidate.sourceRevision,
        expectedWorkspaceRevision: workspaceRevision!,
      });
      snapshotOutcomes.push(result.receipt);
    }
  }
  const snapshotsQualified = snapshotOutcomes.length > 0 && snapshotOutcomes.every((outcome) => outcome.qualificationOutcome === 'QUALIFIED');
  const proven = projectionReadbackVerified && (!values.qualify || snapshotsQualified);
  const sourceBindings = {} as Record<string, string>;
  for (const [owner, url] of [
    ['audit', new URL(import.meta.url)],
    ['readbackVerifier', new URL('./lib/function-discovery-readback-v1.mjs', import.meta.url)],
    ['query', new URL('../../sveltekit-frontend/src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.ts', import.meta.url)],
    ['qualifier', new URL('../../sveltekit-frontend/src/lib/server/atlas/function-registry/function-registry-read-adapter-v1.ts', import.meta.url)],
    ['pathPolicy', new URL('../../sveltekit-frontend/src/lib/server/atlas/function-registry/ast-node-storage-path-v1.ts', import.meta.url)],
  ] as const) {
    sourceBindings[owner] = `sha256:${createHash('sha256').update(await readFile(url)).digest('hex')}`;
  }
  console.log(JSON.stringify({
    schema: 'atlas.function-discovery-readback.v1',
    status: !canonicalReadbackVerified ? 'INCOMPLETE' : !projectionReadbackVerified
      ? 'PROJECTION_REVISION_MISMATCH' : values.qualify
      ? snapshotsQualified ? 'QUALIFIED_SNAPSHOT_READBACK_PROVEN' : 'FUNCTION_QUALIFICATION_BLOCKED'
      : 'CANONICAL_DISCOVERY_READBACK_PROVEN',
    query,
    sourceBindings,
    workspaceRevision,
    limit,
    candidateCount: candidates.length,
    candidates,
    readback: readback.rows,
    projectionRevisionDifferenceCount,
    projectionReadbackVerified,
    canonicalReadbackVerified,
    qualificationRequested: values.qualify,
    astDiagnostics,
    snapshotOutcomes,
    sourceBytesVerified: snapshotsQualified,
    registrySnapshotQualified: snapshotsQualified,
    contextManifestAdmitted: false,
    writesPerformed: false,
    canonicalAuthority: false,
  }, null, 2));
  if (!proven) process.exitCode = 3;
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}

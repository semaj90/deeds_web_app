import { Client } from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { openExecution, recordSourceSelectionStage, completeExecution, acquireCoordinatorLock, releaseCoordinatorLock } from '../../src/lib/server/atlas/indexing/graphify-daily-coordinator-v1.js';

if (process.env.GRAPHIFY_COMMITTED_CANARY !== '1') {
  throw new Error('GRAPHIFY_COMMITTED_CANARY=1 is required for the bounded committed canary');
}

loadAtlasEnv();
const client = new Client({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});
const reportPath = resolve(process.cwd(), '..', 'docs', 'reports', 'graphify-daily-coordinator-canary-v1.json');
let locked = false;
let executionId: string | undefined;

try {
  await client.connect();
  await acquireCoordinatorLock(client);
  locked = true;

  const sourceResult = await client.query(
    `SELECT workspace_id, source_ref, code_source_revision, content_hash, byte_length, workspace_revision, file_id
       FROM public.graphify_files
      WHERE source_ref IS NOT NULL
        AND code_source_revision ~ '^sha256:[a-f0-9]{64}$'
        AND content_hash IS NOT NULL
        AND byte_length >= 0
        AND workspace_revision ~ '^sha256:[a-f0-9]{64}$'
      ORDER BY source_ref
      LIMIT 3`,
  );
  if (sourceResult.rows.length !== 3) throw new Error(`Expected 3 qualified source bindings, got ${sourceResult.rows.length}`);

  const first = sourceResult.rows[0];
  const bindings = sourceResult.rows.map((row) => ({
    sourceRef: String(row.source_ref),
    codeSourceRevision: String(row.code_source_revision),
    contentHash: String(row.content_hash),
    byteLength: Number(row.byte_length),
    legacyFileId: String(row.file_id),
  }));

  const opened = await openExecution(client, {
    workspaceId: String(first.workspace_id),
    workspaceRevision: String(first.workspace_revision),
    parserContractVersion: 'graphify.parser.v1',
    extractionContractVersion: 'graphify.extraction.v1',
    graphAlgorithmRevision: 'graphify.graph.v1',
    triggerKind: 'BOUNDED_COMMITTED_CANARY',
    schedulerRevision: 'atlas.graphify-daily-coordinator.v1',
    environmentRevision: 'operator-authorized-canary',
  });
  executionId = opened.executionId;
  const selection = await recordSourceSelectionStage(client, executionId, String(first.workspace_revision), bindings);
  await completeExecution(client, executionId, { status: 'COMPLETED' });

  const readback = await client.query(
    `SELECT e.execution_id, e.workspace_revision, e.status, e.completed_at,
            (SELECT count(*)::int FROM public.graphify_execution_files f WHERE f.execution_id = e.execution_id) AS file_count,
            (SELECT count(*)::int FROM public.graphify_execution_stages s WHERE s.execution_id = e.execution_id AND s.status = 'COMPLETED') AS completed_stage_count
       FROM public.graphify_executions e
      WHERE e.execution_id = $1`,
    [executionId],
  );
  const row = readback.rows[0];
  const report = {
    gate: 'GRAPHIFY-DAILY-COORDINATOR-01',
    status: row?.status === 'COMPLETED' && row?.completed_at && Number(row.file_count) === 3 ? 'PROVEN_COMMITTED_BOUNDED_CANARY' : 'READBACK_FAILED',
    executionId,
    workspaceRevision: row?.workspace_revision ?? null,
    sourceCount: selection.sourceCount,
    sourceSelectionChecksum: selection.outputChecksum,
    fileCount: Number(row?.file_count ?? 0),
    completedStageCount: Number(row?.completed_stage_count ?? 0),
    completedAt: row?.completed_at ?? null,
    historicalGraphifyRunsChanged: false,
    broadGraphifyRun: false,
    canonicalAuthority: false,
    writesPerformed: true,
  };
  await mkdir(resolve(process.cwd(), '..', 'docs', 'reports'), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
} finally {
  if (locked) await releaseCoordinatorLock(client);
  await client.end();
}

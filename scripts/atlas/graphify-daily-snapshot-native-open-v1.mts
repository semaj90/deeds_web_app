import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  acquireCoordinatorLock,
  adaptSealedSnapshotSourcesToRepositoryQualifiedMembershipV2,
  openExecution,
  recordInventoryStage,
  recordRepositoryQualifiedSourceSelectionStageV2,
  releaseCoordinatorLock,
} from '../../sveltekit-frontend/src/lib/server/atlas/indexing/graphify-daily-coordinator-v1.js';

const ROOT = resolve(import.meta.dirname, '../..');
const DATABASE_URL = process.env.DATABASE_URL?.trim()
  ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const WORKSPACE_ID = '625743d2-092b-4fa8-abe0-9dc094920c80';
const AUTHORIZATION = 'AUTHORIZE_GRAPHIFY_POST_PHASE16_TERMINAL_RUN_V1';
const admissionPath = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const reportPath = resolve(ROOT, 'docs/reports/graphify-daily-lifecycle-v1.json');

type SnapshotSource = {
  repositoryId: string;
  repositoryRelativePath: string;
  sourceRef: string;
  sourceRevision: string;
  contentDigest: string;
  byteLength: number;
};

type Admission = { status?: string; authority?: boolean; workspaceRevision?: string; snapshotRevision?: string };
const sourceRowsRepositoryIds = (sources: SnapshotSource[]) => sources.map((source) => source.repositoryId);

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  if (process.env.ATLAS_GRAPHIFY_TERMINAL_AUTHORIZATION !== AUTHORIZATION) {
    throw new Error(`GRAPHIFY_TERMINAL_AUTHORIZATION=${AUTHORIZATION} is required`);
  }
  const admission = JSON.parse(await readFile(admissionPath, 'utf8')) as Admission;
  if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
    || admission.authority !== true
    || !admission.workspaceRevision
    || !admission.snapshotRevision) {
    throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_OPEN_ADMISSION_REQUIRED');
  }

  const snapshotPath = resolve(ROOT, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`);
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as { snapshotRevision?: string; sources?: SnapshotSource[] };
  if (snapshot.snapshotRevision !== admission.snapshotRevision || !snapshot.sources?.length) {
    throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_OPEN_SNAPSHOT_MISMATCH');
  }
  const materializedRoot = resolve(ROOT, '.tmp/workspace-source-snapshots', admission.snapshotRevision.replace(/^sha256:/, ''));
  if (!existsSync(materializedRoot)) throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_OPEN_MATERIALIZATION_MISSING');

  const descriptorPath = process.env.ATLAS_GRAPHIFY_EXECUTION_SOURCE_DESCRIPTOR?.trim();
  if (descriptorPath) {
    const descriptor = JSON.parse(await readFile(resolve(descriptorPath), 'utf8')) as {
      schema?: string; sourceKind?: string; workspaceRevision?: string;
      snapshotRevision?: string; materializedRoot?: string; sourceCount?: number;
      repositoryCount?: number; sourceCohortChecksum?: string; selectionChecksum?: string;
    };
    if (descriptor.schema !== 'atlas.graphify-execution-source.v2'
      || descriptor.sourceKind !== 'ADMITTED_WORKSPACE_SNAPSHOT'
      || descriptor.workspaceRevision !== admission.workspaceRevision
      || descriptor.snapshotRevision !== admission.snapshotRevision
      || resolve(descriptor.materializedRoot ?? '') !== materializedRoot
      || descriptor.sourceCount !== snapshot.sources.length
      || descriptor.repositoryCount !== new Set(sourceRowsRepositoryIds(snapshot.sources)).size
      || descriptor.sourceCohortChecksum !== undefined && descriptor.sourceCohortChecksum !== (snapshot as { sourceMembershipChecksum?: string }).sourceMembershipChecksum
      || descriptor.selectionChecksum !== undefined && descriptor.selectionChecksum !== (admission as Admission & { sourceSelectionChecksum?: string }).sourceSelectionChecksum) {
      throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_OPEN_SOURCE_DESCRIPTOR_MISMATCH');
    }
  }

  const sourceRows = snapshot.sources;
  const sourceIdentities = new Set<string>();
  const inventoryParts: string[] = [];
  for (const source of sourceRows) {
    const identity = `${source.repositoryId}:${source.repositoryRelativePath.replaceAll('\\', '/')}`;
    if (sourceIdentities.has(identity)) throw new Error(`GRAPHIFY_SNAPSHOT_NATIVE_OPEN_DUPLICATE_IDENTITY:${identity}`);
    sourceIdentities.add(identity);
    const sourcePath = resolve(materializedRoot, source.sourceRef.replaceAll('\\', '/'));
    if (!sourcePath.startsWith(`${materializedRoot}\\`) || !existsSync(sourcePath)) {
      throw new Error(`GRAPHIFY_SNAPSHOT_NATIVE_OPEN_SOURCE_MISSING:${source.sourceRef}`);
    }
    const bytes = await readFile(sourcePath);
    const fileStat = await stat(sourcePath);
    if (sha256(bytes) !== source.contentDigest || fileStat.size !== source.byteLength) {
      throw new Error(`GRAPHIFY_SNAPSHOT_NATIVE_OPEN_SOURCE_CHECKSUM_MISMATCH:${source.sourceRef}`);
    }
    inventoryParts.push(`${identity}\0${source.sourceRevision}\0${source.contentDigest}\0${source.byteLength}`);
  }

  const bindings = adaptSealedSnapshotSourcesToRepositoryQualifiedMembershipV2(admission.workspaceRevision, sourceRows);
  const inventoryOutputChecksum = `sha256:${sha256(inventoryParts.sort().join('\n'))}`;
  const client = new Client({ connectionString: DATABASE_URL });
  let locked = false;
  let transactionStarted = false;
  let executionId: string | null = null;
  try {
    await client.connect();
    await acquireCoordinatorLock(client);
    locked = true;
    await client.query('BEGIN');
    transactionStarted = true;
    const opened = await openExecution(client, {
      workspaceId: WORKSPACE_ID,
      workspaceRevision: admission.workspaceRevision,
      parserContractVersion: 'graphify.parser.v1',
      extractionContractVersion: 'graphify.extraction.v1',
      graphAlgorithmRevision: 'graphify.graph.v1',
      triggerKind: 'CURRENT_WORKSPACE_SOURCE_SELECTION',
      schedulerRevision: 'atlas.graphify-daily-snapshot-native-open.v1',
      environmentRevision: 'operator-authorized-terminal-run',
    });
    executionId = opened.executionId;
    const selection = await recordRepositoryQualifiedSourceSelectionStageV2(
      client,
      executionId,
      admission.workspaceRevision,
      bindings,
      { selectionPolicyRevision: `sealed-snapshot:${admission.snapshotRevision}` },
    );
    await recordInventoryStage(client, executionId, {
      inputChecksum: selection.outputChecksum,
      outputChecksum: inventoryOutputChecksum,
      receiptRef: 'docs/reports/graphify-daily-snapshot-native-open-v1.json',
    });

    const readback = await client.query(
      `SELECT e.execution_id, e.workspace_revision, e.status,
              (SELECT count(*)::int FROM public.graphify_execution_file_membership_v2 f WHERE f.execution_id = e.execution_id) AS membership_count
         FROM public.graphify_executions e WHERE e.execution_id = $1`,
      [executionId],
    );
    const row = readback.rows[0];
    if (row?.workspace_revision !== admission.workspaceRevision || Number(row?.membership_count) !== bindings.length) {
      throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_OPEN_READBACK_MISMATCH');
    }
    await client.query('COMMIT');
    transactionStarted = false;
    const report = {
      schema: 'atlas.graphify-daily-snapshot-native-open.v1',
      gate: 'GRAPHIFY-SNAPSHOT-NATIVE-OPEN-01',
      status: 'SNAPSHOT_NATIVE_EXECUTION_OPENED',
      executionId,
      workspaceRevision: admission.workspaceRevision,
      snapshotRevision: admission.snapshotRevision,
      selectedSourceCount: bindings.length,
      membershipV2Count: Number(row.membership_count),
      selectionChecksum: selection.outputChecksum,
      inventoryOutputChecksum,
      terminalStatus: 'RUNNING',
      canonicalAuthority: false,
      writesPerformed: true,
      legacyExecutionEvidenceMutated: false,
      projectionsWritten: false,
    };
    await import('node:fs/promises').then(({ writeFile, mkdir }) => mkdir(resolve(ROOT, 'docs/reports'), { recursive: true }).then(() => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')));
    console.log(JSON.stringify(report));
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => undefined);
      transactionStarted = false;
    }
    throw error;
  } finally {
    if (locked) await releaseCoordinatorLock(client);
    await client.end();
  }
}

main().catch((error) => {
  console.error(`GRAPHIFY_SNAPSHOT_NATIVE_OPEN_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

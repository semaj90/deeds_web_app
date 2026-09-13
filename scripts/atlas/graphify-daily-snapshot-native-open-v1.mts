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
const planPath = resolve(ROOT, 'docs/reports/graphify-source-selection-plan-v1.json');
const reportPath = resolve(ROOT, 'docs/reports/graphify-daily-lifecycle-v1.json');

type SnapshotSource = {
  repositoryId: string;
  repositoryRelativePath: string;
  sourceRef: string;
  sourceRevision: string;
  contentDigest: string;
  byteLength: number;
};

type SelectionBinding = {
  repositoryId: string;
  repositoryRelativePath: string;
  sourceRef: string;
  codeSourceRevision: string;
  contentHash: string;
  byteLength: number;
};

type Admission = {
  status?: string;
  authority?: boolean;
  workspaceRevision?: string;
  snapshotRevision?: string;
  snapshotSourceCount?: number;
  sourceCount?: number;
  sourceSelectionChecksum?: string;
  sourceInventoryRevision?: string;
  sourceInventoryChecksum?: string;
};

const sourceRowsRepositoryIds = (sources: SnapshotSource[]) => sources.map((source) => source.repositoryId);
const normalized = (value: unknown) => String(value ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
const identity = (value: { repositoryId?: string; repositoryRelativePath?: string; sourceRef?: string }) =>
  `${String(value.repositoryId ?? '')}:${normalized(value.repositoryRelativePath ?? value.sourceRef)}`;

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
    || !admission.snapshotRevision
    || !admission.sourceInventoryRevision
    || !admission.sourceInventoryChecksum
    || !admission.sourceSelectionChecksum
    || !Number.isInteger(admission.sourceCount)
    || Number(admission.sourceCount) <= 0) {
    throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_OPEN_ADMISSION_REQUIRED');
  }

  const plan = JSON.parse(await readFile(planPath, 'utf8')) as {
    status?: string;
    snapshotRevision?: string;
    sourceCount?: number;
    sourceSelectionChecksum?: string;
    sourceInventoryRevision?: string;
    sourceInventoryChecksum?: string;
    recurrencePreventionProven?: boolean;
    knownJunkExcluded?: boolean;
    bindings?: SelectionBinding[];
  };
  if (plan.status !== 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED'
    || plan.snapshotRevision !== admission.snapshotRevision
    || plan.sourceCount !== admission.sourceCount
    || plan.sourceSelectionChecksum !== admission.sourceSelectionChecksum
    || plan.sourceInventoryRevision !== admission.sourceInventoryRevision
    || plan.sourceInventoryChecksum !== admission.sourceInventoryChecksum
    || plan.recurrencePreventionProven !== true
    || plan.knownJunkExcluded !== true
    || !Array.isArray(plan.bindings)
    || plan.bindings.length !== admission.sourceCount) {
    throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_OPEN_SOURCE_SELECTION_PLAN_MISMATCH');
  }

  const snapshotPath = resolve(ROOT, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`);
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
    snapshotRevision?: string;
    sources?: SnapshotSource[];
    sourceMembershipChecksum?: string;
  };
  if (snapshot.snapshotRevision !== admission.snapshotRevision || !snapshot.sources?.length) {
    throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_OPEN_SNAPSHOT_MISMATCH');
  }
  if (admission.snapshotSourceCount !== undefined && snapshot.sources.length !== admission.snapshotSourceCount) {
    throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_OPEN_SNAPSHOT_SOURCE_COUNT_MISMATCH');
  }

  const snapshotByIdentity = new Map(snapshot.sources.map((source) => [identity(source), source] as const));
  const sourceRows: SnapshotSource[] = plan.bindings.map((binding) => {
    const key = identity(binding);
    const source = snapshotByIdentity.get(key);
    if (!source
      || normalized(source.sourceRef) !== normalized(binding.sourceRef)
      || source.sourceRevision !== binding.codeSourceRevision
      || source.contentDigest !== binding.contentHash
      || Number(source.byteLength) !== Number(binding.byteLength)) {
      throw new Error(`GRAPHIFY_SNAPSHOT_NATIVE_OPEN_SELECTED_SOURCE_BINDING_MISMATCH:${key}`);
    }
    return {
      repositoryId: binding.repositoryId,
      repositoryRelativePath: normalized(binding.repositoryRelativePath),
      sourceRef: normalized(binding.sourceRef),
      sourceRevision: binding.codeSourceRevision,
      contentDigest: binding.contentHash,
      byteLength: Number(binding.byteLength),
    };
  });

  const materializedRoot = resolve(ROOT, '.tmp/workspace-source-snapshots', admission.snapshotRevision.replace(/^sha256:/, ''));
  if (!existsSync(materializedRoot)) throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_OPEN_MATERIALIZATION_MISSING');

  const descriptorPath = process.env.ATLAS_GRAPHIFY_EXECUTION_SOURCE_DESCRIPTOR?.trim();
  if (descriptorPath) {
    const descriptor = JSON.parse(await readFile(resolve(descriptorPath), 'utf8')) as {
      schema?: string; sourceKind?: string; workspaceRevision?: string;
      snapshotRevision?: string; materializedRoot?: string; sourceCount?: number;
      repositoryCount?: number; sourceInventoryRevision?: string; sourceInventoryChecksum?: string;
      selectionChecksum?: string;
    };
    if (descriptor.schema !== 'atlas.graphify-execution-source.v2'
      || descriptor.sourceKind !== 'ADMITTED_CANONICAL_SOURCE_SELECTION'
      || descriptor.workspaceRevision !== admission.workspaceRevision
      || descriptor.snapshotRevision !== admission.snapshotRevision
      || resolve(descriptor.materializedRoot ?? '') !== materializedRoot
      || descriptor.sourceCount !== sourceRows.length
      || descriptor.repositoryCount !== new Set(sourceRowsRepositoryIds(sourceRows)).size
      || descriptor.sourceInventoryRevision !== admission.sourceInventoryRevision
      || descriptor.sourceInventoryChecksum !== admission.sourceInventoryChecksum
      || descriptor.selectionChecksum !== admission.sourceSelectionChecksum) {
      throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_OPEN_SOURCE_DESCRIPTOR_MISMATCH');
    }
  }

  const sourceIdentities = new Set<string>();
  const inventoryParts: string[] = [];
  for (const source of sourceRows) {
    const sourceIdentity = `${source.repositoryId}:${source.repositoryRelativePath.replaceAll('\\', '/')}`;
    if (sourceIdentities.has(sourceIdentity)) throw new Error(`GRAPHIFY_SNAPSHOT_NATIVE_OPEN_DUPLICATE_IDENTITY:${sourceIdentity}`);
    sourceIdentities.add(sourceIdentity);
    const sourcePath = resolve(materializedRoot, source.sourceRef.replaceAll('\\', '/'));
    const rootPrefix = `${materializedRoot}${process.platform === 'win32' ? '\\' : '/'}`;
    if (!sourcePath.startsWith(rootPrefix) || !existsSync(sourcePath)) {
      throw new Error(`GRAPHIFY_SNAPSHOT_NATIVE_OPEN_SOURCE_MISSING:${source.sourceRef}`);
    }
    const bytes = await readFile(sourcePath);
    const fileStat = await stat(sourcePath);
    if (sha256(bytes) !== source.contentDigest || fileStat.size !== source.byteLength) {
      throw new Error(`GRAPHIFY_SNAPSHOT_NATIVE_OPEN_SOURCE_CHECKSUM_MISMATCH:${source.sourceRef}`);
    }
    inventoryParts.push(`${sourceIdentity}\0${source.sourceRevision}\0${source.contentDigest}\0${source.byteLength}`);
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
      schedulerRevision: 'atlas.graphify-daily-snapshot-native-open.v2',
      environmentRevision: 'operator-authorized-terminal-run',
    });
    executionId = opened.executionId;
    const selection = await recordRepositoryQualifiedSourceSelectionStageV2(
      client,
      executionId,
      admission.workspaceRevision,
      bindings,
      {
        selectionPolicyRevision: `sealed-snapshot-canonical-inventory:${admission.snapshotRevision}:${admission.sourceInventoryChecksum}`,
      },
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
      snapshotSourceCount: snapshot.sources.length,
      selectedSourceCount: bindings.length,
      sourceInventoryRevision: admission.sourceInventoryRevision,
      sourceInventoryChecksum: admission.sourceInventoryChecksum,
      admittedSourceSelectionChecksum: admission.sourceSelectionChecksum,
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

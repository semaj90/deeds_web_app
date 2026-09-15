#!/usr/bin/env node
// GRAPHIFY-SNAPSHOT-NATIVE-RUN-BRIDGE-01 (2026-09-15, option-2 narrow adapter for stage-5 /
// GRAPHIFY_RUN_OWNER_BLOCKED): opens, binds, and completes a `graphify_runs` row for the SAME
// workspace_revision an already-COMPLETED, canonical-authority `graphify_executions` row carries.
//
// This is deliberately narrow and additive:
//   - Does NOT write to `graphify_executions` in any way (read-only against that table).
//   - Does NOT reuse the git-shaped `bindWorkspaceRevisionV1` (requires real git blob OIDs the
//     sealed-snapshot source model doesn't have) -- uses the new, git-free sibling
//     `bindSealedSnapshotWorkspaceRevisionV1` instead (see graphify-source-inventory-writer-v2.ts).
//   - Refuses to run unless exactly one `graphify_executions` row is COMPLETED with
//     canonical_authority=true (i.e. only after Gate 0A is resolved).
//   - Refuses if a `graphify_runs` row already exists for this workspace_revision (idempotent,
//     no duplicate runs).
//   - Dry-run by default; requires --apply AND
//     ATLAS_AUTHORIZE_GRAPHIFY_SNAPSHOT_NATIVE_RUN_BRIDGE_01=1 for real writes, matching this
//     repo's established apply-script convention (see apply-current-graphify-execution-owner-
//     decision-v1.mjs).
//
// The (transient) open receipt file this bridge would naturally read
// (docs/reports/graphify-daily-snapshot-native-open-v1.json) is no longer on disk -- derives the
// same fields directly from Postgres instead, which is more robust than depending on a report
// file that isn't itself part of this gate's canonical evidence.
//
// sourceManifestDigest choice: audit-current-graphify-run-owner-v1.mjs's `sourceManifestBound`
// gate only checks presence (source_manifest_digest AND source_manifest_source_count non-null),
// never a specific value. Rather than invent a new hash, this reuses the SOURCE_SELECTION stage's
// own already-computed, already-real output_checksum -- the exact checksum of the source set this
// execution actually selected -- so no second competing "manifest digest" concept is created.
//
// repository_revision choice: openGraphifyRunV1 requires a non-empty repository_revision, but a
// single git HEAD SHA doesn't meaningfully identify a sealed MULTI-repository snapshot. Uses the
// admitted snapshot's own `snapshotRevision` (a real, already-computed, content-addressed
// identifier for the exact source snapshot this execution touched) as the closest honest analog --
// not a placeholder, but also not literally a git commit. Recorded here explicitly so a future
// reader doesn't misinterpret it as a git SHA.
import { Client } from 'pg';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DATABASE_URL = process.env.DATABASE_URL?.trim()
  ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const WORKSPACE_ID = '625743d2-092b-4fa8-abe0-9dc094920c80';
const AUTHORIZE_ENV = 'ATLAS_AUTHORIZE_GRAPHIFY_SNAPSHOT_NATIVE_RUN_BRIDGE_01';
const reportPath = resolve(ROOT, 'docs/reports/graphify-daily-snapshot-native-complete-run-v1.json');

const APPLY = process.argv.includes('--apply');
const AUTHORIZED = process.env[AUTHORIZE_ENV] === '1';
const EXPECTED_WORKSPACE_REVISION = process.env.ATLAS_GRAPHIFY_EXPECTED_WORKSPACE_REVISION?.trim() || null;

type DerivedRunInputs = {
  workspaceRevision: string;
  snapshotRevision: string;
  executionId: string;
  selectionChecksum: string;
  selectedSourceCount: number;
};

async function deriveRunInputsFromDatabase(client: Client): Promise<DerivedRunInputs> {
  const execution = await client.query(
    `SELECT execution_id::text, workspace_revision, status, canonical_authority
       FROM public.graphify_executions
      WHERE status = 'COMPLETED' AND canonical_authority = true
        ${EXPECTED_WORKSPACE_REVISION ? 'AND workspace_revision = $1' : ''}`,
    EXPECTED_WORKSPACE_REVISION ? [EXPECTED_WORKSPACE_REVISION] : [],
  );
  if (execution.rowCount !== 1) {
    throw new Error(`GRAPHIFY_RUN_BRIDGE_NO_SINGLE_CANONICAL_COMPLETED_EXECUTION:${execution.rowCount}`);
  }
  const row = execution.rows[0];

  const stages = await client.query(
    `SELECT stage, output_checksum
       FROM public.graphify_execution_stages
      WHERE execution_id = $1 AND status = 'COMPLETED'`,
    [row.execution_id],
  );
  const sourceSelection = stages.rows.find((stage) => stage.stage === 'SOURCE_SELECTION');
  const inventory = stages.rows.find((stage) => stage.stage === 'INVENTORY');
  if (!sourceSelection?.output_checksum || !inventory) {
    throw new Error('GRAPHIFY_RUN_BRIDGE_REQUIRED_STAGES_MISSING');
  }

  const membership = await client.query(
    `SELECT count(*)::int AS count
       FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1`,
    [row.execution_id],
  );

  const admissionPath = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
  const admission = JSON.parse(await readFile(admissionPath, 'utf8')) as { snapshotRevision?: string; workspaceRevision?: string };
  if (admission.workspaceRevision !== row.workspace_revision || !admission.snapshotRevision) {
    throw new Error('GRAPHIFY_RUN_BRIDGE_ADMISSION_WORKSPACE_REVISION_MISMATCH');
  }

  return {
    workspaceRevision: row.workspace_revision,
    snapshotRevision: admission.snapshotRevision,
    executionId: row.execution_id,
    selectionChecksum: sourceSelection.output_checksum,
    selectedSourceCount: membership.rows[0]?.count ?? 0,
  };
}

async function main() {
  const { openGraphifyRunV1, bindSealedSnapshotWorkspaceRevisionV1, completeGraphifyRunV2 } = await import(
    'file:///' + resolve(ROOT, 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts').replace(/\\/g, '/')
  );

  const client = new Client({ connectionString: DATABASE_URL });
  const report: Record<string, unknown> = {
    schema: 'atlas.graphify-daily-snapshot-native-complete-run.v1',
    gate: 'GRAPHIFY-SNAPSHOT-NATIVE-RUN-BRIDGE-01',
    mode: APPLY && AUTHORIZED ? 'APPLY' : 'DRY_RUN',
    writesPerformed: false,
  };
  try {
    await client.connect();
    const inputs = await deriveRunInputsFromDatabase(client);
    report.workspaceRevision = inputs.workspaceRevision;
    report.executionId = inputs.executionId;

    const existingRun = await client.query(
      `SELECT run_id::text FROM public.graphify_runs WHERE workspace_revision = $1`,
      [inputs.workspaceRevision],
    );
    if (existingRun.rowCount && existingRun.rowCount > 0) {
      throw new Error(`GRAPHIFY_RUN_BRIDGE_RUN_ALREADY_EXISTS:${existingRun.rows[0].run_id}`);
    }
    report.preconditionsVerified = true;

    if (!APPLY || !AUTHORIZED) {
      report.wouldOpenRun = true;
      report.wouldBindWorkspaceRevision = true;
      report.wouldCompleteRun = true;
    } else {
      const wrappedClient = { query: (text: string, values?: unknown[]) => client.query(text, values) };
      const opened = await openGraphifyRunV1({
        client: wrappedClient,
        workspaceId: WORKSPACE_ID,
        repositoryRevision: inputs.snapshotRevision,
        parserContractVersion: 'graphify.parser.v1',
        extractionContractVersion: 'graphify.extraction.v1',
        configuration: { bridge: 'GRAPHIFY-SNAPSHOT-NATIVE-RUN-BRIDGE-01', sourceExecutionId: inputs.executionId },
      });
      report.runId = opened.runId;

      const bound = await bindSealedSnapshotWorkspaceRevisionV1({
        client: wrappedClient,
        runId: opened.runId,
        workspaceId: WORKSPACE_ID,
        record: {
          schema: 'atlas.sealed-snapshot-workspace-revision-binding.v1',
          workspaceRevision: inputs.workspaceRevision,
          snapshotRevision: inputs.snapshotRevision,
          sourceManifestDigest: inputs.selectionChecksum.replace(/^sha256:/, ''),
          sourceCount: inputs.selectedSourceCount,
        },
      });
      report.boundWorkspaceRevision = bound.workspaceRevision;

      await completeGraphifyRunV2({ client: wrappedClient, runId: opened.runId, workspaceId: WORKSPACE_ID });
      report.writesPerformed = true;

      const finalReadback = await client.query(
        `SELECT run_id::text, status, workspace_revision, source_manifest_digest, source_manifest_source_count
           FROM public.graphify_runs WHERE run_id = $1`,
        [opened.runId],
      );
      report.finalStatus = finalReadback.rows[0]?.status ?? null;
      report.readbackVerified = finalReadback.rows[0]?.status === 'COMPLETED';
    }
  } finally {
    await client.end();
  }

  await mkdir(resolve(ROOT, 'docs/reports'), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`GRAPHIFY_SNAPSHOT_NATIVE_COMPLETE_RUN_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

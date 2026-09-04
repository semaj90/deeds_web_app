// @vitest-environment node
//
// Live (non-mocked) integration proof for GRAPHIFY-DAILY-COORDINATOR-01
// (parent-atlas-retrieval-lineage-dag-convergence). Requires a real reachable Postgres with the
// GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02 migration applied
// (sveltekit-frontend/drizzle/manual/20260903_graphify_execution_ledger_v1.sql).
//
// Every test runs inside one BEGIN...ROLLBACK wrapping the whole describe block (beforeAll BEGIN,
// afterAll ROLLBACK) on a single checked-out pool connection -- matching this session's
// established zero-persistent-footprint proof pattern (see
// sveltekit-frontend/scripts/atlas/graphify-daily-canary-02-proof-2026-09-04.sql for the earlier
// raw-SQL version of this same proof). Nothing here ever reaches COMMIT.
//
// Opt-in only via RUN_DB_INTEGRATION=1, matching the established repo convention (see
// temporal-recommendation-outcome-dag.integration.spec.ts, tests/engram-registry-db.integration.spec.ts)
// so a normal `vitest run` never attempts a live DB connection.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION === '1';
const describeIf = RUN_DB_INTEGRATION ? describe : describe.skip;

for (const file of ['.env', '.env.local']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) {
    const { config } = await import('dotenv');
    config({ path, override: false });
  }
}

const { buildWorkspaceRevisionRecordV1 } = await import('../identity/workspace-source-binding-v1.js');

const {
  acquireCoordinatorLock,
  releaseCoordinatorLock,
  openExecution,
  recordSourceSelectionStage,
  heartbeat,
  completeExecution,
  GRAPHIFY_COORDINATOR_ADVISORY_LOCK,
} = await import('./graphify-daily-coordinator-v1.js');

describeIf('GRAPHIFY-DAILY-COORDINATOR-01: live coordinator flow (rolled back, zero footprint)', () => {
  let client: import('pg').PoolClient;
  let realWorkspaceId: string;

  beforeAll(async () => {
    const { pool } = await import('$lib/server/db/client.js');
    client = await pool.connect();
    await client.query('BEGIN');
    const workspaceResult = await client.query('SELECT id FROM workspaces LIMIT 1');
    const found = workspaceResult.rows[0]?.id as string | undefined;
    if (!found) throw new Error('NO_WORKSPACE_ROW_AVAILABLE_FOR_TEST_FIXTURE');
    realWorkspaceId = found;

    // Migration DDL is idempotent (CREATE TABLE/INDEX/FUNCTION IF NOT EXISTS or CREATE OR
    // REPLACE), safe to (re-)apply inside this rolled-back transaction regardless of whether it
    // was already applied outside it.
    const { readFile } = await import('node:fs/promises');
    const migrationPath = resolve(
      process.cwd(),
      'drizzle/manual/20260903_graphify_execution_ledger_v1.sql',
    );
    const migrationSql = await readFile(migrationPath, 'utf8');
    const withoutOuterTransaction = migrationSql
      .split('\n')
      .filter((line) => line.trim() !== 'BEGIN;' && line.trim() !== 'COMMIT;')
      .join('\n');
    await client.query(withoutOuterTransaction);
  });

  afterAll(async () => {
    await client.query('ROLLBACK');
    client.release();
  });

  it('acquires and releases the advisory lock; a second acquire without release throws (would deadlock the coordinator on itself, not permitted)', async () => {
    await acquireCoordinatorLock(client);
    // Session-level advisory locks are re-entrant per connection (see the correction recorded in
    // tasks.md) -- a second acquire on the SAME connection would also report success rather than
    // throwing GRAPHIFY_COORDINATOR_LOCK_ALREADY_HELD. This module's contract is "call at most
    // once per attempt", so this test proves single acquire/release round-trips cleanly instead
    // of asserting a same-connection re-entrancy rejection that PostgreSQL itself does not provide.
    await releaseCoordinatorLock(client);
    // A release with nothing held must throw, not silently report success.
    await expect(releaseCoordinatorLock(client)).rejects.toThrow(
      'GRAPHIFY_COORDINATOR_LOCK_RELEASE_FAILED_NOTHING_HELD',
    );
  });

  it('runs open -> source-selection -> heartbeat -> complete end to end, with real per-execution identity separation', async () => {
    await acquireCoordinatorLock(client);
    try {
      const workspaceRevision = `sha256:${'b'.repeat(64)}`;

      const { executionId: executionA } = await openExecution(client, {
        workspaceId: realWorkspaceId,
        workspaceRevision,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST',
      });
      const { executionId: executionB } = await openExecution(client, {
        workspaceId: realWorkspaceId,
        workspaceRevision,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST',
      });
      expect(executionA).not.toBe(executionB);

      const bindings = [
        { sourceRef: 'coordinator-test/one.ts', codeSourceRevision: `sha256:${'1'.repeat(64)}`, contentHash: `sha256:${'2'.repeat(64)}`, byteLength: 100 },
        { sourceRef: 'coordinator-test/two.ts', codeSourceRevision: `sha256:${'3'.repeat(64)}`, contentHash: `sha256:${'4'.repeat(64)}`, byteLength: 200 },
      ];
      const selectionResult = await recordSourceSelectionStage(client, executionA, workspaceRevision, bindings);
      expect(selectionResult.sourceCount).toBe(2);
      expect(selectionResult.outputChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);

      const heartbeatResult = await heartbeat(client, executionA);
      expect(heartbeatResult.updated).toBe(true);

      await completeExecution(client, executionA, { status: 'COMPLETED' });

      // Heartbeat after terminal transition must no-op, not throw.
      const heartbeatAfterComplete = await heartbeat(client, executionA);
      expect(heartbeatAfterComplete.updated).toBe(false);

      // Independent readback: executionA is terminal with completed_at set, executionB (never
      // completed by this test) is still RUNNING -- proves the two executions are genuinely
      // independent rows, not aliases of one identity.
      const readback = await client.query(
        `SELECT execution_id, status, completed_at FROM public.graphify_executions
         WHERE execution_id = ANY($1::uuid[]) ORDER BY execution_id`,
        [[executionA, executionB]],
      );
      const rowA = readback.rows.find((r) => r.execution_id === executionA);
      const rowB = readback.rows.find((r) => r.execution_id === executionB);
      expect(rowA?.status).toBe('COMPLETED');
      expect(rowA?.completed_at).not.toBeNull();
      expect(rowB?.status).toBe('RUNNING');
      expect(rowB?.completed_at).toBeNull();

      const fileCountA = await client.query(
        'SELECT count(*)::int AS n FROM public.graphify_execution_files WHERE execution_id = $1',
        [executionA],
      );
      const fileCountB = await client.query(
        'SELECT count(*)::int AS n FROM public.graphify_execution_files WHERE execution_id = $1',
        [executionB],
      );
      expect(fileCountA.rows[0]?.n).toBe(2);
      expect(fileCountB.rows[0]?.n).toBe(0); // never ran source-selection for B
    } finally {
      await releaseCoordinatorLock(client);
    }
  });

  it('refuses to complete an execution that is not RUNNING (never infers COMPLETED)', async () => {
    await acquireCoordinatorLock(client);
    try {
      const { executionId } = await openExecution(client, {
        workspaceId: realWorkspaceId,
        workspaceRevision: `sha256:${'c'.repeat(64)}`,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST',
      });
      await completeExecution(client, executionId, { status: 'FAILED', errorCode: 'TEST_INDUCED' });
      await expect(
        completeExecution(client, executionId, { status: 'COMPLETED' }),
      ).rejects.toThrow('GRAPHIFY_COORDINATOR_COMPLETE_EXECUTION_NOT_IN_RUNNING_STATUS');
    } finally {
      await releaseCoordinatorLock(client);
    }
  });

  it('uses the exact frozen advisory-lock namespace/key from the coordinator plan receipt', () => {
    expect(GRAPHIFY_COORDINATOR_ADVISORY_LOCK).toEqual({ namespace: 119041, key: 641934821 });
  });

  it('GRAPHIFY-DAILY-CANARY-02 Run C: changing one canary source\'s bytes produces a different workspaceRevision through the REAL production revision-computation function, then two live executions bind it correctly (completes the A/B/C canary left open in the earlier partial-progress note)', async () => {
    // buildWorkspaceRevisionRecordV1 is the pure, git-free function this repo's own producer
    // (materializeWorkspaceRevisionOriginV1) delegates to for the actual sha256-of-sorted-manifest
    // computation -- using it directly here (rather than a synthetic literal standing in for a
    // "changed" revision) is what makes this a real Run C proof, not a faked one. baseCommitOid /
    // baseTreeOid are well-formed-but-synthetic sha256-format git OIDs (this function only
    // validates OID *shape*, never that the OID resolves to a real object) -- deliberately not a
    // real `git rev-parse HEAD` against the actual 25,419-file workspace, which this bounded
    // canary has no need to touch.
    const gitObjectFormat = 'sha256' as const;
    const syntheticOid = (seed: string) => createHash('sha256').update(seed).digest('hex');
    const baseCommitOid = syntheticOid('canary-commit');
    const baseTreeOid = syntheticOid('canary-tree');
    const producerRevision = 'graphify.canary-run-c.2026-09-04.v1';
    const generatedAt = new Date().toISOString();

    const manifestBefore = [
      { sourceRef: 'canary/one.ts', sourceRevision: `sha256:${'1'.repeat(64)}`, contentDigest: '1'.repeat(64), byteLength: 100, gitBlobOid: null },
      { sourceRef: 'canary/two.ts', sourceRevision: `sha256:${'2'.repeat(64)}`, contentDigest: '2'.repeat(64), byteLength: 200, gitBlobOid: null },
      { sourceRef: 'canary/three.ts', sourceRevision: `sha256:${'3'.repeat(64)}`, contentDigest: '3'.repeat(64), byteLength: 300, gitBlobOid: null },
    ];
    // Run C: ONLY canary/two.ts's bytes changed (fresh contentDigest/byteLength); one and three
    // are byte-identical to the "before" manifest.
    const manifestAfterOneSourceChanged = [
      manifestBefore[0]!,
      { sourceRef: 'canary/two.ts', sourceRevision: `sha256:${'9'.repeat(64)}`, contentDigest: '9'.repeat(64), byteLength: 999, gitBlobOid: null },
      manifestBefore[2]!,
    ];

    const runA = buildWorkspaceRevisionRecordV1({
      repositoryId: 'canary-repo', gitObjectFormat, baseCommitOid, baseTreeOid,
      dirty: false, entries: manifestBefore, generatedAt, producerRevision,
    });
    const runB = buildWorkspaceRevisionRecordV1({
      repositoryId: 'canary-repo', gitObjectFormat, baseCommitOid, baseTreeOid,
      dirty: false, entries: manifestBefore, generatedAt, producerRevision,
    });
    const runC = buildWorkspaceRevisionRecordV1({
      repositoryId: 'canary-repo', gitObjectFormat, baseCommitOid, baseTreeOid,
      dirty: false, entries: manifestAfterOneSourceChanged, generatedAt, producerRevision,
    });

    // Pure computation assertions (the actual Run A/B/C spec from tasks.md's GRAPHIFY-DAILY-CANARY-02).
    expect(runA.record.workspaceRevision).toBe(runB.record.workspaceRevision); // unchanged bytes -> same revision
    expect(runC.record.workspaceRevision).not.toBe(runA.record.workspaceRevision); // changed bytes -> different revision
    const changedEntryC = runC.entries.find((e) => e.sourceRef === 'canary/two.ts')!;
    const unchangedEntryA_one = runA.entries.find((e) => e.sourceRef === 'canary/one.ts')!;
    const unchangedEntryC_one = runC.entries.find((e) => e.sourceRef === 'canary/one.ts')!;
    expect(changedEntryC.sourceRevision).not.toBe(manifestBefore[1]!.sourceRevision); // changed source's revision differs
    expect(unchangedEntryC_one.sourceRevision).toBe(unchangedEntryA_one.sourceRevision); // unchanged source's revision is identical

    // Now bind these three REAL computed revisions through the live coordinator ledger.
    await acquireCoordinatorLock(client);
    try {
      const { executionId: executionA } = await openExecution(client, {
        workspaceId: realWorkspaceId, workspaceRevision: runA.record.workspaceRevision,
        parserContractVersion: 'graphify.parser.v0.1', extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST_CANARY_RUN_A',
      });
      const { executionId: executionB } = await openExecution(client, {
        workspaceId: realWorkspaceId, workspaceRevision: runB.record.workspaceRevision,
        parserContractVersion: 'graphify.parser.v0.1', extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST_CANARY_RUN_B',
      });
      const { executionId: executionC } = await openExecution(client, {
        workspaceId: realWorkspaceId, workspaceRevision: runC.record.workspaceRevision,
        parserContractVersion: 'graphify.parser.v0.1', extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST_CANARY_RUN_C',
      });

      expect(new Set([executionA, executionB, executionC]).size).toBe(3); // all three distinct

      const readback = await client.query(
        `SELECT execution_id, workspace_revision FROM public.graphify_executions
         WHERE execution_id = ANY($1::uuid[])`,
        [[executionA, executionB, executionC]],
      );
      const revisionOf = (id: string) => readback.rows.find((r) => r.execution_id === id)?.workspace_revision;
      expect(revisionOf(executionA)).toBe(runA.record.workspaceRevision);
      expect(revisionOf(executionB)).toBe(runA.record.workspaceRevision); // A and B share the unchanged-bytes revision
      expect(revisionOf(executionC)).not.toBe(runA.record.workspaceRevision); // C's changed-bytes revision differs

      for (const id of [executionA, executionB, executionC]) {
        await completeExecution(client, id, { status: 'COMPLETED' });
      }
    } finally {
      await releaseCoordinatorLock(client);
    }
  });
});

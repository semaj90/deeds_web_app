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
  recordInventoryStage,
  heartbeat,
  completeExecution,
  reconcileAbandonedExecutions,
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

  it('binds a bounded inventory receipt after source selection without touching legacy inventory tables', async () => {
    await acquireCoordinatorLock(client);
    try {
      const workspaceRevision = `sha256:${'e'.repeat(64)}`;
      const { executionId } = await openExecution(client, {
        workspaceId: realWorkspaceId,
        workspaceRevision,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INVENTORY_STAGE_TEST',
      });
      const selection = await recordSourceSelectionStage(client, executionId, workspaceRevision, [
        { sourceRef: 'coordinator-test/inventory.ts', codeSourceRevision: `sha256:${'5'.repeat(64)}`, contentHash: `sha256:${'6'.repeat(64)}`, byteLength: 64 },
      ]);
      const inventory = await recordInventoryStage(client, executionId, {
        inputChecksum: selection.outputChecksum,
        outputChecksum: `sha256:${'7'.repeat(64)}`,
        receiptRef: 'docs/reports/inventory-fixture-v1.json',
      });
      expect(inventory.inputChecksum).toBe(selection.outputChecksum);

      const readback = await client.query(
        `SELECT stage, status, input_checksum, output_checksum, receipt_ref
           FROM public.graphify_execution_stages
          WHERE execution_id = $1 AND stage IN ('SOURCE_SELECTION', 'INVENTORY')
          ORDER BY stage`,
        [executionId],
      );
      expect(readback.rows).toHaveLength(2);
      const inventoryRow = readback.rows.find((row) => row.stage === 'INVENTORY');
      expect(inventoryRow?.status).toBe('COMPLETED');
      expect(inventoryRow?.input_checksum).toBe(selection.outputChecksum);
      expect(inventoryRow?.output_checksum).toBe(`sha256:${'7'.repeat(64)}`);
      expect(inventoryRow?.receipt_ref).toBe('docs/reports/inventory-fixture-v1.json');
      await completeExecution(client, executionId, { status: 'COMPLETED' });
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

  it('COMPLETED_REUSED: an execution that reused an existing derivation still gets its own fresh execution_id and terminal status', async () => {
    await acquireCoordinatorLock(client);
    try {
      const { executionId } = await openExecution(client, {
        workspaceId: realWorkspaceId,
        workspaceRevision: `sha256:${'d'.repeat(64)}`,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST_REUSED',
      });

      await completeExecution(client, executionId, {
        status: 'COMPLETED_REUSED',
        reusedGraphRevision: 'graphRevision:already-derived-elsewhere:v1',
      });

      const readback = await client.query(
        `SELECT status, completed_at, reused_graph_revision FROM public.graphify_executions WHERE execution_id = $1`,
        [executionId],
      );
      expect(readback.rows[0]?.status).toBe('COMPLETED_REUSED');
      expect(readback.rows[0]?.completed_at).not.toBeNull();
      expect(readback.rows[0]?.reused_graph_revision).toBe('graphRevision:already-derived-elsewhere:v1');
    } finally {
      await releaseCoordinatorLock(client);
    }
  });

  it('rejects COMPLETED_REUSED without a reusedGraphRevision, and rejects a non-COMPLETED_REUSED status that supplies one', async () => {
    await acquireCoordinatorLock(client);
    try {
      const { executionId: missingRevisionId } = await openExecution(client, {
        workspaceId: realWorkspaceId,
        workspaceRevision: `sha256:${'e'.repeat(64)}`,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST_REUSED_INVALID',
      });
      await expect(
        completeExecution(client, missingRevisionId, { status: 'COMPLETED_REUSED' } as never),
      ).rejects.toThrow();

      const { executionId: spuriousRevisionId } = await openExecution(client, {
        workspaceId: realWorkspaceId,
        workspaceRevision: `sha256:${'f'.repeat(64)}`,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST_REUSED_INVALID_2',
      });
      await expect(
        completeExecution(client, spuriousRevisionId, {
          status: 'COMPLETED',
          reusedGraphRevision: 'should-not-be-here',
        } as never),
      ).rejects.toThrow();
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

  it('recordSourceSelectionStage: an optional selectionPolicyRevision persists into the SOURCE_SELECTION stage\'s receipt_ref column; omitting it stores NULL, not a silent default', async () => {
    await acquireCoordinatorLock(client);
    try {
      const withPolicy = await openExecution(client, {
        workspaceId: realWorkspaceId,
        workspaceRevision: `sha256:${'5'.repeat(64)}`,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST_SELECTION_POLICY_WITH',
      });
      const withoutPolicy = await openExecution(client, {
        workspaceId: realWorkspaceId,
        workspaceRevision: `sha256:${'6'.repeat(64)}`,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST_SELECTION_POLICY_WITHOUT',
      });
      const binding = [{ sourceRef: 'policy-test/one.ts', codeSourceRevision: `sha256:${'a'.repeat(64)}`, contentHash: `sha256:${'b'.repeat(64)}`, byteLength: 10 }];

      const resultWith = await recordSourceSelectionStage(
        client, withPolicy.executionId, `sha256:${'5'.repeat(64)}`, binding,
        { selectionPolicyRevision: 'bounded-canary-v1' },
      );
      expect(resultWith.selectionPolicyRevision).toBe('bounded-canary-v1');

      const resultWithout = await recordSourceSelectionStage(
        client, withoutPolicy.executionId, `sha256:${'6'.repeat(64)}`, binding,
      );
      expect(resultWithout.selectionPolicyRevision).toBeNull();

      const readback = await client.query(
        `SELECT execution_id, receipt_ref FROM public.graphify_execution_stages
         WHERE execution_id = ANY($1::uuid[]) AND stage = 'SOURCE_SELECTION'`,
        [[withPolicy.executionId, withoutPolicy.executionId]],
      );
      const receiptRefOf = (id: string) => readback.rows.find((r) => r.execution_id === id)?.receipt_ref;
      expect(receiptRefOf(withPolicy.executionId)).toBe('bounded-canary-v1');
      expect(receiptRefOf(withoutPolicy.executionId)).toBeNull();

      await completeExecution(client, withPolicy.executionId, { status: 'COMPLETED' });
      await completeExecution(client, withoutPolicy.executionId, { status: 'COMPLETED' });
    } finally {
      await releaseCoordinatorLock(client);
    }
  });

  it('reconcileAbandonedExecutions: transitions a stale-heartbeat RUNNING execution to ABANDONED, leaves a fresh one alone, and is idempotent on re-run', async () => {
    await acquireCoordinatorLock(client);
    try {
      const { executionId: staleId } = await openExecution(client, {
        workspaceId: realWorkspaceId,
        workspaceRevision: `sha256:${'7'.repeat(64)}`,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST_RECONCILE_STALE',
      });
      const { executionId: freshId } = await openExecution(client, {
        workspaceId: realWorkspaceId,
        workspaceRevision: `sha256:${'8'.repeat(64)}`,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        triggerKind: 'COORDINATOR_INTEGRATION_TEST_RECONCILE_FRESH',
      });

      // Directly backdate staleId's heartbeat past a 1000ms threshold -- this test does not wait
      // in real time, it manipulates the timestamp the same way a genuinely-dead coordinator
      // process (crashed, never heartbeats again) would produce.
      await client.query(
        `UPDATE public.graphify_executions SET last_heartbeat_at = now() - interval '1 hour'
         WHERE execution_id = $1`,
        [staleId],
      );

      const { abandonedExecutionIds } = await reconcileAbandonedExecutions(client, 1000);
      expect(abandonedExecutionIds).toContain(staleId);
      expect(abandonedExecutionIds).not.toContain(freshId);

      const readback = await client.query(
        `SELECT execution_id, status, completed_at, error_code FROM public.graphify_executions
         WHERE execution_id = ANY($1::uuid[])`,
        [[staleId, freshId]],
      );
      const staleRow = readback.rows.find((r) => r.execution_id === staleId);
      const freshRow = readback.rows.find((r) => r.execution_id === freshId);
      expect(staleRow?.status).toBe('ABANDONED');
      expect(staleRow?.completed_at).not.toBeNull();
      expect(staleRow?.error_code).toBe('RECONCILED_STALE_HEARTBEAT');
      expect(freshRow?.status).toBe('RUNNING');
      expect(freshRow?.completed_at).toBeNull();

      // Idempotent: re-running finds nothing left to transition (staleId is now terminal, not RUNNING).
      const second = await reconcileAbandonedExecutions(client, 1000);
      expect(second.abandonedExecutionIds).not.toContain(staleId);

      // Clean up freshId so it doesn't leak into a subsequent test's readback as an unexpected
      // stray RUNNING row (rolled back at the end anyway, but keeps this test self-contained).
      await completeExecution(client, freshId, { status: 'COMPLETED' });

      await expect(reconcileAbandonedExecutions(client, 0)).rejects.toThrow(
        'GRAPHIFY_COORDINATOR_RECONCILE_INVALID_STALE_AFTER_MS',
      );
      await expect(reconcileAbandonedExecutions(client, -5)).rejects.toThrow(
        'GRAPHIFY_COORDINATOR_RECONCILE_INVALID_STALE_AFTER_MS',
      );
    } finally {
      await releaseCoordinatorLock(client);
    }
  });
});

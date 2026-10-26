#!/usr/bin/env npx tsx
/**
 * prove-workspace-event-fenced-roundtrip-v1.mts  (TRCF-22 / WORKSPACE-EVENT-BRIDGE-01)
 *
 * Drives the REAL Postgres adapter (writeFencedWorkspaceEventToPostgresV1) against the live
 * database inside ONE outer transaction that is ALWAYS rolled back. The adapter's own
 * BEGIN/COMMIT/ROLLBACK are translated to savepoints by a pool facade, so nothing can commit.
 * The reviewed base sidecar and the DRAFT provenance DDL are applied INSIDE that transaction
 * only; no table, row, or sequence value persists afterwards.
 *
 * Usage: npx tsx scripts/atlas/prove-workspace-event-fenced-roundtrip-v1.mts
 * Output: .tmp/atlas/workspace-event-fenced-roundtrip-receipt-v1.json (scratch receipt)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  buildWorkspaceEventProvenanceFromLeaseV1,
  createWorkspaceHeadV1,
  proposeWorkspaceEventV1,
  type WorkspaceHeadV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/workspace/workspace-event-sourcing-v1.js';
import { writeFencedWorkspaceEventToPostgresV1 } from '../../sveltekit-frontend/src/lib/server/atlas/workspace/workspace-event-head-postgres-adapter-v1.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ddlBase = fs.readFileSync(path.join(repoRoot, 'sveltekit-frontend/drizzle/manual/20260916_workspace_event_head_v1.sql'), 'utf8');
const ddlDraft = fs.readFileSync(path.join(repoRoot, 'sveltekit-frontend/drizzle/manual/20261017_workspace_event_provenance_v1_DRAFT.sql'), 'utf8');

const TABLES = [
  'atlas_workspace_events',
  'atlas_workspace_event_participants',
  'atlas_workspace_heads',
  'atlas_workspace_event_observations',
  'worktree_leases',
];
const hex = (c: string) => c.repeat(64);
const BASE = 'sha256:' + hex('1');
const DELTA = 'sha256:' + hex('2');
const AFTER = 'sha256:' + hex('3');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const results: Array<{ check: string; pass: boolean; detail?: unknown }> = [];
function check(name: string, pass: boolean, detail?: unknown) {
  results.push({ check: name, pass, ...(pass ? {} : { detail }) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass ? '' : ' :: ' + JSON.stringify(detail)}`);
}

async function main() {
  const connectionString = resolveDatabaseUrl(loadRepoEnv(process.env));
  const pool = new pg.Pool({ connectionString, max: 2 });
  const countObjects = async () =>
    Number(
      (
        await pool.query(
          `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
          [TABLES],
        )
      ).rows[0].n,
    );
  const countRows = async (sql: string) => Number((await pool.query(sql)).rows[0].n);
  const before = {
    objects: await countObjects(),
    outbox: await countRows(`SELECT count(*)::int AS n FROM public.atlas_projection_outbox`),
    canaryTasks: await countRows(`SELECT count(*)::int AS n FROM public.kanban_tasks WHERE task_id LIKE 'canary:%'`),
  };
  console.log('BEFORE', JSON.stringify(before));
  if (before.objects !== 0) throw new Error('REFUSING: temporal tables already exist; this proof assumes they are absent');

  const outer = await pool.connect();
  let savepointCounter = 0;
  const stack: string[] = [];
  const facade = {
    async connect() {
      return {
        async query(text: string, params?: unknown[]) {
          if (text === 'BEGIN') {
            const name = `sp_${++savepointCounter}`;
            stack.push(name);
            return outer.query(`SAVEPOINT ${name}`);
          }
          if (text === 'COMMIT') return outer.query(`RELEASE SAVEPOINT ${stack.pop()}`);
          if (text === 'ROLLBACK') {
            const name = stack.pop();
            await outer.query(`ROLLBACK TO SAVEPOINT ${name}`);
            return outer.query(`RELEASE SAVEPOINT ${name}`);
          }
          return outer.query(text, params as never);
        },
        release() {},
      };
    },
  } as never; // structural stand-in for the adapter's Pool (root and frontend @types/pg differ)

  let fatal: unknown = null;
  try {
    await outer.query('BEGIN');
    await outer.query(ddlBase);
    await outer.query(ddlDraft);

    // ---- seed throwaway authoritative state (kanban claim, lease, stream heads) -------------
    const seed = async (suffix: string, n: number, worktree: string, epoch: number) => {
      await outer.query(
        `INSERT INTO public.kanban_tasks (task_id, feature_id, feature_label, claim_token, claim_expires_at, current_run_id)
         VALUES ($1, 'canary', 'canary', $2, now() + interval '1 hour', $3)`,
        [`canary:task-${suffix}`, `tok-${suffix}-1`, `run-${suffix}`],
      );
      await outer.query(
        `INSERT INTO public.worktree_leases (lease_id, task_id, run_id, owner_agent, repository_root, worktree_path,
                                              branch_name, base_commit, status, expires_at, fence_epoch)
         VALUES ($1, $2, $3, $4, 'C:/canary-repo', $5, $6, 'abc123', 'ACTIVE', now() + interval '1 hour', $7)`,
        [uuid(n), `canary:task-${suffix}`, `run-${suffix}`, `agent-${suffix}`, worktree, `agent/${suffix}`, epoch],
      );
      const head = createWorkspaceHeadV1({ workspaceId: `repo#${worktree}`, baseSnapshotRevision: BASE, deltaRootChecksum: DELTA });
      await outer.query(
        `INSERT INTO public.atlas_workspace_heads (workspace_id, base_snapshot_revision, last_event_sequence, last_event_id,
                                                    last_event_checksum, delta_root_checksum, event_count_since_snapshot,
                                                    changed_source_count, workspace_head_revision)
         VALUES ($1, $2, 0, NULL, NULL, $3, 0, 0, $4)`,
        [head.workspaceId, BASE, DELTA, head.workspaceHeadRevision],
      );
      return head;
    };
    const headA0 = await seed('a', 0xa1, 'wt-a', 3);
    const headB0 = await seed('b', 0xb1, 'wt-b', 1);

    const authoritative = async (suffix: string, leaseN: number) => {
      const t = (await outer.query(`SELECT task_id, claim_token, current_run_id, claim_expires_at FROM public.kanban_tasks WHERE task_id = $1`, [`canary:task-${suffix}`])).rows[0];
      const l = (await outer.query(`SELECT * FROM public.worktree_leases WHERE lease_id = $1`, [uuid(leaseN)])).rows[0];
      return {
        task: { taskId: t.task_id, claimToken: t.claim_token, currentRunId: t.current_run_id, claimExpiresAt: t.claim_expires_at.toISOString() },
        lease: {
          leaseId: l.lease_id, taskId: l.task_id, runId: l.run_id, ownerAgent: l.owner_agent, worktreePath: l.worktree_path,
          branchName: l.branch_name, baseCommit: l.base_commit, status: l.status, expiresAt: l.expires_at.toISOString(),
          releasedAt: null, fenceEpoch: Number(l.fence_epoch),
        },
      };
    };

    const outbox = (tag: string) => ({
      sourceRevision: 'sha256:' + hex('5'),
      graphRevision: 'graph-rev-canary',
      representationRevision: 'semantic-768-v1',
      featureRevision: 'feature-rev-canary',
      stageReceiptChecksum: hex('9'),
      changedPacketKeys: [`packet:canary-${tag}`],
      projections: ['qdrant', 'neo4j'],
    });

    let eventCounter = 0;
    const propose = async (
      suffix: string, leaseN: number, head: WorkspaceHeadV1, key: string,
      over: { epoch?: number; token?: string; after?: string } = {},
    ) => {
      const a = await authoritative(suffix, leaseN);
      const { provenance, observation } = buildWorkspaceEventProvenanceFromLeaseV1({
        task: a.task, lease: a.lease,
        presentedFenceToken: over.token ?? a.task.claimToken!,
        presentedFenceEpoch: over.epoch ?? a.lease.fenceEpoch,
        idempotencyKey: key, tool: 'canary', now: new Date().toISOString(),
      });
      return proposeWorkspaceEventV1({
        head, eventId: uuid(0x100 + ++eventCounter), correlationId: uuid(0x900), eventType: 'SOURCE_UPDATED',
        occurredAt: new Date().toISOString(), producerRevision: 'canary-v1', deltaRootChecksum: DELTA,
        afterStateChecksum: over.after ?? AFTER,
        participants: [{ role: 'SOURCE', canonicalId: 'src/canary.ts', revision: 'sha256:' + hex('5'), relation: 'SUBJECT' }],
        provenance, observation,
      });
    };
    const write = (event: Awaited<ReturnType<typeof propose>>, tag: string) =>
      writeFencedWorkspaceEventToPostgresV1(facade, { event, outbox: outbox(tag) });
    const n = async (sql: string, params: unknown[] = []) => Number((await outer.query(sql, params)).rows[0].n);

    // ---- S1: happy path with exact readback ------------------------------------------------
    const e1 = await propose('a', 0xa1, headA0, 'k1');
    const r1 = await write(e1, 'a1');
    check('S1 append returns APPENDED with readback proven', r1.status === 'APPENDED' && (r1 as { readbackProven?: boolean }).readbackProven === true, r1);
    const stored = r1.status === 'APPENDED' ? r1.event : null;
    check('S1 provenance round-trips exactly', JSON.stringify(stored?.provenance) === JSON.stringify(e1.provenance), { stored: stored?.provenance, sent: e1.provenance });
    check('S1 observation read back, approval PENDING', stored?.observation?.approval === 'PENDING', stored?.observation);
    check('S1 event checksum unchanged by observation/DB clock', stored?.eventChecksum === e1.eventChecksum);
    check('S1 one event, one observation, one outbox row', (await n(`SELECT count(*)::int AS n FROM public.atlas_workspace_events`)) === 1
      && (await n(`SELECT count(*)::int AS n FROM public.atlas_workspace_event_observations`)) === 1
      && (await n(`SELECT count(*)::int AS n FROM public.atlas_projection_outbox WHERE aggregate_type = 'workspace_event'`)) === 1);
    check('S1 head advanced to sequence 1', (await n(`SELECT last_event_sequence::int AS n FROM public.atlas_workspace_heads WHERE workspace_id = 'repo#wt-a'`)) === 1);
    check('S1 observation recorded_at is DB-assigned (not the client string)',
      (await n(`SELECT count(*)::int AS n FROM public.atlas_workspace_event_observations WHERE recorded_at IS NOT NULL AND client_recorded_at IS NOT NULL AND recorded_at <> client_recorded_at`)) === 1);
    const headA1 = r1.status === 'APPENDED' ? r1.head : headA0;

    // ---- S2: duplicate delivery is idempotent ---------------------------------------------
    const r2 = await write(e1, 'a1');
    check('S2 duplicate returns DUPLICATE with no new rows', r2.status === 'DUPLICATE'
      && (await n(`SELECT count(*)::int AS n FROM public.atlas_workspace_events`)) === 1
      && (await n(`SELECT count(*)::int AS n FROM public.atlas_projection_outbox WHERE aggregate_type = 'workspace_event'`)) === 1, r2);

    // candidates built while the lease is still valid (the builder uses the client clock)
    const eExpired = await propose('a', 0xa1, headA1, 'k-expired');
    const eStale = await propose('a', 0xa1, headA1, 'k-stale');
    const eToken = await propose('a', 0xa1, headA1, 'k-token');
    const eOk2 = await propose('a', 0xa1, headA1, 'k2');

    // ---- S3: expiry is judged by the DATABASE clock; duplicate still idempotent after expiry
    await outer.query(`UPDATE public.worktree_leases SET expires_at = now() - interval '1 minute' WHERE lease_id = $1`, [uuid(0xa1)]);
    const r3a = await write(e1, 'a1');
    check('S3a duplicate after lease expiry is still DUPLICATE', r3a.status === 'DUPLICATE', r3a);
    const r3b = await write(eExpired, 'a-exp');
    check('S3b expired lease REJECTED by the DB clock', r3b.status === 'REJECTED' && r3b.reason === 'LEASE_EXPIRED', r3b);

    // ---- S4: stale fence epoch (zombie after reclaim) -------------------------------------
    await outer.query(`UPDATE public.worktree_leases SET expires_at = now() + interval '1 hour', fence_epoch = 4 WHERE lease_id = $1`, [uuid(0xa1)]);
    const r4 = await write(eStale, 'a-stale');
    check('S4 stale fence epoch REJECTED (STALE_FENCE_TOKEN)', r4.status === 'REJECTED' && r4.reason === 'STALE_FENCE_TOKEN', r4);

    // ---- S5: same epoch, rotated claim token ----------------------------------------------
    await outer.query(`UPDATE public.worktree_leases SET fence_epoch = 3 WHERE lease_id = $1`, [uuid(0xa1)]);
    await outer.query(`UPDATE public.kanban_tasks SET claim_token = 'tok-a-rotated' WHERE task_id = 'canary:task-a'`);
    const r5 = await write(eToken, 'a-tok');
    check('S5 rotated claim token REJECTED (FENCE_TOKEN_MISMATCH)', r5.status === 'REJECTED' && r5.reason === 'FENCE_TOKEN_MISMATCH', r5);
    check('S3-S5 rejections wrote nothing', (await n(`SELECT count(*)::int AS n FROM public.atlas_workspace_events`)) === 1
      && (await n(`SELECT count(*)::int AS n FROM public.atlas_projection_outbox WHERE aggregate_type = 'workspace_event'`)) === 1);

    // ---- S6: restore the true claim and the valid event appends at sequence 2 -------------
    await outer.query(`UPDATE public.kanban_tasks SET claim_token = 'tok-a-1' WHERE task_id = 'canary:task-a'`);
    const r6 = await write(eOk2, 'a2');
    check('S6 valid event after restoring the claim APPENDS at sequence 2', r6.status === 'APPENDED' && r6.head.lastEventSequence === 2n, r6);

    // ---- S7: independent worktree stream, same idempotency key, no cross-contamination ----
    const eB = await propose('b', 0xb1, headB0, 'k1');
    const r7 = await write(eB, 'b1');
    check('S7 independent worktree appends with the same idempotency key', r7.status === 'APPENDED', r7);
    check('S7 stream heads are independent (A=2, B=1)',
      (await n(`SELECT last_event_sequence::int AS n FROM public.atlas_workspace_heads WHERE workspace_id = 'repo#wt-a'`)) === 2
      && (await n(`SELECT last_event_sequence::int AS n FROM public.atlas_workspace_heads WHERE workspace_id = 'repo#wt-b'`)) === 1);

    // ---- S8: idempotency key reused for a DIFFERENT event is refused -----------------------
    const headA2 = r6.status === 'APPENDED' ? r6.head : headA1;
    const eDiff = await propose('a', 0xa1, headA2, 'k2', { after: 'sha256:' + hex('4') });
    const r8 = await write(eDiff, 'a-diff');
    check('S8 reused idempotency key with a different event REJECTED',
      r8.status === 'REJECTED' && r8.reason === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_EVENT', r8);

    check('FINAL events=3 observations=3 outbox=3',
      (await n(`SELECT count(*)::int AS n FROM public.atlas_workspace_events`)) === 3
      && (await n(`SELECT count(*)::int AS n FROM public.atlas_workspace_event_observations`)) === 3
      && (await n(`SELECT count(*)::int AS n FROM public.atlas_projection_outbox WHERE aggregate_type = 'workspace_event'`)) === 3);
  } catch (error) {
    fatal = error;
    console.error('FATAL', error instanceof Error ? error.stack : error);
  } finally {
    await outer.query('ROLLBACK').catch((e) => console.error('ROLLBACK_ERROR', e));
    outer.release();
  }

  const after = {
    objects: await countObjects(),
    outbox: await countRows(`SELECT count(*)::int AS n FROM public.atlas_projection_outbox`),
    canaryTasks: await countRows(`SELECT count(*)::int AS n FROM public.kanban_tasks WHERE task_id LIKE 'canary:%'`),
  };
  console.log('AFTER', JSON.stringify(after));
  check('ROLLBACK left nothing behind (objects, outbox rows, canary tasks)',
    after.objects === 0 && after.outbox === before.outbox && after.canaryTasks === before.canaryTasks, { before, after });
  await pool.end();

  const failed = results.filter((r) => !r.pass);
  const receipt = {
    schema: 'atlas.workspace-event-fenced-roundtrip-receipt.v1',
    generatedAt: new Date().toISOString(),
    mode: 'ROLLBACK_ONLY',
    writesPersisted: false,
    before,
    after,
    ddl: {
      base: crypto.createHash('sha256').update(ddlBase).digest('hex'),
      draft: crypto.createHash('sha256').update(ddlDraft).digest('hex'),
    },
    checks: results,
    passed: results.length - failed.length,
    failed: failed.length,
    fatal: fatal ? String(fatal instanceof Error ? fatal.message : fatal) : null,
  };
  const out = path.join(repoRoot, '.tmp/atlas/workspace-event-fenced-roundtrip-receipt-v1.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2));
  console.log(`RECEIPT ${path.relative(repoRoot, out)} passed=${receipt.passed} failed=${receipt.failed}`);
  process.exit(failed.length > 0 || fatal ? 1 : 0);
}

main();

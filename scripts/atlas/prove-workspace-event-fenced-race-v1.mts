#!/usr/bin/env npx tsx
/**
 * prove-workspace-event-fenced-race-v1.mts  (TRCF-22 / PG18-RACE-01 / NEXT-07)
 *
 * REAL multi-connection contention against the fenced append, on a DISPOSABLE Postgres only.
 * The adapter commits for real here, so this refuses to run unless ATLAS_RACE_DATABASE_URL points
 * at the throwaway database ("race") on a port other than 5434 (the live legal_ai_db).
 *
 *   docker run -d --name atlas-race-canary -e POSTGRES_USER=race -e POSTGRES_PASSWORD=race-canary-only \
 *     -e POSTGRES_DB=race -p 127.0.0.1:55434:5432 pgvector-pgsearch:pg18-local postgres
 *   (apply kanban_tasks + atlas_projection_outbox schema, the base sidecar, and the DRAFT)
 *   ATLAS_RACE_DATABASE_URL=postgres://race:race-canary-only@127.0.0.1:55434/race \
 *     npx tsx scripts/atlas/prove-workspace-event-fenced-race-v1.mts
 *
 * Determinism: a "gate" connection holds a row lock while writers queue behind it; the harness polls
 * pg_stat_activity until the writers are really blocked, mutates authoritative state, then releases.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  buildWorkspaceEventProvenanceFromLeaseV1,
  createWorkspaceHeadV1,
  proposeWorkspaceEventV1,
  type WorkspaceHeadV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/workspace/workspace-event-sourcing-v1.js';
import { writeFencedWorkspaceEventToPostgresV1 } from '../../sveltekit-frontend/src/lib/server/atlas/workspace/workspace-event-head-postgres-adapter-v1.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const urlRaw = process.env.ATLAS_RACE_DATABASE_URL;
if (!urlRaw) throw new Error('REFUSING: ATLAS_RACE_DATABASE_URL is required (disposable database only)');
const target = new URL(urlRaw);
if (target.port === '5434' || target.pathname.replace('/', '') !== 'race') {
  throw new Error(`REFUSING: ${target.hostname}:${target.port}${target.pathname} is not the disposable "race" database`);
}

const hex = (c: string) => c.repeat(64);
const BASE = 'sha256:' + hex('1');
const DELTA = 'sha256:' + hex('2');
const AFTER = 'sha256:' + hex('3');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const results: Array<{ check: string; pass: boolean; detail?: unknown }> = [];
function check(name: string, pass: boolean, detail?: unknown) {
  results.push({ check: name, pass, ...(pass ? {} : { detail }) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass ? '' : ' :: ' + JSON.stringify(detail)}`);
}

type Outcome = { ok: true; status: string; reason?: string } | { ok: false; error: string };
async function settle(p: Promise<{ status: string; reason?: string }>): Promise<Outcome> {
  try {
    const r = await p;
    return { ok: true, status: r.status, reason: (r as { reason?: string }).reason };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const pool = new pg.Pool({ connectionString: urlRaw, max: 24 });
  const n = async (sql: string, params: unknown[] = []) => Number((await pool.query(sql, params)).rows[0].n);

  async function waitForBlocked(count: number, timeoutMs = 10_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const blocked = await n(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = 'race' AND wait_event_type = 'Lock'`);
      if (blocked >= count) return blocked;
      await sleep(50);
    }
    throw new Error(`TIMEOUT: fewer than ${count} writers blocked on a lock`);
  }

  // ---- seeding (committed): one stream = kanban claim + worktree lease + empty head ---------
  let leaseCounter = 0;
  async function seed(tag: string, epoch = 3) {
    const leaseN = 0x500 + ++leaseCounter;
    await pool.query(
      `INSERT INTO public.kanban_tasks (task_id, feature_id, feature_label, claim_token, claim_expires_at, current_run_id)
       VALUES ($1, 'race', 'race', $2, now() + interval '1 hour', $3)`,
      [`race:task-${tag}`, `tok-${tag}`, `run-${tag}`],
    );
    await pool.query(
      `INSERT INTO public.worktree_leases (lease_id, task_id, run_id, owner_agent, repository_root, worktree_path,
                                            branch_name, base_commit, status, expires_at, fence_epoch)
       VALUES ($1, $2, $3, $4, 'C:/race-repo', $5, $6, 'abc123', 'ACTIVE', now() + interval '1 hour', $7)`,
      [uuid(leaseN), `race:task-${tag}`, `run-${tag}`, `agent-${tag}`, `wt-${tag}`, `agent/${tag}`, epoch],
    );
    const head = createWorkspaceHeadV1({ workspaceId: `repo#wt-${tag}`, baseSnapshotRevision: BASE, deltaRootChecksum: DELTA });
    await pool.query(
      `INSERT INTO public.atlas_workspace_heads (workspace_id, base_snapshot_revision, last_event_sequence, last_event_id,
                                                  last_event_checksum, delta_root_checksum, event_count_since_snapshot,
                                                  changed_source_count, workspace_head_revision)
       VALUES ($1, $2, 0, NULL, NULL, $3, 0, 0, $4)`,
      [head.workspaceId, BASE, DELTA, head.workspaceHeadRevision],
    );
    return { tag, leaseN, head };
  }

  let eventCounter = 0;
  async function propose(s: { tag: string; leaseN: number }, head: WorkspaceHeadV1, key: string, over: { after?: string } = {}) {
    const t = (await pool.query(`SELECT task_id, claim_token, current_run_id, claim_expires_at FROM public.kanban_tasks WHERE task_id = $1`, [`race:task-${s.tag}`])).rows[0];
    const l = (await pool.query(`SELECT * FROM public.worktree_leases WHERE lease_id = $1`, [uuid(s.leaseN)])).rows[0];
    const { provenance, observation } = buildWorkspaceEventProvenanceFromLeaseV1({
      task: { taskId: t.task_id, claimToken: t.claim_token, currentRunId: t.current_run_id, claimExpiresAt: t.claim_expires_at.toISOString() },
      lease: {
        leaseId: l.lease_id, taskId: l.task_id, runId: l.run_id, ownerAgent: l.owner_agent, worktreePath: l.worktree_path,
        branchName: l.branch_name, baseCommit: l.base_commit, status: l.status, expiresAt: l.expires_at.toISOString(),
        releasedAt: null, fenceEpoch: Number(l.fence_epoch),
      },
      presentedFenceToken: t.claim_token, presentedFenceEpoch: Number(l.fence_epoch),
      idempotencyKey: key, tool: 'race', now: new Date().toISOString(),
    });
    return proposeWorkspaceEventV1({
      head, eventId: uuid(0x1000 + ++eventCounter), correlationId: uuid(0x9000), eventType: 'SOURCE_UPDATED',
      occurredAt: new Date().toISOString(), producerRevision: 'race-v1', deltaRootChecksum: DELTA,
      afterStateChecksum: over.after ?? AFTER,
      participants: [{ role: 'SOURCE', canonicalId: 'src/race.ts', revision: 'sha256:' + hex('5'), relation: 'SUBJECT' }],
      provenance, observation,
    });
  }
  const outboxInput = (tag: string) => ({
    sourceRevision: 'sha256:' + hex('5'), graphRevision: 'graph-rev-race', representationRevision: 'semantic-768-v1',
    featureRevision: 'feature-rev-race', stageReceiptChecksum: hex('9'), changedPacketKeys: [`packet:race-${tag}`], projections: ['qdrant'],
  });
  const write = (event: Awaited<ReturnType<typeof propose>>, tag: string) =>
    settle(writeFencedWorkspaceEventToPostgresV1(pool as never, { event, outbox: outboxInput(tag) }));
  const streamCounts = async (tag: string) => ({
    events: await n(`SELECT count(*)::int AS n FROM public.atlas_workspace_events WHERE workspace_id = $1`, [`repo#wt-${tag}`]),
    outbox: await n(
      `SELECT count(*)::int AS n FROM public.atlas_projection_outbox o JOIN public.atlas_workspace_events e ON e.event_id = o.aggregate_id WHERE e.workspace_id = $1`,
      [`repo#wt-${tag}`],
    ),
    headSeq: await n(`SELECT last_event_sequence::int AS n FROM public.atlas_workspace_heads WHERE workspace_id = $1`, [`repo#wt-${tag}`]),
  });
  const gate = async () => {
    const c = await pool.connect();
    await c.query('BEGIN');
    return c;
  };
  const release = async (c: pg.PoolClient, sql?: string) => {
    if (sql) await c.query(sql);
    await c.query('COMMIT');
    c.release();
  };

  const startedAt = new Date().toISOString();
  let fatal: unknown = null;
  try {
    // ---- R1: two DIFFERENT events race for the same sequence on one stream ---------------
    {
      const s = await seed('r1');
      const [eA, eB] = [await propose(s, s.head, 'ka'), await propose(s, s.head, 'kb')];
      const g = await gate();
      await g.query(`SELECT 1 FROM public.atlas_workspace_heads WHERE workspace_id = $1 FOR UPDATE`, [s.head.workspaceId]);
      const pa = write(eA, 'r1a'); const pb = write(eB, 'r1b');
      const blocked = await waitForBlocked(2);
      await release(g);
      const [ra, rb] = await Promise.all([pa, pb]);
      const appended = [ra, rb].filter((r) => r.ok && r.status === 'APPENDED').length;
      const conflict = [ra, rb].filter((r) => !r.ok && /WORKSPACE_EVENT_SEQUENCE_CONFLICT/.test((r as { error: string }).error)).length;
      const c = await streamCounts('r1');
      check('R1 two writers were genuinely blocked on the head lock', blocked >= 2, { blocked });
      check('R1 exactly one APPENDED and one sequence conflict', appended === 1 && conflict === 1, { ra, rb });
      check('R1 one event, one outbox row, head at sequence 1', c.events === 1 && c.outbox === 1 && c.headSeq === 1, c);
    }

    // ---- R2: the SAME event delivered twice concurrently -----------------------------------
    {
      const s = await seed('r2');
      const e = await propose(s, s.head, 'k1');
      const g = await gate();
      await g.query(`SELECT 1 FROM public.atlas_workspace_heads WHERE workspace_id = $1 FOR UPDATE`, [s.head.workspaceId]);
      const pa = write(e, 'r2'); const pb = write(e, 'r2');
      await waitForBlocked(2);
      await release(g);
      const outs = await Promise.all([pa, pb]);
      const statuses = outs.map((o) => (o.ok ? o.status : 'ERR')).sort();
      const c = await streamCounts('r2');
      check('R2 concurrent duplicate delivery: one APPENDED, one DUPLICATE', statuses.join() === 'APPENDED,DUPLICATE', outs);
      check('R2 exactly one event and one outbox row', c.events === 1 && c.outbox === 1, c);
    }

    // ---- R3: zombie admitted before a reclaim; reclaim commits while it waits on the head --
    {
      const s = await seed('r3');
      const e = await propose(s, s.head, 'k1'); // built at epoch 3
      const g = await gate();
      await g.query(`SELECT 1 FROM public.atlas_workspace_heads WHERE workspace_id = $1 FOR UPDATE`, [s.head.workspaceId]);
      const pw = write(e, 'r3');
      await waitForBlocked(1);
      await release(g, `UPDATE public.worktree_leases SET fence_epoch = 4 WHERE lease_id = '${uuid(s.leaseN)}'`);
      const r = await pw;
      const c = await streamCounts('r3');
      check('R3 zombie (epoch 3) REJECTED after a reclaim committed while it waited', r.ok && r.status === 'REJECTED' && r.reason === 'STALE_FENCE_TOKEN', r);
      check('R3 zombie wrote nothing', c.events === 0 && c.outbox === 0 && c.headSeq === 0, c);
    }

    // ---- R4: writer holds the head lock and blocks on the LEASE row; reclaim commits ------
    {
      const s = await seed('r4');
      const e = await propose(s, s.head, 'k1');
      const g = await gate();
      await g.query(`SELECT 1 FROM public.worktree_leases WHERE lease_id = $1 FOR UPDATE`, [uuid(s.leaseN)]);
      const pw = write(e, 'r4');
      await waitForBlocked(1);
      await release(g, `UPDATE public.worktree_leases SET fence_epoch = 4 WHERE lease_id = '${uuid(s.leaseN)}'`);
      const r = await pw;
      const c = await streamCounts('r4');
      check('R4 writer blocked on the lease row sees the reclaim: STALE_FENCE_TOKEN', r.ok && r.status === 'REJECTED' && r.reason === 'STALE_FENCE_TOKEN', r);
      check('R4 wrote nothing', c.events === 0 && c.outbox === 0, c);
    }

    // ---- R4b: claim token rotated while the writer waits on the kanban claim row ----------
    {
      const s = await seed('r4b');
      const e = await propose(s, s.head, 'k1');
      const g = await gate();
      await g.query(`SELECT 1 FROM public.kanban_tasks WHERE task_id = $1 FOR UPDATE`, [`race:task-r4b`]);
      const pw = write(e, 'r4b');
      await waitForBlocked(1);
      await release(g, `UPDATE public.kanban_tasks SET claim_token = 'tok-rotated' WHERE task_id = 'race:task-r4b'`);
      const r = await pw;
      check('R4b rotated claim token seen after the claim row unlocks: FENCE_TOKEN_MISMATCH', r.ok && r.status === 'REJECTED' && r.reason === 'FENCE_TOKEN_MISMATCH', r);
    }

    // ---- R5: independent worktree streams never block each other --------------------------
    {
      const a = await seed('r5a'); const b = await seed('r5b');
      const eA = await propose(a, a.head, 'k1'); const eB = await propose(b, b.head, 'k1');
      const g = await gate();
      await g.query(`SELECT 1 FROM public.atlas_workspace_heads WHERE workspace_id = $1 FOR UPDATE`, [a.head.workspaceId]);
      const pa = write(eA, 'r5a');
      await waitForBlocked(1);
      const rb = await Promise.race([write(eB, 'r5b'), sleep(8000).then(() => 'TIMEOUT' as const)]);
      check('R5 stream B completes while stream A is blocked on its own head lock', rb !== 'TIMEOUT' && rb.ok && rb.status === 'APPENDED', rb);
      await release(g);
      const ra = await pa;
      check('R5 stream A completes after release', ra.ok && ra.status === 'APPENDED', ra);
      check('R5 each stream advanced independently', (await streamCounts('r5a')).headSeq === 1 && (await streamCounts('r5b')).headSeq === 1);
    }

    // ---- R6: stress, 3 streams x 4 concurrent distinct events at one sequence --------------
    {
      const streams = [await seed('r6a'), await seed('r6b'), await seed('r6c')];
      const jobs: Array<Promise<Outcome>> = [];
      for (const s of streams) {
        for (let i = 0; i < 4; i++) jobs.push(write(await propose(s, s.head, `k${i}`), `r6${s.tag}${i}`));
      }
      const outs = await Promise.all(jobs);
      const deadlocks = outs.filter((o) => !o.ok && /deadlock|40P01/i.test(o.error)).length;
      const appended = outs.filter((o) => o.ok && o.status === 'APPENDED').length;
      const conflicts = outs.filter((o) => !o.ok && /WORKSPACE_EVENT_SEQUENCE_CONFLICT/.test(o.error)).length;
      check('R6 no deadlocks under 12 concurrent writers', deadlocks === 0, outs);
      check('R6 exactly one winner per stream (3 APPENDED, 9 sequence conflicts)', appended === 3 && conflicts === 9, { appended, conflicts });
    }

    // ---- global consistency ---------------------------------------------------------------
    const events = await n(`SELECT count(*)::int AS n FROM public.atlas_workspace_events`);
    const observations = await n(`SELECT count(*)::int AS n FROM public.atlas_workspace_event_observations`);
    const outbox = await n(`SELECT count(*)::int AS n FROM public.atlas_projection_outbox WHERE aggregate_type = 'workspace_event'`);
    const orphanOutbox = await n(`SELECT count(*)::int AS n FROM public.atlas_projection_outbox o WHERE NOT EXISTS (SELECT 1 FROM public.atlas_workspace_events e WHERE e.event_id = o.aggregate_id)`);
    const badHeads = await n(
      `SELECT count(*)::int AS n FROM public.atlas_workspace_heads h
        WHERE h.last_event_sequence <> (SELECT count(*) FROM public.atlas_workspace_events e WHERE e.workspace_id = h.workspace_id)`,
    );
    check('FINAL events = observations = outbox rows, no orphan outbox', events === observations && events === outbox && orphanOutbox === 0, { events, observations, outbox, orphanOutbox });
    check('FINAL every head sequence equals its stream event count', badHeads === 0, { badHeads });
  } catch (error) {
    fatal = error;
    console.error('FATAL', error instanceof Error ? error.stack : error);
  } finally {
    await pool.end();
  }

  const failed = results.filter((r) => !r.pass);
  const receipt = {
    schema: 'atlas.workspace-event-fenced-race-receipt.v1',
    startedAt, finishedAt: new Date().toISOString(),
    mode: 'DISPOSABLE_DATABASE_REAL_COMMITS',
    target: `${target.hostname}:${target.port}${target.pathname}`,
    liveDatabaseTouched: false,
    checks: results, passed: results.length - failed.length, failed: failed.length,
    fatal: fatal ? String(fatal instanceof Error ? fatal.message : fatal) : null,
  };
  const out = path.join(repoRoot, '.tmp/atlas/workspace-event-fenced-race-receipt-v1.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2));
  console.log(`RECEIPT ${path.relative(repoRoot, out)} passed=${receipt.passed} failed=${receipt.failed}`);
  process.exit(failed.length > 0 || fatal ? 1 : 0);
}

main();

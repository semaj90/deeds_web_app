#!/usr/bin/env node

/**
 * Read-only high-water compaction planner.
 *
 * This plans compaction from the durable event/head sidecar. It never reads
 * the worktree, creates a snapshot, advances a head, or writes a database.
 * Events after the selected cut are intentionally outside the plan.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/workspace-head-compaction-plan-v1.json');
const workspaceId = process.argv.find((arg) => arg.startsWith('--workspace-id='))?.split('=')[1] ?? null;
const requestedCut = process.argv.find((arg) => arg.startsWith('--cut-sequence='))?.split('=')[1] ?? null;
const policyRevision = 'atlas.workspace-head-compaction-policy.v1';

const checksum = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
const writeReport = (report) => {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const tempPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, reportPath);
};

const base = {
  schema: 'atlas.workspace-head-compaction-plan.v1',
  workspaceId,
  policyRevision,
  canonicalAuthority: false,
  promotionEligible: false,
  writesPerformed: false,
};

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 30000 });
let report;
try {
  const tableResult = await pool.query(`
    SELECT to_regclass('public.atlas_workspace_heads') IS NOT NULL AS heads,
           to_regclass('public.atlas_workspace_events') IS NOT NULL AS events,
           to_regclass('public.atlas_workspace_event_participants') IS NOT NULL AS participants`);
  const tables = tableResult.rows[0];
  if (!tables.heads || !tables.events || !tables.participants) {
    report = {
      ...base,
      status: 'BLOCKED_SIDECAR_NOT_APPLIED',
      due: false,
      cut: null,
      eventRange: { firstSequence: '0', lastSequence: '0', eventCount: 0, eventChainChecksum: null },
      candidate: { headStateRootChecksum: null, candidateSnapshotRevision: null },
      validation: { sequenceContinuous: false, predecessorChainValid: false, replayDeterministic: false, laterEventsIgnored: false },
      tables,
    };
  } else {
    const head = (await pool.query(`
      SELECT workspace_id::text, base_snapshot_revision, workspace_head_revision,
             last_event_sequence::text, last_event_id::text, last_event_checksum,
             delta_root_checksum, event_count_since_snapshot, changed_source_count
        FROM public.atlas_workspace_heads
       WHERE ($1::text IS NULL OR workspace_id::text = $1)
       ORDER BY workspace_id::text
       LIMIT 1`, [workspaceId])).rows[0] ?? null;
    if (!head) {
      report = { ...base, status: 'NO_HEAD_FOR_WORKSPACE', due: false, cut: null,
        eventRange: { firstSequence: '0', lastSequence: '0', eventCount: 0, eventChainChecksum: null },
        candidate: { headStateRootChecksum: null, candidateSnapshotRevision: null },
        validation: { sequenceContinuous: false, predecessorChainValid: false, replayDeterministic: false, laterEventsIgnored: false }, tables };
    } else {
      const cut = requestedCut === null ? BigInt(head.last_event_sequence) : BigInt(requestedCut);
      const events = (await pool.query(`
        SELECT event_id::text, sequence::text, previous_head_revision,
               workspace_head_revision, delta_root_checksum, after_state_checksum,
               event_checksum, workspace_id::text
          FROM public.atlas_workspace_events
         WHERE workspace_id::text = $1
           AND base_snapshot_revision = $2
           AND sequence <= $3::bigint
         ORDER BY sequence`, [head.workspace_id, head.base_snapshot_revision, cut.toString()])).rows;
      const first = events[0] ?? null;
      const last = events.at(-1) ?? null;
      let continuous = true;
      let predecessorValid = true;
      let expected = BigInt(head.last_event_sequence) + 1n;
      let previousHead = head.workspace_head_revision;
      for (const event of events) {
        if (BigInt(event.sequence) !== expected) continuous = false;
        if (event.previous_head_revision !== previousHead) predecessorValid = false;
        expected = BigInt(event.sequence) + 1n;
        previousHead = event.workspace_head_revision;
      }
      const cutReachable = last && BigInt(last.sequence) === cut;
      const valid = Boolean(cutReachable && continuous && predecessorValid);
      const eventChainChecksum = valid ? checksum({ schema: 'atlas.workspace-event-stream.v1', events: events.map((e) => ({ sequence: e.sequence, eventChecksum: e.event_checksum })) }) : null;
      const cutStateRootChecksum = valid ? (last.delta_root_checksum ?? last.after_state_checksum) : null;
      const candidateSnapshotRevision = valid ? checksum({ schema: 'atlas.workspace-snapshot-candidate.v1', workspaceId: head.workspace_id, baseSnapshotRevision: head.base_snapshot_revision, cutSequence: cut.toString(), cutEventChecksum: last.event_checksum, headStateRootChecksum: cutStateRootChecksum }) : null;
      report = {
        ...base,
        workspaceId: head.workspace_id,
        status: valid ? 'READY_FOR_EXPLICIT_COMPACTION' : (events.length ? 'REPLAY_MISMATCH' : 'NO_EVENTS'),
        due: valid && (Number(head.event_count_since_snapshot) > 0 || Number(head.changed_source_count) > 0),
        cut: valid ? { eventSequence: cut.toString(), eventId: last.event_id, eventChecksum: last.event_checksum, workspaceHeadRevision: last.workspace_head_revision } : null,
        eventRange: { firstSequence: first?.sequence ?? '0', lastSequence: last?.sequence ?? '0', eventCount: events.length, eventChainChecksum },
        candidate: { headStateRootChecksum: cutStateRootChecksum, candidateSnapshotRevision },
        validation: { sequenceContinuous: continuous, predecessorChainValid: predecessorValid, replayDeterministic: valid, laterEventsIgnored: BigInt(head.last_event_sequence) > cut },
        sourceCounts: { changed: Number(head.changed_source_count), eventsSinceSnapshot: Number(head.event_count_since_snapshot) },
        tables,
      };
    }
  }
} catch (error) {
  report = { ...base, status: 'BLOCKED_DATABASE_READ', due: false, error: error instanceof Error ? error.message : String(error) };
} finally {
  await pool.end();
}

report.planChecksum = checksum({ ...report, generatedAt: undefined, planChecksum: undefined });
writeReport({ ...report, generatedAt: new Date().toISOString() });
console.log(JSON.stringify({ status: report.status, workspaceId: report.workspaceId, cut: report.cut?.eventSequence ?? null, writesPerformed: false, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));

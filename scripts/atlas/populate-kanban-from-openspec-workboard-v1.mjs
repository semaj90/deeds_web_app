#!/usr/bin/env node
/**
 * populate-kanban-from-openspec-workboard-v1.mjs
 *
 * Creates kanban tickets for ACTIONABLE OpenSpec work items through the canonical
 * creator (createKanbanTask: task row + `ticket_created` event in one transaction).
 * DRY-RUN by default. Writes only with --apply. Existing task_ids are never touched.
 *
 * Identity (defined here, deterministic, no inference):
 *   task_id        = workboard `stableKey`  (<change>#<16 hex>, content-hashed, unique, survives line shifts)
 *   feature_id     = `openspec:<change>`    (a change is OpenSpec's feature unit)
 *   feature_label  = change H1 (proposal.md, then tasks.md); fallback = humanized slug (labelSource=slug)
 *   source_refs    = [`openspec/changes/<change>/tasks.md#L<line>`]
 *   idempotency    = stableKey; lane=todo; workspace/graphify/feature revisions = null (none admitted)
 * Scope: state OPEN + kind WORK_ITEM + executionState ACTIONABLE. WAITING_ON_DEPENDENCY is excluded
 * (the lane enum has no `blocked`); DONE is excluded (history, not a queue).
 *
 * Run from sveltekit-frontend/ (module aliases + .env):
 *   node --env-file=.env --loader ./scripts/node-ts-loader.mjs ../scripts/atlas/populate-kanban-from-openspec-workboard-v1.mjs [--apply] [--limit=N] [--analyze]
 *   --analyze is opt-in, requires --limit=1..25, and attaches 8095 proposal metadata to ticket_created events.
 *   ... --rollback --receipt=<path>   removes only rows listed in a receipt that are still untouched (pending, 0 attempts)
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { verifyWorkboardTaskSourceBindingV1 } from './lib/workboard-source-binding-audit-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FE = path.join(ROOT, 'sveltekit-frontend');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) ?? '').slice(n.length + 3) || d;
const APPLY = flag('apply');
const ROLLBACK = flag('rollback');
const ANALYZE = flag('analyze');
const LIMIT = Number(opt('limit', '0')) || Infinity;
const WORKBOARD = path.resolve(ROOT, opt('workboard', 'docs/reports/openspec-workboard-v1.json'));
const RECEIPT_DIR = path.join(ROOT, '.tmp', 'atlas');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required (run with --env-file=.env from sveltekit-frontend/)');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, statement_timeout: 30000 });

function title(change) {
  for (const f of ['proposal.md', 'tasks.md']) {
    const p = path.join(ROOT, 'openspec', 'changes', change, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^#\s+(.+)$/m);
    if (m) return { label: m[1].trim().slice(0, 200), labelSource: f };
  }
  const humanized = change.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { label: humanized, labelSource: 'slug' };
}

async function rollback() {
  const receiptPath = path.resolve(opt('receipt', ''));
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const ids = receipt.created ?? [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eligible = (await client.query(
      `SELECT task_id FROM kanban_tasks WHERE task_id = ANY($1) AND status = 'pending' AND attempt_count = 0 AND claim_token IS NULL AND idempotency_key = task_id`,
      [ids])).rows.map((r) => r.task_id);
    const skipped = ids.length - eligible.length;
    if (APPLY) {
      await client.query(`DELETE FROM kanban_task_events WHERE task_id = ANY($1)`, [eligible]);
      await client.query(`DELETE FROM kanban_tasks WHERE task_id = ANY($1)`, [eligible]);
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }
    console.log(`${APPLY ? 'ROLLED BACK' : 'DRY-RUN rollback would remove'} ${eligible.length} tickets; ${skipped} left alone (touched or already gone)`);
  } finally { client.release(); }
}

async function main() {
  if (ROLLBACK) return rollback();
  if (ANALYZE && (!Number.isFinite(LIMIT) || LIMIT < 1 || LIMIT > 25)) {
    throw new Error('--analyze requires an explicit --limit between 1 and 25');
  }
  const wb = JSON.parse(readFileSync(WORKBOARD, 'utf8'));
  const eligible = wb.taskInventory.filter((t) => t.state === 'OPEN' && t.kind === 'WORK_ITEM' && t.executionState === 'ACTIONABLE');

  const titles = new Map();
  for (const c of new Set(eligible.map((t) => t.change))) titles.set(c, title(c));

  const plan = eligible.map((t) => {
    const { label, labelSource } = titles.get(t.change);
    return {
      taskId: t.stableKey,
      featureId: `openspec:${t.change}`,
      featureLabel: label,
      labelSource,
      sourceRefs: [`${t.source}#L${t.line}`],
      lane: 'todo',
      priority: Math.max(0, Math.min(100, Math.trunc(t.priority ?? 0))),
      idempotencyKey: t.stableKey,
      text: t.text,
    };
  });

  const ids = plan.map((p) => p.taskId);
  const existing = new Set((await pool.query(`SELECT task_id FROM kanban_tasks WHERE task_id = ANY($1)`, [ids])).rows.map((r) => r.task_id));
  const toCreate = plan.filter((p) => !existing.has(p.taskId)).slice(0, LIMIT);
  for (const task of toCreate) {
    const sourceTask = wb.taskInventory.find((row) => row.stableKey === task.taskId);
    const binding = verifyWorkboardTaskSourceBindingV1({
      repoRoot: ROOT,
      task: sourceTask,
      sourceFileHashes: wb.sourceFileHashes,
    });
    if (binding.status !== 'SOURCE_REFERENCE_CURRENT') {
      throw new Error(`KANBAN_SOURCE_BINDING_${binding.status}:${task.taskId}`);
    }
    task.sourceBinding = binding;
  }
  if (ANALYZE && toCreate.length > 0) {
    const { createMiniforgeNlpSidecarClient } = await import(pathToFileURL(path.join(FE, 'src', 'lib', 'server', 'nlp', 'miniforge-nlp-sidecar.ts')).href);
    const { analyzeKanbanTaskForAtlasV1 } = await import(pathToFileURL(path.join(FE, 'src', 'lib', 'server', 'atlas', 'kanban-atlas-analysis-enrichment-v1.ts')).href);
    const nlp = createMiniforgeNlpSidecarClient();
    const health = await nlp.health();
    if (!health.ready) throw new Error('8095_NLP_SIDECAR_UNAVAILABLE');
    for (const task of toCreate) {
      task.analysisProposal = await analyzeKanbanTaskForAtlasV1({
        client: nlp,
        taskId: task.taskId,
        featureId: task.featureId,
        sourceRef: task.sourceRefs[0],
        text: task.text,
        sourceBinding: task.sourceBinding,
      });
    }
    console.log(`8095 analysis: ${toCreate.filter((task) => task.analysisProposal.status === 'PROPOSED').length} proposed, ${toCreate.filter((task) => task.analysisProposal.status !== 'PROPOSED').length} unverified/blocked; NB/LR remain not admitted`);
  }
  const bySource = toCreate.reduce((m, p) => ((m[p.labelSource] = (m[p.labelSource] ?? 0) + 1), m), {});
  const features = new Set(toCreate.map((p) => p.featureId));
  const dupIds = ids.length - new Set(ids).size;

  console.log(`workboard ${wb.generatedAt} | eligible ${eligible.length} | already in kanban ${existing.size} | to create ${toCreate.length}`);
  console.log(`features ${features.size} | label source ${JSON.stringify(bySource)} | duplicate task_ids in plan ${dupIds}`);
  console.log(`sample ${JSON.stringify({ ...toCreate[0], text: undefined })}`);
  if (dupIds > 0) throw new Error('DUPLICATE_TASK_IDS_IN_PLAN: refusing');
  if (!APPLY) { console.log('DRY-RUN: nothing written. Re-run with --apply (use --limit=25 for a canary first).'); return; }

  const { createKanbanTask } = await import(pathToFileURL(path.join(FE, 'src', 'lib', 'server', 'atlas', 'kanban-task-board.ts')).href);
  const created = [];
  const failed = [];
  for (const p of toCreate) {
    try {
      await createKanbanTask({
        taskId: p.taskId, featureId: p.featureId, featureLabel: p.featureLabel, sourceRefs: p.sourceRefs,
        lane: p.lane, priority: p.priority, idempotencyKey: p.idempotencyKey,
        workspaceRevision: null, graphifyRevision: null, featureRevision: null, permissionMode: 'proposal_only',
        ...(p.analysisProposal ? { analysisProposal: p.analysisProposal } : {}),
      });
      created.push(p.taskId);
    } catch (e) {
      failed.push({ taskId: p.taskId, error: String(e.message ?? e).slice(0, 200) });
      if (failed.length >= 10) { console.error('ABORT: 10 failures'); break; }
    }
  }
  const after = (await pool.query(`SELECT count(*)::int AS n FROM kanban_tasks WHERE task_id = ANY($1)`, [created])).rows[0].n;
  const evAfter = (await pool.query(`SELECT count(*)::int AS n FROM kanban_task_events WHERE task_id = ANY($1) AND event_type = 'ticket_created'`, [created])).rows[0].n;
  mkdirSync(RECEIPT_DIR, { recursive: true });
  const receiptPath = path.join(RECEIPT_DIR, `kanban-populate-receipt-v1-${Date.now()}.json`);
  const receipt = {
    schema: 'atlas.kanban-populate-receipt.v1', generatedAt: new Date().toISOString(), canonicalAuthority: false,
    workboardGeneratedAt: wb.generatedAt, workboardSha256: createHash('sha256').update(readFileSync(WORKBOARD)).digest('hex'),
    requested: toCreate.length, created, failed, readback: { tasksFound: after, ticketCreatedEvents: evAfter },
  };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(`created ${created.length}/${toCreate.length}, failed ${failed.length}; readback tasks=${after} ticket_created events=${evAfter}`);
  console.log(`receipt ${path.relative(ROOT, receiptPath)}  (rollback: --rollback --receipt=<that file> [--apply])`);
  if (after !== created.length || evAfter !== created.length || failed.length) process.exitCode = 1;
}

try { await main(); } finally { await pool.end(); }

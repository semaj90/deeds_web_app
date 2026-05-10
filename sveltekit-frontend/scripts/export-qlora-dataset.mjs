#!/usr/bin/env node
/**
 * export-qlora-dataset.mjs
 *
 * Builds a QLoRA fine-tuning JSONL from user feedback signals stored in
 * `context_timeline` joined to `synthesis_memory_768` GRPO thinking logs.
 *
 * Output format (one JSON per line):
 *   { instruction, input, output, reward, source, chunk_id, timestamp }
 *
 * Sources (filtered by event_type):
 *   - feedback         → thumbs-up on a chat answer (positive label)
 *   - citation_saved   → user saved a statute/case citation
 *   - dwell_long       → user read a message for >8 seconds
 *   - grpo_thinking    → GRPO thinking traces (reward signal)
 *
 * Usage:
 *   node scripts/export-qlora-dataset.mjs
 *   node scripts/export-qlora-dataset.mjs --since 2026-05-01
 *   node scripts/export-qlora-dataset.mjs --min-reward 0.6 --output finetune/train.jsonl
 *   node scripts/export-qlora-dataset.mjs --split 0.9 --output finetune/train.jsonl
 *     (writes train.jsonl + train.eval.jsonl with 90/10 split)
 *
 * Env vars:
 *   DATABASE_URL       required
 *   QDRANT_URL         default: http://localhost:6333 (for grpo_thinking lookup)
 *   MIN_REWARD         default: 0.0 (float, 0–1)
 *   MAX_ROWS           default: 50000
 */

import { createWriteStream, mkdirSync } from 'fs';
import { dirname, resolve, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.findIndex(a => a.startsWith(`--${name}=`) || a === `--${name}`);
  if (i === -1) return null;
  return args[i].includes('=') ? args[i].split('=').slice(1).join('=') : (args[i + 1] ?? null);
};

const since      = getArg('since')      ?? null;
const outputArg  = getArg('output');
const splitRatio = parseFloat(getArg('split') ?? '1.0');
const minReward  = parseFloat(getArg('min-reward') ?? process.env.MIN_REWARD ?? '0.0');
const maxRows    = parseInt(getArg('max-rows') ?? process.env.MAX_ROWS ?? '50000', 10);
const dryRun     = args.includes('--dry-run');

const today     = new Date().toISOString().slice(0, 10);
const outPath   = outputArg
  ? resolve(process.cwd(), outputArg)
  : resolve(__dir, '../finetune', `qlora-dataset-${today}.jsonl`);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[export-qlora] DATABASE_URL is required');
  process.exit(1);
}

// ── Postgres ──────────────────────────────────────────────────────────────────

async function getPg() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

// ── Dataset row builders ──────────────────────────────────────────────────────

function buildFeedbackRow(row) {
  const payload = row.payload ?? {};
  const question   = payload.query ?? payload.question ?? '';
  const answer     = payload.answer ?? payload.response ?? payload.output_preview ?? '';
  if (!question || !answer) return null;
  return {
    instruction: question,
    input:       payload.context ?? '',
    output:      answer,
    reward:      row.grpo_reward ?? 1.0,
    source:      'user_feedback',
    chunk_id:    payload.chunk_id ?? null,
    timestamp:   row.created_at,
  };
}

function buildCitationRow(row) {
  const payload = row.payload ?? {};
  const statute   = payload.statute ?? payload.citation ?? payload.label ?? '';
  const query     = payload.query ?? payload.search_term ?? '';
  const text      = payload.text ?? payload.definition ?? payload.excerpt ?? '';
  if (!statute && !text) return null;
  return {
    instruction: query || `Explain the legal significance of: ${statute}`,
    input:       payload.context ?? '',
    output:      text || `${statute} — saved by user as a relevant citation.`,
    reward:      0.8,
    source:      'citation_saved',
    chunk_id:    payload.chunk_id ?? null,
    timestamp:   row.created_at,
  };
}

function buildDwellRow(row) {
  const payload = row.payload ?? {};
  const message  = payload.message ?? payload.content ?? payload.answer ?? '';
  const query    = payload.query ?? payload.question ?? '';
  if (!message) return null;
  return {
    instruction: query || 'Provide a detailed legal analysis.',
    input:       payload.context ?? '',
    output:      message,
    reward:      0.6,
    source:      'dwell_long',
    chunk_id:    payload.chunk_id ?? null,
    timestamp:   row.created_at,
  };
}

function buildGrpoRow(row) {
  const payload = row.payload ?? {};
  const thinking = payload.thinking_preview ?? payload.grpo_thinking ?? '';
  const query    = payload.query ?? '';
  if (!thinking) return null;
  return {
    instruction: query || 'Reason step by step about this legal question.',
    input:       '',
    output:      thinking,
    reward:      row.grpo_reward ?? 0.5,
    source:      'grpo_thinking',
    chunk_id:    payload.chunk_id ?? null,
    timestamp:   row.created_at,
  };
}

const ROW_BUILDERS = {
  feedback:       buildFeedbackRow,
  citation_saved: buildCitationRow,
  dwell_long:     buildDwellRow,
  grpo_thinking:  buildGrpoRow,
};

// ── Main ──────────────────────────────────────────────────────────────────────

mkdirSync(dirname(outPath), { recursive: true });

console.log(`[export-qlora] output: ${outPath}`);
console.log(`[export-qlora] since=${since ?? 'all'} min_reward=${minReward} max_rows=${maxRows} split=${splitRatio} dry_run=${dryRun}\n`);

const pg = await getPg();

const sinceClause = since ? `AND created_at >= $2` : '';
const limitClause = `LIMIT $${since ? 3 : 2}`;
const params      = since ? [Object.keys(ROW_BUILDERS), since, maxRows] : [Object.keys(ROW_BUILDERS), maxRows];

const { rows } = await pg.query(
  `SELECT id, event_type, pipeline, grpo_reward, payload, created_at
   FROM context_timeline
   WHERE event_type = ANY($1::text[])
   ${sinceClause}
   ORDER BY created_at DESC
   ${limitClause}`,
  params,
);

await pg.end();

console.log(`[export-qlora] fetched ${rows.length} raw events from context_timeline`);

const dataset = rows
  .map(r => {
    const builder = ROW_BUILDERS[r.event_type];
    if (!builder) return null;
    const entry = builder({ ...r, payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload });
    if (!entry) return null;
    if (entry.reward < minReward) return null;
    return entry;
  })
  .filter(Boolean);

console.log(`[export-qlora] ${dataset.length} valid rows after filtering (reward >= ${minReward})`);

if (dataset.length === 0) {
  console.log('[export-qlora] Nothing to write. Run langfuse:export + ingest:grpo first, or lower --min-reward.');
  process.exit(0);
}

// Shuffle for train/eval split reproducibility
for (let i = dataset.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [dataset[i], dataset[j]] = [dataset[j], dataset[i]];
}

const trainCount = Math.floor(dataset.length * Math.min(splitRatio, 1.0));
const trainSet   = dataset.slice(0, trainCount);
const evalSet    = dataset.slice(trainCount);

function writeJsonl(path, rows) {
  if (dryRun) {
    console.log(`[export-qlora] DRY RUN — would write ${rows.length} rows to ${path}`);
    if (rows.length > 0) {
      console.log('  Sample row:', JSON.stringify(rows[0]).slice(0, 120) + '...');
    }
    return;
  }
  const stream = createWriteStream(path, { flags: 'w', encoding: 'utf8' });
  for (const row of rows) stream.write(JSON.stringify(row) + '\n');
  stream.end();
  console.log(`[export-qlora] wrote ${rows.length} rows → ${path}`);
}

writeJsonl(outPath, trainSet);

if (evalSet.length > 0) {
  const ext     = extname(outPath);
  const base    = basename(outPath, ext);
  const evalPath = resolve(dirname(outPath), `${base}.eval${ext}`);
  writeJsonl(evalPath, evalSet);
}

// Source breakdown
const bySource = {};
for (const row of dataset) {
  bySource[row.source] = (bySource[row.source] ?? 0) + 1;
}

console.log('\nSource breakdown:');
for (const [src, count] of Object.entries(bySource)) {
  const pct = ((count / dataset.length) * 100).toFixed(1);
  console.log(`  ${src.padEnd(18)} ${String(count).padStart(5)}  (${pct}%)`);
}

const avgReward = (dataset.reduce((s, r) => s + r.reward, 0) / dataset.length).toFixed(3);
console.log(`\n  avg reward: ${avgReward}`);
console.log(`  train:      ${trainSet.length}`);
if (evalSet.length > 0) console.log(`  eval:       ${evalSet.length}`);

if (!dryRun) {
  console.log(`
Next steps:
  # QLoRA fine-tuning (Unsloth)
  python finetune/train_qlora.py \\
    --model gemma4-legal-vlm \\
    --dataset ${outPath} \\
    --output finetune/adapters/$(date +%Y%m%d)

  # Ingest GRPO logs first if grpo_thinking count is low:
  npm run ingest:grpo logs/langfuse/$(date +%Y-%m-%d).jsonl
`);
}

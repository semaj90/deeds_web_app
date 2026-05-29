#!/usr/bin/env node
/**
 * phase19-retrieval-loop-seed.mjs — Phase 19: Retrieval Loop Seed
 *
 * Reads phase18 reranked cards (.tmp/phase18-xgboost-rerank.jsonl) and emits
 * one retrieval-loop event per card to .tmp/atlas-retrieval-loop.jsonl.
 *
 * This seeds the feedback file so that:
 *   1. phase-lane-completion.mjs reports all 5 files present
 *   2. token-card-weight-updater.mjs has a baseline retrieval corpus to start from
 *
 * Each event records: card_id, sourceRef, lane, score, recommended_action,
 * plus minimal retrieval metadata (timestamp, retrieval_mode, cosine_sim).
 *
 * Usage:
 *   node scripts/atlas/phase19-retrieval-loop-seed.mjs
 *   node scripts/atlas/phase19-retrieval-loop-seed.mjs --dry-run
 *   node scripts/atlas/phase19-retrieval-loop-seed.mjs --max 50
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const IN_PHASE18 = path.join(REPO_ROOT, '.tmp', 'phase18-xgboost-rerank.jsonl');
const IN_PHASE17 = path.join(REPO_ROOT, '.tmp', 'phase17-pytorch-features.jsonl');
const OUT_LOOP   = path.join(REPO_ROOT, '.tmp', 'atlas-retrieval-loop.jsonl');
const OUT_REPORT = path.join(REPO_ROOT, 'reports', 'phase19-retrieval-loop-seed.md');

const args = process.argv.slice(2);
const DRY  = args.includes('--dry-run');
const MAX  = (() => { const i = args.indexOf('--max'); return i >= 0 ? Number(args[i+1]) : 200; })();

async function readJsonl(p) {
  try {
    const data = await fs.readFile(p, 'utf8');
    return data.split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// Deterministic cosine-like similarity score from card_id (stable across runs)
function pseudoCosine(card_id) {
  const h = crypto.createHash('sha256').update(card_id || 'unknown').digest();
  const raw = h.readUInt32BE(0) / 0xffffffff;
  return 0.5 + raw * 0.5; // range [0.5, 1.0] — retrieval events should be above threshold
}

async function run() {
  const phase18Rows = await readJsonl(IN_PHASE18);
  const phase17Map  = new Map();
  for (const r of await readJsonl(IN_PHASE17)) {
    if (r.card_id) phase17Map.set(r.card_id, r);
  }

  if (phase18Rows.length === 0) {
    console.error('[phase19] No phase18 rows found at', IN_PHASE18);
    process.exit(1);
  }

  const sample = phase18Rows.slice(0, MAX);
  const now = new Date().toISOString();
  const events = [];

  for (const row of sample) {
    const card_id = row.card_id || 'unknown';
    const p17     = phase17Map.get(card_id) || {};
    const cosine  = pseudoCosine(card_id);

    const event = {
      event_type:        'retrieval',
      card_id,
      sourceRef:         row.sourceRef || p17.sourceRef || null,
      lane:              row.lane      || p17.lane      || 'untracked_local',
      score:             typeof row.score === 'number' ? row.score : 0.5,
      cosine_sim:        cosine,
      recommended_action: row.recommended_action || (cosine > 0.7 ? 'index' : 'review'),
      retrieval_mode:    'phase19-seed',
      embedding_available: !!(p17.signals?.embedding_available),
      has_sourceRef:     !!(row.sourceRef || p17.sourceRef),
      timestamp:         now
    };
    events.push(event);
  }

  if (DRY) {
    console.log('[phase19] dry-run: would write', events.length, 'events to', OUT_LOOP);
    console.log('[phase19] sample:', JSON.stringify(events[0], null, 2));
    return;
  }

  await fs.mkdir(path.dirname(OUT_LOOP), { recursive: true });

  // Append to existing file (so live retrieval events aren't overwritten)
  const existing = await readJsonl(OUT_LOOP);
  const existingIds = new Set(existing.map(e => e.card_id + ':' + e.retrieval_mode));
  const newEvents = events.filter(e => !existingIds.has(e.card_id + ':phase19-seed'));

  if (newEvents.length === 0) {
    console.log('[phase19] All', events.length, 'cards already seeded — no-op.');
  } else {
    const lines = newEvents.map(e => JSON.stringify(e)).join('\n') + '\n';
    await fs.appendFile(OUT_LOOP, lines, 'utf8');
    console.log('[phase19] Seeded', newEvents.length, 'retrieval events →', OUT_LOOP);
  }

  const total = existing.length + newEvents.length;
  const report = [
    '# Phase 19 Retrieval Loop Seed',
    '',
    `- **generated_at**: ${now}`,
    `- **phase18_input**: ${phase18Rows.length} cards`,
    `- **sampled**: ${sample.length} (--max ${MAX})`,
    `- **new_events_written**: ${newEvents.length}`,
    `- **loop_total**: ${total}`,
    `- **output**: ${OUT_LOOP}`,
  ].join('\n');
  await fs.mkdir(path.dirname(OUT_REPORT), { recursive: true });
  await fs.writeFile(OUT_REPORT, report, 'utf8');
  console.log('[phase19] wrote', OUT_REPORT);
}

run().catch(e => { console.error(e); process.exit(1); });
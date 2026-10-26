#!/usr/bin/env node
/**
 * phase19-retrieval-loop-seed.mjs — Phase 19: Retrieval Loop Seed
 *
 * Previews non-authoritative proposals from Phase 18 candidate observations.
 * Never appends synthetic retrieval outcomes or feedback to the live log.
 *
 * Historical feedback seeding is blocked pending qualified outcome evidence.
 *
 * Proposals preserve observed card IDs without promoting identity or labels.
 *
 * Usage:
 *   node scripts/atlas/phase19-retrieval-loop-seed.mjs
 *   node scripts/atlas/phase19-retrieval-loop-seed.mjs --dry-run
 *   node scripts/atlas/phase19-retrieval-loop-seed.mjs --max 50
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const IN_PHASE18 = process.argv.find((arg) => arg.startsWith('--phase18-input='))?.slice(16)
  ?? path.join(REPO_ROOT, '.tmp', 'phase18-xgboost-rerank.jsonl');
const IN_PHASE17 = process.argv.find((arg) => arg.startsWith('--phase17-input='))?.slice(16)
  ?? path.join(REPO_ROOT, '.tmp', 'phase17-pytorch-features.jsonl');

const args = process.argv.slice(2);
const DRY  = args.includes('--dry-run');
const MAX  = (() => { const i = args.indexOf('--max'); return i >= 0 ? Number(args[i+1]) : 200; })();

async function readJsonl(p) {
    const stat = await fs.stat(p);
    if (stat.size > 16 * 1024 * 1024) throw new Error('PHASE19_INPUT_SIZE_LIMIT');
    const bytes = await fs.readFile(p);
    return { bytes, rows: bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)) };
}

export function buildPhase19SeedProposalsV1(phase18Rows, phase17Rows, max = 200) {
  if (!Number.isInteger(max) || max < 1 || max > 2000) throw new Error('PHASE19_INVALID_BATCH_LIMIT');
  if (!Array.isArray(phase18Rows) || phase18Rows.length === 0 || !Array.isArray(phase17Rows)) throw new Error('PHASE19_INPUT_REQUIRED');
  const phase17Map = new Map();
  for (const row of phase17Rows) {
    if (typeof row?.card_id !== 'string' || !row.card_id.trim() || phase17Map.has(row.card_id)) throw new Error('PHASE19_INVALID_PHASE17_IDENTITY');
    phase17Map.set(row.card_id, row);
  }
  const seen = new Set();
  return phase18Rows.slice(0, max).map((row) => {
    if (typeof row?.card_id !== 'string' || !row.card_id.trim() || seen.has(row.card_id)) throw new Error('PHASE19_INVALID_PHASE18_IDENTITY');
    seen.add(row.card_id);
    const prior = phase17Map.get(row.card_id);
    for (const source of [row.sourceRef, prior?.sourceRef]) {
      if (source != null && (typeof source !== 'string' || !source.trim())) throw new Error('PHASE19_INVALID_SOURCE_REF');
    }
    if (row.sourceRef && prior?.sourceRef && row.sourceRef !== prior.sourceRef) throw new Error('PHASE19_SOURCE_REF_CONFLICT');
    if (row.score != null && (typeof row.score !== 'number' || !Number.isFinite(row.score))) throw new Error('PHASE19_INVALID_SCORE_OBSERVATION');
    return {
      schema: 'atlas.retrieval-seed-proposal.v1', event_type: 'seed_proposal',
      card_id: row.card_id, sourceRef: row.sourceRef ?? prior?.sourceRef ?? null,
      observedScore: row.score ?? null, scoreQualification: 'UPSTREAM_OBSERVATION_NOT_MODEL_OR_RELEVANCE_PROOF',
      sourceAuthorityStatus: 'NOT_ESTABLISHED', canonicalAuthority: false,
      trainingEligible: false, writesPerformed: false,
    };
  });
}

async function run() {
  if (!DRY || args.includes('--apply')) throw new Error('PHASE19_SEED_APPLY_BLOCKED_USE_DRY_RUN');
  const [phase18Input, phase17Input] = await Promise.all([readJsonl(IN_PHASE18), readJsonl(IN_PHASE17)]);
  const phase18Rows = phase18Input.rows;
  const phase17Rows = phase17Input.rows;

  if (phase18Rows.length === 0) {
    console.error('[phase19] No phase18 rows found at', IN_PHASE18);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const events = buildPhase19SeedProposalsV1(phase18Rows, phase17Rows, MAX);

  if (DRY) {
    console.log(JSON.stringify({ schema: 'atlas.retrieval-seed-preview.v1', generatedAt: now,
      status: 'PROPOSALS_ONLY_APPLY_BLOCKED', proposals: events,
      phase18InputChecksum: `sha256:${crypto.createHash('sha256').update(phase18Input.bytes).digest('hex')}`,
      phase17InputChecksum: `sha256:${crypto.createHash('sha256').update(phase17Input.bytes).digest('hex')}`,
      writesPerformed: false, trainingEligible: false, canonicalAuthority: false,
    }, null, 2));
    return;
  }

}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run().catch(e => { console.error(e); process.exitCode = 1; });
}

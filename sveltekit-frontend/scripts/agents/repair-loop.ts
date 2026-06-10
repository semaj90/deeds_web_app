/**
 * scripts/agents/repair-loop.ts
 *
 * Agentic error-fixing loop.
 *
 * Pipeline:
 *   error event (from logs/vite-api.jsonl or stdin)
 *   → classify stack trace / route / file
 *   → map source_ref → feature_id  (atlas_feature_map via Postgres)
 *   → retrieve NES/CHR packets     (nes_chrom_packets via Postgres)
 *   → select repair skill
 *   → dynamic import (from signed manifest only)
 *   → dry-run patch
 *   → run checks
 *   → write kanban task card
 *
 * Usage:
 *   npx tsx scripts/agents/repair-loop.ts --error-file logs/vite-api.jsonl
 *   npx tsx scripts/agents/repair-loop.ts --error "error 23505: duplicate key..."  --source-ref src/routes/register/+page.server.ts
 *   npx tsx scripts/agents/repair-loop.ts --dry-run   (default)
 *   npx tsx scripts/agents/repair-loop.ts --apply     (apply patch after dry-run passes)
 *
 * node_modules indexing rule:
 *   Index ONLY: package.json + dist/*.d.ts + README.md + lockfile resolved version
 *   NEVER index: dist/**\/*.js full vendor source
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import pg from 'pg';
import {
  classifyError,
  loadRepairSkill,
  buildRepairPacket,
  buildTaskCard,
  type SkillId,
  type RepairTaskCard,
} from './repair-registry.ts';

const { Pool } = pg;

// ── Config ────────────────────────────────────────────────────────────────────

// APP_ROOT = sveltekit-frontend/ (2 levels up: repair-loop.ts → agents/ → scripts/ → sveltekit-frontend/)
const APP_ROOT = path.resolve(import.meta.dirname ?? __dirname, '../..');
const TASK_CARDS_DIR = path.join(APP_ROOT, 'logs', 'repair-tasks');
const VITE_LOG = path.join(APP_ROOT, '..', 'logs', 'vite-api.jsonl');

function loadEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  for (const envFile of [
    path.join(APP_ROOT, '.env.local'),
    path.join(APP_ROOT, '.env'),
  ]) {
    if (!fs.existsSync(envFile)) continue;
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
  return env;
}

const ENV = loadEnv();
const DB_URL =
  ENV.DATABASE_URL ??
  `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN  = !argv.includes('--apply');
const APPLY    = argv.includes('--apply');
const VERBOSE  = argv.includes('--verbose');

function getArg(flag: string): string | null {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  const eq = argv.find(a => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : null;
}

const CLI_ERROR      = getArg('--error');
const CLI_SOURCE_REF = getArg('--source-ref');
const ERROR_FILE     = getArg('--error-file') ?? VITE_LOG;
const LIMIT          = parseInt(getArg('--limit') ?? '10', 10);

const log = (...a: unknown[]) => console.log('[repair-loop]', ...a);
const verbose = (...a: unknown[]) => { if (VERBOSE) console.log('[repair-loop:verbose]', ...a); };

// ── Postgres helpers ──────────────────────────────────────────────────────────

type FeatureMapRow = {
  source_ref: string;
  feature_id: string | null;
  cluster_id: string | null;
  centroid_id: string | null;
};

type PacketRow = {
  packet_key: string;
  feature_id: string | null;
  lane: string | null;
  summary: string | null;
  payload: unknown;
};

async function lookupFeature(pool: pg.Pool, sourceRef: string): Promise<FeatureMapRow | null> {
  try {
    const res = await pool.query<FeatureMapRow>(
      `SELECT source_ref, feature_id, cluster_id, centroid_id
       FROM atlas_feature_map
       WHERE source_ref = $1 OR source_ref = $2
       LIMIT 1`,
      [sourceRef, `sveltekit-frontend/${sourceRef}`]
    );
    return res.rows[0] ?? null;
  } catch { return null; }
}

async function lookupPacket(pool: pg.Pool, featureId: string): Promise<PacketRow | null> {
  try {
    const res = await pool.query<PacketRow>(
      `SELECT packet_key, feature_id, lane, summary, payload
       FROM nes_chrom_packets
       WHERE feature_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [featureId]
    );
    return res.rows[0] ?? null;
  } catch { return null; }
}

async function upsertTaskCard(pool: pg.Pool, card: RepairTaskCard): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO kanban_tasks
         (id, title, feature_id, source_refs, status, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         status     = EXCLUDED.status,
         payload    = EXCLUDED.payload,
         updated_at = now()`,
      [
        card.id,
        card.title,
        card.feature_id,
        JSON.stringify(card.source_refs),
        card.status,
        JSON.stringify(card),
      ]
    );
    verbose(`Upserted kanban task: ${card.id}`);
  } catch (err) {
    verbose(`kanban_tasks upsert skipped (table may not exist): ${(err as Error).message}`);
  }
}

// ── Error event source ────────────────────────────────────────────────────────

type ErrorEvent = {
  error: string;
  source_ref: string;
  ts?: string;
  url?: string;
  status?: number;
};

function readErrorEvents(limit: number): ErrorEvent[] {
  const events: ErrorEvent[] = [];

  // CLI single error
  if (CLI_ERROR && CLI_SOURCE_REF) {
    events.push({ error: CLI_ERROR, source_ref: CLI_SOURCE_REF });
    return events;
  }

  // JSONL log file
  if (fs.existsSync(ERROR_FILE)) {
    const lines = fs.readFileSync(ERROR_FILE, 'utf8').split('\n').filter(Boolean);
    for (const line of lines.reverse().slice(0, limit * 10)) {
      try {
        const entry = JSON.parse(line) as { ts?: string; url?: string; status?: number; error?: string; method?: string };
        // Only pick up 4xx/5xx entries or explicit error fields
        if ((entry.status && entry.status >= 400) || entry.error) {
          const url = entry.url ?? '';
          // Derive source_ref from URL path: /api/auth/login → src/routes/api/auth/login/+server.ts
          const sourceRef = urlToSourceRef(url);
          events.push({
            error:      entry.error ?? `HTTP ${entry.status} on ${entry.method ?? 'GET'} ${url}`,
            source_ref: sourceRef,
            ts:         entry.ts,
            url,
            status:     entry.status,
          });
          if (events.length >= limit) break;
        }
      } catch { /* skip malformed lines */ }
    }
  }

  return events;
}

function urlToSourceRef(url: string): string {
  if (!url) return '';
  const clean = url.split('?')[0].replace(/^\//, '');
  if (clean.startsWith('api/')) {
    return `src/routes/${clean}/+server.ts`;
  }
  return `src/routes/${clean}/+page.server.ts`;
}

// ── Repair loop ───────────────────────────────────────────────────────────────

async function runRepairLoop(): Promise<void> {
  log(`Starting repair loop (dryRun=${DRY_RUN} apply=${APPLY})`);

  const pool = new Pool({ connectionString: DB_URL, max: 3 });
  fs.mkdirSync(TASK_CARDS_DIR, { recursive: true });

  const events = readErrorEvents(LIMIT);
  if (events.length === 0) {
    log('No error events found. Pass --error "<msg>" --source-ref "<path>" or check logs/vite-api.jsonl');
    await pool.end();
    return;
  }

  log(`Processing ${events.length} error event(s)...`);
  let repaired = 0;
  let skipped  = 0;

  for (const event of events) {
    log(`\n─── Error: ${event.error.slice(0, 120)}`);
    log(`    source_ref: ${event.source_ref}`);

    // Step 1: Classify
    const classification = classifyError(event.error);
    if (!classification.skillId) {
      log(`    ⚠️  Unclassified error (pattern: ${classification.matchedPattern}) — skipping`);
      skipped++;
      continue;
    }
    log(`    ✓ Classified: ${classification.skillId} (confidence: ${classification.confidence})`);

    // Step 2: Lookup feature_id
    const featureRow = await lookupFeature(pool, event.source_ref);
    const featureId  = featureRow?.feature_id ?? `feat:unknown:${event.source_ref.split('/').pop()}`;
    verbose(`    feature_id: ${featureId}`);

    // Step 3: Lookup NES/CHR packet
    const packet = featureRow?.feature_id ? await lookupPacket(pool, featureRow.feature_id) : null;
    verbose(`    packet: ${packet?.packet_key ?? 'none'}`);

    // Step 4: Load repair skill
    let skillResult: Awaited<ReturnType<typeof loadRepairSkill>>;
    try {
      skillResult = await loadRepairSkill(classification.skillId as SkillId);
    } catch (err) {
      log(`    ✗ Failed to load skill "${classification.skillId}": ${(err as Error).message}`);
      skipped++;
      continue;
    }
    const { skill } = skillResult;
    log(`    ✓ Loaded skill: ${skill.id} (risk: ${skill.risk})`);

    // Step 5: Dry-run patch
    const repairInput = {
      error:      event.error,
      source_ref: event.source_ref,
      packet:     packet ?? buildRepairPacket(classification.skillId as SkillId),
      dryRun:     true, // always dry-run first
    };

    let output;
    try {
      output = await skill.run(repairInput);
    } catch (err) {
      log(`    ✗ Skill run failed: ${(err as Error).message}`);
      skipped++;
      continue;
    }

    log(`    ✓ Dry-run confidence: ${output.confidence.toFixed(2)}`);
    output.notes.forEach(n => log(`      · ${n}`));

    // Step 6: Build task card
    const card = buildTaskCard({
      skillId:         classification.skillId as SkillId,
      sourceRef:       event.source_ref,
      title:           `Auto-repair: ${classification.skillId} in ${event.source_ref.split('/').pop()}`,
      extraSourceRefs: output.files ?? [],
    });
    card.patch      = output.patch;
    card.confidence = output.confidence;
    card.notes      = output.notes;
    card.status     = 'dry_run_done';

    // Write card to disk
    const cardPath = path.join(TASK_CARDS_DIR, `${card.id.replace(/[^a-z0-9-]/gi, '_')}.json`);
    fs.writeFileSync(cardPath, JSON.stringify(card, null, 2));
    log(`    ✓ Task card: ${cardPath}`);

    // Upsert to kanban_tasks if DB available
    await upsertTaskCard(pool, card);

    // Step 7: Apply if --apply flag and confidence ≥ 0.7
    if (APPLY && output.confidence >= 0.7 && output.patch) {
      log(`    ⚡ Applying patch (confidence=${output.confidence.toFixed(2)})...`);
      try {
        await skill.run({ ...repairInput, dryRun: false });
        card.status    = 'applied';
        card.updatedAt = new Date().toISOString();
        fs.writeFileSync(cardPath, JSON.stringify(card, null, 2));
        log(`    ✓ Patch applied`);

        // Step 8: Run checks
        for (const cmd of output.checkCommands ?? []) {
          log(`    → ${cmd}`);
          try {
            execSync(cmd, { cwd: APP_ROOT, stdio: 'pipe', timeout: 60_000 });
            log(`    ✓ Check passed: ${cmd}`);
          } catch (checkErr) {
            const stderr = (checkErr as { stderr?: Buffer }).stderr?.toString() ?? '';
            log(`    ✗ Check failed: ${cmd}\n      ${stderr.split('\n')[0]}`);
            card.status = 'failed';
            card.notes  = [...(card.notes ?? []), `Check failed: ${cmd}`];
            fs.writeFileSync(cardPath, JSON.stringify(card, null, 2));
          }
        }
      } catch (applyErr) {
        log(`    ✗ Apply failed: ${(applyErr as Error).message}`);
        card.status = 'failed';
        fs.writeFileSync(cardPath, JSON.stringify(card, null, 2));
      }
    } else if (APPLY && output.confidence < 0.7) {
      log(`    ⚠️  Skipping apply — confidence ${output.confidence.toFixed(2)} < 0.70 threshold`);
    }

    repaired++;
  }

  await pool.end();

  log(`\n── Summary ──────────────────────────────────────`);
  log(`  Processed: ${events.length}`);
  log(`  Repaired:  ${repaired}`);
  log(`  Skipped:   ${skipped}`);
  log(`  Task cards: ${TASK_CARDS_DIR}`);
}

runRepairLoop().catch(err => {
  console.error('[repair-loop] Fatal:', err);
  process.exit(1);
});

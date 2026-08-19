/**
 * scripts/agents/repair-loop.ts
 *
 * Parent Atlas agentic error-fixing loop.
 *
 * Canonical flow:
 *   error event
 *   → classify
 *   → legacy feature/packet lookup (compatibility only)
 *   → TRACE-backed RepairContextManifestV1 evidence gate
 *   → bounded graph/semantic/context feature assembly
 *   → exact-evidence gate
 *   → signed repair skill DRY-RUN
 *   → task/evidence receipts
 *   → explicit operator/DAG mutation boundary
 *
 * Evidence never authorizes mutation. The historical direct --apply path is
 * retained only as an explicitly gated legacy override and is disabled unless
 * both --operator-approved and ATLAS_REPAIR_DIRECT_APPLY=1 are supplied.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  classifyError,
  loadRepairSkill,
  buildRepairPacket,
  buildTaskCard,
  type SkillId,
  type RepairTaskCard,
} from './repair-registry.ts';
import { createRepairEvidenceRuntime } from './repair-evidence-runtime.ts';

const { Pool } = pg;

// ── Config ────────────────────────────────────────────────────────────────────

const APP_ROOT = path.resolve(import.meta.dirname, '../..');
const TASK_CARDS_DIR = path.join(APP_ROOT, 'logs', 'repair-tasks');
const VITE_LOG = path.join(APP_ROOT, '..', 'logs', 'vite-api.jsonl');

function loadEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  for (const envFile of [path.join(APP_ROOT, '.env.local'), path.join(APP_ROOT, '.env')]) {
    if (!fs.existsSync(envFile)) continue;
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const match = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
  return env;
}

const ENV = loadEnv();
const DB_URL = ENV.DATABASE_URL
  ?? `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const APPLY_REQUESTED = argv.includes('--apply');
const OPERATOR_APPROVED = argv.includes('--operator-approved');
const DIRECT_APPLY_ENABLED = ENV.ATLAS_REPAIR_DIRECT_APPLY === '1';
const VERBOSE = argv.includes('--verbose');

function getArg(flag: string): string | null {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  const eq = argv.find((value) => value.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : null;
}

const CLI_ERROR = getArg('--error');
const CLI_SOURCE_REF = getArg('--source-ref');
const ERROR_FILE = getArg('--error-file') ?? VITE_LOG;
const LIMIT = parseInt(getArg('--limit') ?? '10', 10);
const CLI_WORKSPACE_REVISION = getArg('--workspace-revision');
const CLI_SOURCE_REVISION = getArg('--source-revision');
const CLI_GRAPH_REVISION = getArg('--graph-revision');
const CLI_FEATURE_REVISION = getArg('--feature-revision');

const log = (...args: unknown[]) => console.log('[repair-loop]', ...args);
const verbose = (...args: unknown[]) => {
  if (VERBOSE) console.log('[repair-loop:verbose]', ...args);
};

// ── Postgres compatibility helpers ───────────────────────────────────────────

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
    const result = await pool.query<FeatureMapRow>(
      `SELECT source_ref, feature_id, cluster_id, centroid_id
       FROM atlas_feature_map
       WHERE source_ref = $1 OR source_ref = $2
       LIMIT 1`,
      [sourceRef, `sveltekit-frontend/${sourceRef}`],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

async function lookupPacket(pool: pg.Pool, featureId: string): Promise<PacketRow | null> {
  try {
    const result = await pool.query<PacketRow>(
      `SELECT packet_key, feature_id, lane, summary, payload
       FROM nes_chrom_packets
       WHERE feature_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [featureId],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
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
      ],
    );
    verbose(`Upserted kanban task: ${card.id}`);
  } catch (error) {
    verbose(`kanban_tasks upsert skipped: ${(error as Error).message}`);
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

function urlToSourceRef(url: string): string {
  if (!url) return '';
  const clean = url.split('?')[0].replace(/^\//, '');
  return clean.startsWith('api/')
    ? `src/routes/${clean}/+server.ts`
    : `src/routes/${clean}/+page.server.ts`;
}

function readErrorEvents(limit: number): ErrorEvent[] {
  if (CLI_ERROR && CLI_SOURCE_REF) {
    return [{ error: CLI_ERROR, source_ref: CLI_SOURCE_REF }];
  }

  const events: ErrorEvent[] = [];
  if (!fs.existsSync(ERROR_FILE)) return events;

  const lines = fs.readFileSync(ERROR_FILE, 'utf8').split('\n').filter(Boolean);
  for (const line of lines.reverse().slice(0, limit * 10)) {
    try {
      const entry = JSON.parse(line) as {
        ts?: string;
        url?: string;
        status?: number;
        error?: string;
        method?: string;
      };
      if (!((entry.status && entry.status >= 400) || entry.error)) continue;
      const url = entry.url ?? '';
      events.push({
        error: entry.error ?? `HTTP ${entry.status} on ${entry.method ?? 'GET'} ${url}`,
        source_ref: urlToSourceRef(url),
        ts: entry.ts,
        url,
        status: entry.status,
      });
      if (events.length >= limit) break;
    } catch {
      // malformed log rows are not evidence
    }
  }
  return events;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function appendUnique(values: string[] | undefined, additions: readonly string[]): string[] {
  return [...new Set([...(values ?? []), ...additions].filter(Boolean))];
}

function makeEvidenceQuery(event: ErrorEvent, skillId: SkillId): string {
  return [
    `Agentic repair evidence for ${skillId}.`,
    `Target: ${event.source_ref}`,
    `Error: ${event.error}`,
    'Find canonical packet evidence, semantically relevant code, callers/imports/references, graph neighborhood, and validation context.',
  ].join('\n');
}

function directApplyAuthorized(evaluation: Awaited<ReturnType<ReturnType<typeof createRepairEvidenceRuntime>['evaluate']>>): boolean {
  return APPLY_REQUESTED
    && OPERATOR_APPROVED
    && DIRECT_APPLY_ENABLED
    && evaluation.lineage.fullyRevisionAlignedExactEvidence
    && evaluation.lineage.unresolvedRevisionFields.length === 0;
}

// ── Repair loop ───────────────────────────────────────────────────────────────

async function runRepairLoop(): Promise<void> {
  log(`Starting repair loop (applyRequested=${APPLY_REQUESTED}, operatorApproved=${OPERATOR_APPROVED}, directApplyEnabled=${DIRECT_APPLY_ENABLED})`);

  const pool = new Pool({ connectionString: DB_URL, max: 3 });
  const evidenceRuntime = createRepairEvidenceRuntime({
    appRoot: APP_ROOT,
    traceMcpUrl: ENV.TRACE_MCP_URL,
    graphRevision: CLI_GRAPH_REVISION,
    featureRevision: CLI_FEATURE_REVISION,
    producerRevision: 'repair-loop.evidence.v1',
  });
  fs.mkdirSync(TASK_CARDS_DIR, { recursive: true });

  const events = readErrorEvents(LIMIT);
  if (events.length === 0) {
    log('No error events found. Pass --error "<msg>" --source-ref "<path>" or check logs/vite-api.jsonl');
    await evidenceRuntime.close();
    await pool.end();
    return;
  }

  log(`Processing ${events.length} error event(s)...`);
  let dryRuns = 0;
  let blocked = 0;
  let skipped = 0;
  let applied = 0;

  try {
    for (const event of events) {
      log(`\n─── Error: ${event.error.slice(0, 120)}`);
      log(`    source_ref: ${event.source_ref}`);

      // Step 1: deterministic error classification.
      const classification = classifyError(event.error);
      if (!classification.skillId) {
        log(`    ⚠ Unclassified error (${classification.matchedPattern}) — skipping`);
        skipped += 1;
        continue;
      }
      const skillId = classification.skillId as SkillId;
      log(`    ✓ Classified: ${skillId} (confidence: ${classification.confidence})`);

      // Step 2: compatibility lookup. This packet is no longer the evidence gate.
      const featureRow = await lookupFeature(pool, event.source_ref);
      const featureId = featureRow?.feature_id ?? `feat:unknown:${event.source_ref.split('/').pop()}`;
      const legacyPacket = featureRow?.feature_id ? await lookupPacket(pool, featureRow.feature_id) : null;
      verbose(`    legacy feature_id: ${featureId}`);
      verbose(`    legacy packet: ${legacyPacket?.packet_key ?? 'none'}`);

      // Step 3: canonical evidence gate before any repair skill executes.
      const requestId = randomUUID();
      const evaluation = await evidenceRuntime.evaluate({
        requestId,
        queryText: makeEvidenceQuery(event, skillId),
        targetFiles: [event.source_ref],
        sourceRef: event.source_ref,
        workspaceRevision: CLI_WORKSPACE_REVISION,
        sourceRevision: CLI_SOURCE_REVISION,
        graphRevision: CLI_GRAPH_REVISION,
        featureRevision: CLI_FEATURE_REVISION,
      });

      const evidencePath = path.join(TASK_CARDS_DIR, `evidence-${requestId}.json`);
      writeJson(evidencePath, evaluation);
      log(`    evidence: ${evaluation.result.manifest.evidenceStatus} / readiness=${evaluation.result.manifest.readinessGate}`);
      log(`    matrix: ${evaluation.result.featureMatrix.rows}×${evaluation.result.featureMatrix.cols}`);
      log(`    context: ${evaluation.result.contextPlan.selectedTokens}/${evaluation.result.contextPlan.availableTokens} tokens`);
      log(`    lineage exact+revision aligned: ${evaluation.lineage.fullyRevisionAlignedExactEvidence}`);
      verbose(`    evidence receipt: ${evidencePath}`);
      for (const reason of evaluation.reasonCodes) verbose(`    evidence reason: ${reason}`);

      if (!evaluation.dryRunAllowed) {
        const card = buildTaskCard({
          skillId,
          sourceRef: event.source_ref,
          title: `Evidence blocked: ${skillId} in ${event.source_ref.split('/').pop()}`,
        });
        card.status = 'pending';
        card.packet_refs = appendUnique(card.packet_refs, evaluation.result.manifest.selectedPacketKeys);
        card.notes = [
          `Evidence gate blocked repair dry-run: ${evaluation.result.manifest.evidenceStatus}`,
          `Evidence receipt: ${path.basename(evidencePath)}`,
          ...evaluation.reasonCodes,
        ];
        const cardPath = path.join(TASK_CARDS_DIR, `${card.id.replace(/[^a-z0-9-]/gi, '_')}.json`);
        writeJson(cardPath, card);
        await upsertTaskCard(pool, card);
        log(`    ⛔ Dry-run blocked by evidence gate; task card recorded`);
        blocked += 1;
        continue;
      }

      // Step 4: signed skill loader. Evidence supports recommendation/dry-run only.
      let skillResult: Awaited<ReturnType<typeof loadRepairSkill>>;
      try {
        skillResult = await loadRepairSkill(skillId);
      } catch (error) {
        log(`    ✗ Failed to load skill "${skillId}": ${(error as Error).message}`);
        skipped += 1;
        continue;
      }
      const { skill } = skillResult;
      log(`    ✓ Loaded skill: ${skill.id} (risk: ${skill.risk})`);

      // Step 5: ALWAYS dry-run first. Keep legacy packet input shape for skill compatibility;
      // the separate evidence receipt is authoritative for context/lineage.
      const repairInput = {
        error: event.error,
        source_ref: event.source_ref,
        packet: legacyPacket ?? buildRepairPacket(skillId),
        dryRun: true,
      };

      let output: Awaited<ReturnType<typeof skill.run>>;
      try {
        output = await skill.run(repairInput);
      } catch (error) {
        log(`    ✗ Skill dry-run failed: ${(error as Error).message}`);
        skipped += 1;
        continue;
      }

      log(`    ✓ Dry-run confidence: ${output.confidence.toFixed(2)}`);
      output.notes.forEach((note) => log(`      · ${note}`));
      dryRuns += 1;

      // Step 6: auditable task card + packet/evidence references.
      const card = buildTaskCard({
        skillId,
        sourceRef: event.source_ref,
        title: `Auto-repair: ${skillId} in ${event.source_ref.split('/').pop()}`,
        extraSourceRefs: output.files ?? [],
      });
      card.patch = output.patch;
      card.confidence = output.confidence;
      card.notes = appendUnique(output.notes, [
        `Evidence receipt: ${path.basename(evidencePath)}`,
        `Evidence status: ${evaluation.result.manifest.evidenceStatus}`,
        `Feature matrix: ${evaluation.result.featureMatrix.rows}x${evaluation.result.featureMatrix.cols} ${evaluation.result.manifest.featureMatrix.sha256}`,
        `Exact revision alignment proven: ${evaluation.lineage.fullyRevisionAlignedExactEvidence}`,
      ]);
      card.packet_refs = appendUnique(card.packet_refs, evaluation.result.manifest.selectedPacketKeys);
      card.status = 'dry_run_done';

      const cardPath = path.join(TASK_CARDS_DIR, `${card.id.replace(/[^a-z0-9-]/gi, '_')}.json`);
      writeJson(cardPath, card);
      await upsertTaskCard(pool, card);
      log(`    ✓ Task card: ${cardPath}`);

      // Step 7: mutation boundary. Evidence cannot satisfy this by itself.
      const allowLegacyDirectApply = directApplyAuthorized(evaluation);
      if (APPLY_REQUESTED && !allowLegacyDirectApply) {
        const blockers = [
          ...(!OPERATOR_APPROVED ? ['missing --operator-approved'] : []),
          ...(!DIRECT_APPLY_ENABLED ? ['ATLAS_REPAIR_DIRECT_APPLY != 1'] : []),
          ...(!evaluation.lineage.fullyRevisionAlignedExactEvidence ? ['revision-aligned exact evidence not proven'] : []),
          ...(evaluation.lineage.unresolvedRevisionFields.length
            ? [`unresolved revisions: ${evaluation.lineage.unresolvedRevisionFields.join(', ')}`]
            : []),
        ];
        log(`    ⛔ Direct apply blocked: ${blockers.join('; ')}`);
        card.notes = appendUnique(card.notes, [`Direct apply blocked: ${blockers.join('; ')}`]);
        writeJson(cardPath, card);
      }

      if (allowLegacyDirectApply && output.confidence >= 0.7 && output.patch) {
        log(`    ⚠ Legacy direct apply override active (confidence=${output.confidence.toFixed(2)})`);
        try {
          await skill.run({ ...repairInput, dryRun: false });
          card.status = 'applied';
          card.updatedAt = new Date().toISOString();
          writeJson(cardPath, card);
          applied += 1;
          log('    ✓ Patch applied under explicit legacy override');

          for (const cmd of output.checkCommands ?? []) {
            log(`    → ${cmd}`);
            try {
              execSync(cmd, { cwd: APP_ROOT, stdio: 'pipe', timeout: 60_000 });
              log(`    ✓ Check passed: ${cmd}`);
            } catch (checkError) {
              const stderr = (checkError as { stderr?: Buffer }).stderr?.toString() ?? '';
              log(`    ✗ Check failed: ${cmd}\n      ${stderr.split('\n')[0]}`);
              card.status = 'failed';
              card.notes = appendUnique(card.notes, [`Check failed: ${cmd}`]);
              writeJson(cardPath, card);
            }
          }
        } catch (applyError) {
          log(`    ✗ Apply failed: ${(applyError as Error).message}`);
          card.status = 'failed';
          card.notes = appendUnique(card.notes, [`Apply failed: ${(applyError as Error).message}`]);
          writeJson(cardPath, card);
        }
      } else if (allowLegacyDirectApply && output.confidence < 0.7) {
        log(`    ⛔ Apply blocked: confidence ${output.confidence.toFixed(2)} < 0.70`);
      }
    }
  } finally {
    await evidenceRuntime.close();
    await pool.end();
  }

  log('\n── Summary ──────────────────────────────────────');
  log(`  Processed: ${events.length}`);
  log(`  Dry-runs:  ${dryRuns}`);
  log(`  Blocked:   ${blocked}`);
  log(`  Skipped:   ${skipped}`);
  log(`  Applied:   ${applied}`);
  log(`  Task cards/evidence: ${TASK_CARDS_DIR}`);
}

runRepairLoop().catch((error) => {
  console.error('[repair-loop] Fatal:', error);
  process.exit(1);
});

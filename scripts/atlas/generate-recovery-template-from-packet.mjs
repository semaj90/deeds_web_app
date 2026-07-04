#!/usr/bin/env node
/**
 * Generate a localized recovery template from a packet and error context.
 *
 * Flow:
 *   error_class -> HMM state -> topology-aware recovery selector
 *   -> recovery_packet_key -> localized repair/template generation
 *
 * Outputs:
 *   .tmp/recovery-template.json
 *   docs/reports/recovery-template.md
 *   optional task_semantic_packets row
 */

import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { selectRecoveryPacket } from './lib/topology-recovery-selector.mjs';

const { values: args } = parseArgs({
  options: {
    'error-class': { type: 'string' },
    'model-name': { type: 'string' },
    'model-path': { type: 'string' },
    'task-id': { type: 'string' },
    'packet-key': { type: 'string' },
    apply: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
  },
  strict: false,
});

const ERROR_CLASS = String(args['error-class'] ?? '').trim();
const MODEL_NAME_ARG = String(args['model-name'] ?? '').trim();
const MODEL_PATH_ARG = String(args['model-path'] ?? '').trim();
const TASK_ID = String(args['task-id'] ?? '').trim();
const PACKET_KEY = String(args['packet-key'] ?? '').trim();
const APPLY = Boolean(args.apply);
const DRY_RUN = Boolean(args['dry-run']) || !APPLY;
const VERBOSE = Boolean(args.verbose);

if (!PACKET_KEY) {
  console.error('❌ Missing required --packet-key=<packet_key>.');
  process.exit(1);
}
if (!ERROR_CLASS) {
  console.error('❌ Missing required --error-class=<error_class>.');
  process.exit(1);
}
if (!MODEL_PATH_ARG) {
  console.error('❌ Missing required --model-path=<absolute_path_to_gguf>.');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT_JSON = path.join(ROOT, '.tmp', 'recovery-template.json');
const OUT_MD = path.join(ROOT, 'docs', 'reports', 'recovery-template.md');

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 4 });
const MANIFEST_PATH = path.join(ROOT, 'models', 'model-manifest.json');

function resolveModelPath() {
  const candidates = [
    MODEL_PATH_ARG,
    env.ROTORQUANT_MODEL_PATH,
    env.TURBO_MODEL_PATH,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return '';
}

const MODEL_PATH = resolveModelPath();
if (!MODEL_PATH) {
  console.error('❌ Could not resolve a model path. Pass --model-path or set ROTORQUANT_MODEL_PATH / TURBO_MODEL_PATH.');
  process.exit(1);
}

function resolveModelName(modelPath) {
  if (MODEL_NAME_ARG) return MODEL_NAME_ARG;

  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const normalized = path.resolve(modelPath);
    const found = manifest?.models?.find((model) => {
      const localPath = model?.localPath ? path.resolve(ROOT, model.localPath) : null;
      const filename = model?.filename ? path.resolve(ROOT, 'models', model.filename) : null;
      return localPath === normalized || filename === normalized;
    });
    if (found?.id) return found.id;
  } catch {}

  const base = path.basename(modelPath);
  return base.replace(/\.(gguf|bin|pt|safetensors|onnx)$/i, '');
}

const MODEL_NAME = resolveModelName(MODEL_PATH);

function log(...parts) {
  console.log('[recovery-template]', ...parts);
}

function vlog(...parts) {
  if (VERBOSE) console.log('[recovery-template]', ...parts);
}

function toHmmState(errorClass) {
  const normalized = String(errorClass ?? '').trim().toLowerCase();
  if (
    [
      'schema_mismatch',
      'missing_dependency',
      'stale_cache',
      'retrieval_miss',
      'worker_timeout',
      'codec_failure',
      'audit_recommendation',
      'unknown',
    ].includes(normalized)
  ) {
    return normalized;
  }
  const map = {
    'schema': 'schema_mismatch',
    'migration': 'schema_mismatch',
    'dependency': 'missing_dependency',
    'cache': 'stale_cache',
    'retrieval': 'retrieval_miss',
    'timeout': 'worker_timeout',
    'codec': 'codec_failure',
    'binary': 'codec_failure',
    'audit': 'audit_recommendation',
    'refactor': 'audit_recommendation',
  };
  for (const [needle, state] of Object.entries(map)) {
    if (normalized.includes(needle)) return state;
  }
  return 'unknown';
}

function suggestedActionForState(state) {
  switch (state) {
    case 'schema_mismatch':
      return 'Run graphify:validate and verify the schema contract before applying the patch.';
    case 'missing_dependency':
      return 'Verify npm install ran; check alias resolution and required package imports.';
    case 'stale_cache':
      return 'Invalidate BitFrost repair keys and re-warm from Postgres canonical rows.';
    case 'retrieval_miss':
      return 'Check Qdrant payload coverage and rerun the phase 8 fan-out / payload verify lane.';
    case 'worker_timeout':
      return 'Reduce batch size or increase worker timeout; verify Gemma4 summary lane health.';
    case 'codec_failure':
      return 'Verify the binary codec / BYTEA round-trip and inspect the DAG-hit serialization path.';
    case 'audit_recommendation':
      return 'Create a localized repair task and queue it for operator review.';
    default:
      return 'Inspect evidence and escalate to operator review.';
  }
}

function commandsForState(state) {
  switch (state) {
    case 'schema_mismatch':
      return ['npm run graphify:validate', 'npm run atlas:phase8:readiness'];
    case 'missing_dependency':
      return ['npm run graphify:validate', 'npm --prefix sveltekit-frontend run search:rg:validate'];
    case 'stale_cache':
      return ['npm run atlas:feature-recommendations:refresh', 'npm run atlas:bitfrost-semantic-cache:warm:apply'];
    case 'retrieval_miss':
      return ['npm run atlas:qdrant-payload:verify', 'npm run atlas:phase8:fanout:dry'];
    case 'worker_timeout':
      return ['npm run phase7:monitor:node:watch', 'npm run phase7:worker:cluster:4'];
    case 'codec_failure':
      return ['npm run atlas:phase102:step10:server:grpc', 'npm run atlas:phase8:readiness'];
    case 'audit_recommendation':
      return ['npm run atlas:feature-todos:apply', 'npm run atlas:recommendations:kanban'];
    default:
      return ['npm run atlas:phase8:readiness'];
  }
}

function validationCommandsForState(state) {
  switch (state) {
    case 'schema_mismatch':
      return ['npm run graphify:validate', 'npm run atlas:phase8:readiness'];
    case 'missing_dependency':
      return ['npm --prefix sveltekit-frontend run search:rg:validate', 'npm run graphify:validate'];
    case 'stale_cache':
      return ['npm run atlas:feature-recommendations:refresh:dry', 'npm run atlas:qdrant-payload:verify'];
    case 'retrieval_miss':
      return ['npm run atlas:qdrant-payload:verify', 'npm run atlas:phase8:fanout:dry'];
    case 'worker_timeout':
      return ['npm run phase7:monitor:node', 'npm run atlas:phase8:readiness'];
    case 'codec_failure':
      return ['npm run atlas:phase102:step10:server:grpc', 'npm run atlas:qdrant-payload:verify'];
    case 'audit_recommendation':
      return ['npm run atlas:feature-todos:dry', 'npm run atlas:recommendations:replay'];
    default:
      return ['npm run atlas:phase8:readiness'];
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function uniq(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function safeJsonArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildSafePatchScope(sourceRef) {
  const ref = normalizeText(sourceRef);
  if (!ref) return 'unknown';
  const pieces = ref.split('/');
  if (pieces.length <= 1) return ref;
  return pieces.slice(0, -1).join('/');
}

function buildRoutingHints(state, packet, recovery) {
  return uniq([
    state,
    'repair',
    'bitfrost',
    'localized-template',
    packet.title_id,
    packet.feature_id,
    packet.community_id != null ? `community:${packet.community_id}` : null,
    packet.som_cluster != null ? `som:${packet.som_cluster}` : null,
    recovery?.feature_id && recovery.feature_id !== packet.feature_id ? `feature:${recovery.feature_id}` : null,
    ...(safeJsonArray(packet.routing_hints)),
    ...(safeJsonArray(recovery?.routing_hints)),
  ]);
}

async function loadPacketContext(packetKey) {
  const { rows } = await pool.query(
    `
    SELECT
      p.packet_key,
      p.packet_id,
      p.packet_ulid,
      p.title_id,
      p.feature_id,
      p.feature_label,
      p.source_ref,
      p.community_id,
      p.som_cluster,
      p.page_rank_score,
      p.routing_hints,
      p.summary,
      p.domain_class,
      cci.summary AS chunk_summary
    FROM atlas_packets p
    LEFT JOIN codebase_chunk_index cci
      ON (
        cci.relative_path = p.source_ref
        OR cci.relative_path = 'sveltekit-frontend/' || p.source_ref
        OR p.source_ref = 'sveltekit-frontend/' || cci.relative_path
      )
    WHERE p.packet_key = $1
    LIMIT 1
    `,
    [packetKey],
  );
  return rows[0] ?? null;
}

async function loadFeatureNeighbors(featureId) {
  if (!featureId) return [];
  const { rows } = await pool.query(
    `
    SELECT packet_key, source_ref, feature_id, title_id, community_id, som_cluster, page_rank_score
    FROM atlas_packets
    WHERE feature_id = $1
    ORDER BY page_rank_score DESC NULLS LAST, packet_key ASC
    LIMIT 5
    `,
    [featureId],
  );
  return rows;
}

function buildTemplate({ state, anchor, recovery, neighbors }) {
  const sourcePacket = recovery ?? anchor;
  const fallbackSource = normalizeText(sourcePacket?.source_ref ?? anchor?.source_ref ?? '');
  const sourceRef = fallbackSource;
  const safePatchScope = buildSafePatchScope(sourceRef);
  const filesToInspect = uniq([
    sourceRef,
    ...neighbors.map((row) => row.source_ref),
    anchor?.source_ref,
    recovery?.source_ref,
  ]).slice(0, 5);

  return {
    packet_key: normalizeText(anchor?.packet_key ?? sourcePacket?.packet_key ?? PACKET_KEY),
    packet_id: normalizeText(sourcePacket?.packet_id ?? anchor?.packet_id ?? ''),
    packet_ulid: normalizeText(sourcePacket?.packet_ulid ?? anchor?.packet_ulid ?? ''),
    task_id: TASK_ID || null,
    error_class: ERROR_CLASS,
    hmm_state: state,
    model_name: MODEL_NAME,
    model_path: MODEL_PATH || null,
    recovery_packet_key: normalizeText(recovery?.packet_key ?? ''),
    source_ref: sourceRef,
    title_id: normalizeText(sourcePacket?.title_id ?? anchor?.title_id ?? ''),
    feature_id: normalizeText(sourcePacket?.feature_id ?? anchor?.feature_id ?? ''),
    community_id: sourcePacket?.community_id ?? anchor?.community_id ?? null,
    som_cluster: sourcePacket?.som_cluster ?? anchor?.som_cluster ?? null,
    page_rank_score: sourcePacket?.page_rank_score ?? anchor?.page_rank_score ?? null,
    routing_hints: buildRoutingHints(state, anchor ?? {}, recovery ?? sourcePacket ?? {}),
    suggested_action: suggestedActionForState(state),
    files_to_inspect: filesToInspect,
    commands_to_run: commandsForState(state),
    safe_patch_scope: safePatchScope,
    validation_commands: validationCommandsForState(state),
    summary_preview: normalizeText(sourcePacket?.summary ?? sourcePacket?.chunk_summary ?? anchor?.summary ?? anchor?.chunk_summary ?? '').slice(0, 320),
    related_packets: neighbors.map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      title_id: row.title_id,
      community_id: row.community_id,
      som_cluster: row.som_cluster,
      page_rank_score: row.page_rank_score,
    })),
    generated_at: new Date().toISOString(),
  };
}

async function writeOutputs(template) {
  const md = [
    '# Recovery Template',
    '',
    `Generated: ${template.generated_at}`,
    `State: ${template.hmm_state}`,
    `Error class: ${template.error_class}`,
    `Model: ${template.model_name}`,
    template.model_path ? `Model path: ${template.model_path}` : 'Model path: n/a',
    `Packet: ${template.packet_key}`,
    template.recovery_packet_key ? `Recovery packet: ${template.recovery_packet_key}` : 'Recovery packet: n/a',
    '',
    '## Template',
    '',
    `- source_ref: ${template.source_ref || 'n/a'}`,
    `- title_id: ${template.title_id || 'n/a'}`,
    `- feature_id: ${template.feature_id || 'n/a'}`,
    `- community_id: ${template.community_id ?? 'n/a'}`,
    `- som_cluster: ${template.som_cluster ?? 'n/a'}`,
    `- page_rank_score: ${template.page_rank_score ?? 'n/a'}`,
    `- safe_patch_scope: ${template.safe_patch_scope}`,
    '',
    '## Routing Hints',
    '',
    ...template.routing_hints.map((hint) => `- ${hint}`),
    '',
    '## Suggested Action',
    '',
    template.suggested_action,
    '',
    '## Files To Inspect',
    '',
    ...template.files_to_inspect.map((file) => `- ${file}`),
    '',
    '## Commands To Run',
    '',
    ...template.commands_to_run.map((cmd) => `- ${cmd}`),
    '',
    '## Validation Commands',
    '',
    ...template.validation_commands.map((cmd) => `- ${cmd}`),
    '',
    '## Related Packets',
    '',
    ...template.related_packets.map((row) => `- ${row.packet_key} | ${row.source_ref ?? 'n/a'} | ${row.feature_id ?? 'n/a'}`),
    '',
  ].join('\n');

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.mkdir(path.dirname(OUT_MD), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(template, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUT_MD, md, 'utf8');
}

async function maybeWriteTaskPacket(template) {
  if (DRY_RUN) return false;
  try {
    const tableCheck = await pool.query(
      `SELECT to_regclass('public.task_semantic_packets') AS table_name`,
    );
    if (!tableCheck.rows[0]?.table_name) {
      vlog('task_semantic_packets table missing; skipping optional task write');
      return false;
    }

    await pool.query(
      `
      INSERT INTO task_semantic_packets (
        packet_key, task_title, task_type, task_status, source_ref, metadata, created_at
      ) VALUES (
        gen_random_uuid()::text,
        $1,
        $2,
        'pending',
        $3,
        $4::jsonb,
        NOW()
      )
      ON CONFLICT DO NOTHING
      `,
      [
        `recovery-template:${template.hmm_state}:${template.packet_key}`,
        'recovery_template',
        template.source_ref || template.packet_key,
      JSON.stringify(template),
      ],
    );
    return true;
  } catch (error) {
    console.warn('[recovery-template] optional task_semantic_packets write skipped:', error.message);
    return false;
  }
}

async function main() {
  log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  log(`Packet key: ${PACKET_KEY}`);
  log(`Error class: ${ERROR_CLASS}`);
  log(`Model name: ${MODEL_NAME}`);
  if (MODEL_PATH) log(`Model path: ${MODEL_PATH}`);
  if (TASK_ID) log(`Task id: ${TASK_ID}`);

  const state = toHmmState(ERROR_CLASS);
  const anchor = await loadPacketContext(PACKET_KEY);
  if (!anchor) {
    console.error(`[recovery-template] packet not found: ${PACKET_KEY}`);
    process.exit(1);
  }

  const recovery = await selectRecoveryPacket({
    pool,
    errorClass: ERROR_CLASS,
    modelName: MODEL_NAME,
    state,
    failingKeys: [PACKET_KEY],
  }).catch((error) => {
    vlog('recovery selector failed:', error.message);
    return null;
  });

  const recoveryPacket = recovery?.packet_key
    ? await loadPacketContext(recovery.packet_key)
    : null;
  const neighbors = await loadFeatureNeighbors((recoveryPacket ?? anchor)?.feature_id ?? anchor.feature_id);
  const template = buildTemplate({
    state,
    anchor,
    recovery: recoveryPacket,
    neighbors,
  });

  await writeOutputs(template);
  const taskPacketWritten = await maybeWriteTaskPacket(template);

  log(`Recovery packet: ${template.recovery_packet_key || '(none)'}`);
  log(`Files to inspect: ${template.files_to_inspect.length}`);
  log(`Commands to run: ${template.commands_to_run.length}`);
  log(`Validation commands: ${template.validation_commands.length}`);
  log(`Task packet: ${taskPacketWritten ? 'wrote' : 'skipped or dry-run'}`);
  log(`Outputs: ${OUT_JSON}, ${OUT_MD}`);

  await pool.end();
}

main().catch(async (error) => {
  console.error('[recovery-template] fatal:', error.message);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});

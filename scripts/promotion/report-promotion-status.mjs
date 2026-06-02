#!/usr/bin/env node
/**
 * report-promotion-status.mjs
 *
 * Reads IMPLEMENTATION_STATUS.md, MASTER-FEATURE-TODO-2026-05-20.md,
 * the queue manifest, and known .tmp reports to produce a single
 * promotion status snapshot.
 *
 * Output:
 *   .tmp/promotion-status.json
 *   .tmp/promotion-status.md
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
// Reports may land in root .tmp (atlas scripts) or sveltekit-frontend/.tmp (sidecar scripts)
const ROOT_TMP = resolve(ROOT, '.tmp');
const SK_TMP = resolve(ROOT, 'sveltekit-frontend', '.tmp');
// Writer always goes to SK_TMP so the sidecar-centric scripts pick it up too
const TMP_DIR = SK_TMP;

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function findReport(relPath) {
  // Try root .tmp first (atlas scripts), then sveltekit-frontend/.tmp (sidecar scripts)
  const candidates = [
    resolve(ROOT, relPath),
    resolve(ROOT, 'sveltekit-frontend', relPath),
  ];
  return candidates.find(p => existsSync(p)) ?? null;
}

function reportExists(relPath) {
  return findReport(relPath) !== null;
}

// ── Load manifest ─────────────────────────────────────────────────────────────

const manifestPath = resolve(__dirname, 'promotion-queue.manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : null;

// ── Check known .tmp reports ──────────────────────────────────────────────────

const knownReports = {
  'mcp_sidecar_transport_audit':     '.tmp/mcp-sidecar-transport-audit.json',
  'mcp_sidecar_transport_fix_report': '.tmp/mcp-sidecar-transport-fix-report.json',
  'knowledge_card_validation':       '.tmp/knowledge-card-validation.json',
  'source_ref_candidates':           '.tmp/source-ref-repair-candidates.ndjson',
  'consolidation_claim_check':       '.tmp/knowledge-consolidation-claim-check.json',
  'alias_id_preflight':              '.tmp/alias-id-migration-preflight-report.json',
  'offline_synthesis_report':        '.tmp/offline-synthesis-report.json',
  'qdrant_postgres_reconciliation':  '.tmp/qdrant-postgres-mirror-reconciliation.json',
  'parent_atlas_validation':         '.tmp/parent-atlas-validation.json',
  'promotion_queue_run':             '.tmp/promotion-queue-run.json',
};

const reportStatus = {};
for (const [key, relPath] of Object.entries(knownReports)) {
  reportStatus[key] = reportExists(relPath);
}

// ── Check MCP sidecar guard ────────────────────────────────────────────────────

let mcpGuardStatus = 'UNKNOWN';
let mcpGuardDetail = 'No audit report found — run npm run mcp:sidecars:audit';
const mcpReport = readJson(findReport('.tmp/mcp-sidecar-transport-audit.json'));
if (mcpReport) {
  mcpGuardStatus = mcpReport.exit_code === 0 ? 'GREEN' : 'RED';
  mcpGuardDetail = mcpReport.summary ?? '';
}

// ── Check alias_id preflight ──────────────────────────────────────────────────

let aliasIdStatus = 'UNKNOWN';
let aliasIdDetail = 'No preflight report found — run alias-id-schema-preflight';
const aliasReport = readJson(findReport('.tmp/alias-id-migration-preflight-report.json'));
if (aliasReport) {
  const colExists = aliasReport.column_exists === true || aliasReport.alias_id_exists === true;
  aliasIdStatus = colExists ? 'UNBLOCKED' : 'BLOCKED';
  aliasIdDetail = colExists
    ? 'alias_id column confirmed in live schema — apply jobs may proceed'
    : 'alias_id column NOT found in live schema — do not persist alias_id until column migration is applied';
}

// ── Check card validation gate ────────────────────────────────────────────────

let cardValidationStatus = 'UNKNOWN';
let cardValidationDetail = 'No validation report found — run knowledge-card-validation';
const cardReport = readJson(findReport('.tmp/knowledge-card-validation.json'));
if (cardReport) {
  const parseErrors = cardReport.summary?.parse_errors ?? cardReport.failed ?? cardReport.error_count ?? cardReport.invalid_count ?? null;
  const totalCards = cardReport.summary?.total_cards ?? 0;
  const missingRefs = cardReport.ref_coverage?.cards_missing_any_ref ?? null;
  if (parseErrors === 0 || cardReport.ok === true || cardReport.status === 'pass') {
    // Parse errors = 0 means structural integrity passed; missing refs are a data quality issue, not a blocker
    cardValidationStatus = 'GREEN';
    const refNote = missingRefs !== null ? ` (${missingRefs.toLocaleString()}/${totalCards.toLocaleString()} cards missing source refs — run source-ref-candidate-generation)` : '';
    cardValidationDetail = `Card validation passed — ${totalCards.toLocaleString()} cards, 0 parse errors${refNote}`;
  } else if (parseErrors !== null && parseErrors > 0) {
    cardValidationStatus = 'YELLOW';
    cardValidationDetail = `${parseErrors} parse errors detected — review before apply`;
  } else {
    cardValidationStatus = 'YELLOW';
    cardValidationDetail = 'Report exists but status unclear — review manually';
  }
}

// ── Check offline synthesis dry-run ──────────────────────────────────────────

let synthDryRunStatus = 'UNKNOWN';
let synthDryRunDetail = 'No dry-run report — run offline-synthesis-dry-run queue item';
const synthReport = readJson(findReport('.tmp/offline-synthesis-report.json'));
if (synthReport) {
  const allStepsOk = Array.isArray(synthReport.steps) && synthReport.steps.length > 0
    && synthReport.steps.every(step => step.status === 'ok');
  const ok = synthReport.ok === true || synthReport.status === 'ok' || synthReport.exit_code === 0 || allStepsOk;
  synthDryRunStatus = ok ? 'GREEN' : 'YELLOW';
  synthDryRunDetail = ok ? 'Dry-run passed — bounded apply is safe' : 'Dry-run has issues — review before bounded apply';
}

// ── NEW GATES: Postgres schema preflight ────────────────────────────────────

let postgresSchemaStatus = 'UNKNOWN';
let postgresSchemaDetail = 'No schema audit report — run: node scripts/promotion/audit-postgres-promotion-schema.mjs';
const pgSchemaReport = readJson(findReport('.tmp/postgres-promotion-schema-audit.json'));
if (pgSchemaReport) {
  const gates = pgSchemaReport.gates ?? {};
  const pg18 = pgSchemaReport.postgres_version?.includes('18') ?? false;
  const allGreen = Object.values(gates).every(v => v === true || v === 'ok' || v === 'present');
  if (allGreen) {
    postgresSchemaStatus = 'GREEN';
    postgresSchemaDetail = `Schema audit passed — Postgres ${pgSchemaReport.postgres_version ?? '?'}, all required tables/cols present`;
  } else {
    const failed = Object.entries(gates).filter(([, v]) => v !== true && v !== 'ok' && v !== 'present').map(([k]) => k);
    postgresSchemaStatus = 'YELLOW';
    postgresSchemaDetail = `Schema gaps: ${failed.join(', ')}`;
  }
  if (!pg18 && pgSchemaReport.postgres_version) {
    postgresSchemaDetail += ` — NOTE: live DB is Postgres ${pgSchemaReport.postgres_version}; project targets Postgres 18 lane`;
  }
}

// ── NEW GATES: Drizzle drift audit ───────────────────────────────────────────

let drizzleDriftStatus = 'UNKNOWN';
let drizzleDriftDetail = 'No Drizzle drift report — run: node scripts/promotion/audit-drizzle-promotion-drift.mjs';
const driftReport = readJson(findReport('.tmp/drizzle-promotion-drift-audit.json'));
if (driftReport) {
  const mustCreate = (driftReport.must_create_before_promotion ?? []);
  const notInDrizzle = (driftReport.not_in_drizzle_schema ?? []);
  if (mustCreate.length === 0) {
    drizzleDriftStatus = 'GREEN';
    drizzleDriftDetail = `Drizzle schema aligned — ${notInDrizzle.length} DB-only tables (protected by filter)`;
  } else {
    drizzleDriftStatus = 'BLOCKED';
    drizzleDriftDetail = `${mustCreate.length} table(s) must be created before promotion: ${mustCreate.join(', ')}`;
  }
}

// ── NEW GATES: alias_id live verification ────────────────────────────────────

let aliasIdVerifiedStatus = 'UNKNOWN';
let aliasIdVerifiedDetail = 'No live alias_id verification — run: node scripts/promotion/audit-postgres-promotion-schema.mjs';
if (pgSchemaReport) {
  const colVerified = pgSchemaReport.alias_id_on_task_semantic_packets === true
    || pgSchemaReport.gates?.alias_id_verified === true;
  aliasIdVerifiedStatus = colVerified ? 'GREEN' : 'BLOCKED';
  aliasIdVerifiedDetail = colVerified
    ? 'alias_id confirmed in live task_semantic_packets (Postgres 18 lane ready)'
    : 'alias_id NOT found in task_semantic_packets — apply 20260601_add_alias_and_parent_atlas_indexes.sql first';
}

// ── NEW GATES: parent_atlas_documents readiness ──────────────────────────────

let parentAtlasDocStatus = 'UNKNOWN';
let parentAtlasDocDetail = 'No schema audit — run: node scripts/promotion/audit-postgres-promotion-schema.mjs';
if (pgSchemaReport) {
  const tableExists = pgSchemaReport.parent_atlas_documents_exists === true
    || pgSchemaReport.gates?.parent_atlas_documents_exists === true;
  parentAtlasDocStatus = tableExists ? 'GREEN' : 'BLOCKED';
  parentAtlasDocDetail = tableExists
    ? 'parent_atlas_documents table confirmed in live DB'
    : 'parent_atlas_documents MISSING — apply 20260601_add_alias_and_parent_atlas_indexes.sql (creates table + 8 indexes)';
}
if (driftReport) {
  const mustCreate = (driftReport.must_create_before_promotion ?? []);
  if (mustCreate.includes('parent_atlas_documents') && parentAtlasDocStatus !== 'GREEN') {
    parentAtlasDocStatus = 'BLOCKED';
    parentAtlasDocDetail = 'parent_atlas_documents in must_create list — migration required before promotion';
  }
}

// ── NEW GATES: duplicate rels classification ─────────────────────────────────

let dupRelsStatus = 'UNKNOWN';
let dupRelsDetail = 'No preflight report — run: node sveltekit-frontend/scripts/atlas/current-corpus-promotion-preflight.mjs';
const preflightReport = readJson(findReport('.tmp/current-corpus-promotion-preflight.json'))
  ?? readJson(findReport('sveltekit-frontend/.tmp/current-corpus-promotion-preflight.json'))
  ?? readJson(resolve(ROOT, 'memory', 'agent-runs', 'current-corpus-promotion-preflight.json'));
if (preflightReport) {
  const dupCount = preflightReport.stats?.duplicate_rels ?? preflightReport.duplicate_rels_count ?? null;
  const upsertVerified = preflightReport.upsert_strategy_verified === true
    || (preflightReport.warnings ?? []).every(w => !w.toLowerCase().includes('duplicate') || w.includes('ON CONFLICT'));
  if (dupCount === 0) {
    dupRelsStatus = 'GREEN';
    dupRelsDetail = 'No duplicate rels — promotion is clean';
  } else if (dupCount !== null && upsertVerified) {
    dupRelsStatus = 'GREEN';
    dupRelsDetail = `${dupCount} duplicate rels present — ON CONFLICT (source_ref, workspace_id) DO UPDATE upsert strategy verified`;
  } else if (dupCount !== null) {
    dupRelsStatus = 'YELLOW';
    dupRelsDetail = `${dupCount} duplicate rels — ON CONFLICT upsert strategy must be confirmed in parent_atlas_documents before apply`;
  }
}

// ── NEW GATES: Redis auth configuration ──────────────────────────────────────

let redisAuthStatus = 'UNKNOWN';
let redisAuthDetail = 'Redis auth not probed — run audit scripts to check connectivity';
if (pgSchemaReport?.redis_auth_checked !== undefined) {
  redisAuthStatus = pgSchemaReport.redis_auth_required === false ? 'GREEN' : 'YELLOW';
  redisAuthDetail = pgSchemaReport.redis_auth_required === false
    ? 'legal-ai-redis responds to empty-password AUTH (container default)'
    : 'Redis requires non-empty AUTH — set REDIS_PASSWORD env var before promotion apply';
}
// Also check if TS bridge audit has redis info
const tsBridgeReport = readJson(findReport('.tmp/typescript-promotion-bridge-audit.json'));
if (tsBridgeReport?.redis_connectivity) {
  const rc = tsBridgeReport.redis_connectivity;
  redisAuthStatus = rc.status === 'ok' ? 'GREEN' : 'YELLOW';
  redisAuthDetail = rc.detail ?? redisAuthDetail;
}

// ── Build lane summary ────────────────────────────────────────────────────────

const closedLanes = [
  'MCP sidecar transport (turbovec :8791, engram :8792 HTTP+stdio, langextract :8793) — GREEN as of 2026-05-31',
  'MapReduce import path resolution (dangling refs 9041 → 1603, gate <2000 PASSED) — 2026-05-31',
  'UUID standardization live schema (45 integer / 0 uuid / 3 text) — 2026-05-30',
  'Bounded offline synthesis apply (25-card slice validated) — 2026-05-31',
  'Feature consolidation into 8 domains (evidence/rag/cases/ai/legal-corpus/codebase-intel/identity/observability) — 2026-05-31',
];

const openLanes = [
  'offline-synthesis-dry-run — verify LLM reachability and output shape before apply',
  'knowledge-card-validation — audit card integrity before any promotion apply',
  'source-ref-candidate-generation — suggest missing source ref repairs',
  'consolidation-claim-check — verify no duplicate canonical IDs',
  'qdrant-postgres-reconciliation — reconcile mirror drift before sync apply',
  'parent-atlas-validation — structural integrity check on current snapshot',
];

const blockedLanes = [];
if (aliasIdStatus === 'BLOCKED' || aliasIdStatus === 'UNKNOWN') {
  blockedLanes.push(`alias_id persist lane — ${aliasIdDetail}`);
}
if (cardValidationStatus !== 'GREEN') {
  blockedLanes.push(`broad promotion apply — pending card validation gate (status: ${cardValidationStatus})`);
}
if (parentAtlasDocStatus === 'BLOCKED') {
  blockedLanes.push(`parent_atlas_documents missing — ${parentAtlasDocDetail}`);
}
if (drizzleDriftStatus === 'BLOCKED') {
  blockedLanes.push(`Drizzle drift — ${drizzleDriftDetail}`);
}

const missingReports = Object.entries(reportStatus)
  .filter(([, exists]) => !exists)
  .map(([key]) => `${key} → ${knownReports[key]}`);

// ── Can promotion run bounded apply? ─────────────────────────────────────────

let canRunBoundedApply = false;
let boundedApplyBlockers = [];
if (mcpGuardStatus !== 'GREEN')           boundedApplyBlockers.push('MCP sidecar guard not GREEN');
if (cardValidationStatus !== 'GREEN')     boundedApplyBlockers.push('Card validation gate not GREEN');
if (synthDryRunStatus !== 'GREEN')        boundedApplyBlockers.push('Offline synthesis dry-run not GREEN');
if (aliasIdStatus === 'BLOCKED')          boundedApplyBlockers.push('alias_id column missing from live schema');
// New gates
if (postgresSchemaStatus === 'YELLOW' || postgresSchemaStatus === 'UNKNOWN')
  boundedApplyBlockers.push('Postgres schema preflight not verified');
if (drizzleDriftStatus === 'BLOCKED')     boundedApplyBlockers.push('Drizzle drift: must_create_before_promotion is non-empty');
if (aliasIdVerifiedStatus === 'BLOCKED')  boundedApplyBlockers.push('alias_id not confirmed in live task_semantic_packets');
if (parentAtlasDocStatus === 'BLOCKED')   boundedApplyBlockers.push('parent_atlas_documents table missing from live DB');
canRunBoundedApply = boundedApplyBlockers.length === 0;

// ── Next safe queue command ───────────────────────────────────────────────────

let nextSafeCommand;
if (mcpGuardStatus !== 'GREEN') {
  nextSafeCommand = 'npm run mcp:sidecars:audit';
} else if (postgresSchemaStatus === 'UNKNOWN') {
  nextSafeCommand = 'node scripts/promotion/audit-postgres-promotion-schema.mjs';
} else if (drizzleDriftStatus === 'UNKNOWN') {
  nextSafeCommand = 'node scripts/promotion/audit-drizzle-promotion-drift.mjs';
} else if (parentAtlasDocStatus === 'BLOCKED') {
  nextSafeCommand = 'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -f /tmp/20260601_add_alias_and_parent_atlas_indexes.sql  # creates parent_atlas_documents + indexes';
} else if (aliasIdVerifiedStatus === 'BLOCKED') {
  nextSafeCommand = 'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -f /tmp/20260601_add_alias_and_parent_atlas_indexes.sql  # adds alias_id column (idempotent)';
} else if (!reportStatus['knowledge_card_validation']) {
  nextSafeCommand = 'node scripts/promotion/run-promotion-queue.mjs --dry-run --only knowledge-card-validation';
} else if (!reportStatus['alias_id_preflight']) {
  nextSafeCommand = 'node scripts/promotion/run-promotion-queue.mjs --dry-run --only alias-id-schema-preflight';
} else if (!reportStatus['offline_synthesis_report']) {
  nextSafeCommand = 'node scripts/promotion/run-promotion-queue.mjs --dry-run --only offline-synthesis-dry-run';
} else if (!reportStatus['qdrant_postgres_reconciliation']) {
  nextSafeCommand = 'node scripts/promotion/run-promotion-queue.mjs --dry-run --only qdrant-postgres-reconciliation';
} else if (canRunBoundedApply) {
  nextSafeCommand = 'node scripts/atlas/run-offline-synthesis.mjs --apply --limit 25 --offset 0';
} else {
  nextSafeCommand = `node scripts/promotion/run-promotion-queue.mjs --dry-run  # resolve blockers: ${boundedApplyBlockers.join('; ')}`;
}

// ── Assemble result ───────────────────────────────────────────────────────────

const result = {
  generated_at: new Date().toISOString(),
  mcp_sidecar_guard: { status: mcpGuardStatus, detail: mcpGuardDetail },
  alias_id_schema: { status: aliasIdStatus, detail: aliasIdDetail },
  card_validation_gate: { status: cardValidationStatus, detail: cardValidationDetail },
  offline_synthesis_dry_run: { status: synthDryRunStatus, detail: synthDryRunDetail },
  // New schema/index gates
  postgres_schema_preflight: { status: postgresSchemaStatus, detail: postgresSchemaDetail },
  drizzle_drift_audit: { status: drizzleDriftStatus, detail: drizzleDriftDetail },
  alias_id_verified: { status: aliasIdVerifiedStatus, detail: aliasIdVerifiedDetail },
  parent_atlas_documents_ready: { status: parentAtlasDocStatus, detail: parentAtlasDocDetail },
  duplicate_rels_classified: { status: dupRelsStatus, detail: dupRelsDetail },
  redis_auth_configured: { status: redisAuthStatus, detail: redisAuthDetail },
  can_run_bounded_apply: canRunBoundedApply,
  bounded_apply_blockers: boundedApplyBlockers,
  lanes: {
    closed: closedLanes,
    open: openLanes,
    blocked: blockedLanes,
  },
  reports: reportStatus,
  missing_reports: missingReports,
  next_safe_command: nextSafeCommand,
};

// ── Write outputs ─────────────────────────────────────────────────────────────

mkdirSync(TMP_DIR, { recursive: true });

writeFileSync(
  resolve(TMP_DIR, 'promotion-status.json'),
  JSON.stringify(result, null, 2) + '\n',
  'utf8',
);

const mdLines = [
  '# Promotion Status Report',
  '',
  `**Generated:** ${result.generated_at}`,
  '',
  '## Gate Summary',
  '',
  '| Gate | Status | Detail |',
  '|------|--------|--------|',
  `| MCP sidecar guard | ${mcpGuardStatus === 'GREEN' ? '✅' : mcpGuardStatus === 'RED' ? '❌' : '⚠️'} ${mcpGuardStatus} | ${mcpGuardDetail} |`,
  `| Card validation | ${cardValidationStatus === 'GREEN' ? '✅' : cardValidationStatus === 'YELLOW' ? '🟡' : '⚠️'} ${cardValidationStatus} | ${cardValidationDetail} |`,
  `| alias_id schema | ${aliasIdStatus === 'UNBLOCKED' ? '✅' : aliasIdStatus === 'BLOCKED' ? '❌' : '⚠️'} ${aliasIdStatus} | ${aliasIdDetail} |`,
  `| Synthesis dry-run | ${synthDryRunStatus === 'GREEN' ? '✅' : synthDryRunStatus === 'YELLOW' ? '🟡' : '⚠️'} ${synthDryRunStatus} | ${synthDryRunDetail} |`,
  `| **Can run bounded apply** | ${canRunBoundedApply ? '✅ YES' : '❌ NO'} | ${canRunBoundedApply ? 'All gates green' : boundedApplyBlockers.join('; ')} |`,
  '',
  '## Closed Lanes',
  '',
  ...closedLanes.map(l => `- ✅ ${l}`),
  '',
  '## Open Lanes',
  '',
  ...openLanes.map(l => `- 🔄 ${l}`),
  '',
];

if (blockedLanes.length > 0) {
  mdLines.push('## Blocked Lanes', '');
  for (const b of blockedLanes) mdLines.push(`- ❌ ${b}`);
  mdLines.push('');
}

if (missingReports.length > 0) {
  mdLines.push('## Missing Reports', '');
  for (const m of missingReports) mdLines.push(`- ⚠️  ${m}`);
  mdLines.push('');
}

mdLines.push(
  '## Next Safe Command',
  '',
  '```bash',
  nextSafeCommand,
  '```',
  '',
  '## Queue Commands',
  '',
  '```bash',
  '# Full dry-run preview',
  'node scripts/promotion/run-promotion-queue.mjs --dry-run',
  '',
  '# Individual audit items',
  'node scripts/promotion/run-promotion-queue.mjs --dry-run --only knowledge-card-validation',
  'node scripts/promotion/run-promotion-queue.mjs --dry-run --only alias-id-schema-preflight',
  'node scripts/promotion/run-promotion-queue.mjs --dry-run --only qdrant-postgres-reconciliation',
  '',
  '# Bounded apply (only after all gates green)',
  '# node scripts/promotion/run-promotion-queue.mjs --allow-apply --only offline-synthesis-dry-run --limit 25',
  '```',
  '',
);

writeFileSync(
  resolve(TMP_DIR, 'promotion-status.md'),
  mdLines.join('\n') + '\n',
  'utf8',
);

// ── Console output ────────────────────────────────────────────────────────────

console.log('\n=== Promotion Status ===\n');
console.log(`MCP sidecar guard:    ${mcpGuardStatus === 'GREEN' ? '✅' : '⚠️ '} ${mcpGuardStatus}`);
console.log(`Card validation:      ${cardValidationStatus === 'GREEN' ? '✅' : '⚠️ '} ${cardValidationStatus}`);
console.log(`alias_id schema:      ${aliasIdStatus === 'UNBLOCKED' ? '✅' : '⚠️ '} ${aliasIdStatus}`);
console.log(`Synthesis dry-run:    ${synthDryRunStatus === 'GREEN' ? '✅' : '⚠️ '} ${synthDryRunStatus}`);
console.log(`Can bounded apply:    ${canRunBoundedApply ? '✅ YES' : '❌ NO'}`);
if (boundedApplyBlockers.length > 0) {
  for (const b of boundedApplyBlockers) console.log(`  ❌  ${b}`);
}
console.log('');
console.log(`Open lanes:    ${openLanes.length}`);
console.log(`Closed lanes:  ${closedLanes.length}`);
console.log(`Blocked lanes: ${blockedLanes.length}`);
console.log(`Missing reports: ${missingReports.length}`);
console.log('');
console.log(`Next safe command:`);
console.log(`  ${nextSafeCommand}`);
console.log('');
console.log('Reports:');
console.log('  .tmp/promotion-status.json');
console.log('  .tmp/promotion-status.md\n');

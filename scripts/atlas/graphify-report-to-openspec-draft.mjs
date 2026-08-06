#!/usr/bin/env node
/**
 * graphify-report-to-openspec-draft.mjs
 *
 * Reads today's graphify:daily report artifacts (docs/reports/*.json,
 * sveltekit-frontend/docs/reports/*.json), asks llama-server.exe (:8090,
 * whatever model is loaded, streaming) to draft a change recommendation per
 * report, writes an unreviewed draft to openspec/drafts/{date}_{topic}.md,
 * and logs a PROPOSED row in Postgres recommendation_log (the existing
 * phase109a recommendation ledger — see src/lib/server/db/schema-phase109a.ts)
 * so drafts stay traceable through the promote/supersede lifecycle already
 * exposed via the phase109a MCP tools.
 *
 * This never touches openspec/changes/ — drafts are an unreviewed inbox.
 * A human (or a separate review pass) promotes an accepted draft into a
 * real openspec/changes/<slug>/ via the openspec-propose skill.
 *
 * Usage:
 *   node scripts/atlas/graphify-report-to-openspec-draft.mjs --dry-run
 *   node scripts/atlas/graphify-report-to-openspec-draft.mjs --apply --limit=5
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const POSTGRES_CONTAINER = process.env.PARENT_ATLAS_POSTGRES_CONTAINER || 'legal-ai-postgres';
const POSTGRES_USER = process.env.PARENT_ATLAS_POSTGRES_USER || 'legal_admin';
const POSTGRES_DB = process.env.PARENT_ATLAS_POSTGRES_DB || 'legal_ai_db';
const POSTGRES_PASSWORD = process.env.PARENT_ATLAS_POSTGRES_PASSWORD || '123456';

const LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY; // default: dry-run unless --apply is explicit
const VERBOSE = args.includes('--verbose');
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 8);
const SINCE_HOURS = Number(args.find((a) => a.startsWith('--since-hours='))?.split('=')[1] ?? 48);

const REPORT_DIRS = [
  path.join(REPO_ROOT, 'docs', 'reports'),
  path.join(REPO_ROOT, 'sveltekit-frontend', 'docs', 'reports'),
];
const DRAFTS_DIR = path.join(REPO_ROOT, 'openspec', 'drafts');

function log(msg) {
  console.log(`[graphify-report-to-openspec-draft] ${msg}`);
}

// ─── Postgres via docker exec (matches warm-bitfrost-semantic-cache.mjs) ──────

function runPsql(sql) {
  const result = spawnSync(
    'docker',
    [
      'exec', '-e', `PGPASSWORD=${POSTGRES_PASSWORD}`, POSTGRES_CONTAINER,
      'psql', '-U', POSTGRES_USER, '-d', POSTGRES_DB, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '\t', '-c', sql,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 },
  );
  if (result.status !== 0) {
    throw new Error(String(result.stderr ?? result.stdout ?? `psql exit ${result.status}`));
  }
  return String(result.stdout ?? '').trim();
}

function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlTextArray(values) {
  if (!values || values.length === 0) return "'{}'::text[]";
  return `ARRAY[${values.map(sqlQuote).join(',')}]::text[]`;
}

async function insertRecommendation({
  workspaceId, revisionId, subjectId, proposedAction, inferenceExplanation,
  evidenceIds, evidenceConfidence, validationCriteria, expectedImpact,
  rollbackPlan, rollbackVerification, createdBy,
}) {
  const sql = `
    insert into public.recommendation_log (
      workspace_id, revision_id, subject_id, proposed_action, inference_explanation,
      evidence_ids, evidence_confidence, validation_criteria, expected_impact,
      rollback_plan, rollback_verification, status, created_by
    ) values (
      ${sqlQuote(workspaceId)}, ${sqlQuote(revisionId)}, ${sqlQuote(subjectId)},
      ${sqlQuote(proposedAction)}, ${sqlQuote(inferenceExplanation)},
      ${sqlTextArray(evidenceIds)}, ${Number(evidenceConfidence).toFixed(2)},
      ${sqlQuote(validationCriteria)}, ${sqlQuote(expectedImpact)},
      ${sqlQuote(rollbackPlan)}, ${sqlQuote(rollbackVerification)},
      'PROPOSED', ${sqlQuote(createdBy)}
    )
    returning id;
  `;
  return runPsql(sql);
}

// ─── llama-server.exe: discover loaded model, streaming chat completion ──────

let cachedLlamaModel = null;

async function getLlamaServerModel() {
  if (cachedLlamaModel) return cachedLlamaModel;
  const response = await fetch(`${LLAMA_SERVER_URL}/v1/models`);
  if (!response.ok) throw new Error(`llama-server /v1/models failed: ${response.status}`);
  const data = await response.json();
  const modelId = data.data?.[0]?.id;
  if (!modelId) throw new Error('llama-server /v1/models returned no loaded model');
  cachedLlamaModel = modelId;
  log(`llama-server model: ${modelId}`);
  return modelId;
}

async function callLlamaServer(prompt) {
  const model = await getLlamaServerModel();
  const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 900,
      temperature: 0.2,
      cache_prompt: true,
      stream: true,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`llama-server chat completion failed: ${response.status}`);
  }

  let assembled = '';
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of response.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') break;
      try {
        const parsed = JSON.parse(payload);
        assembled += parsed.choices?.[0]?.delta?.content ?? '';
      } catch { /* skip malformed SSE line */ }
    }
  }
  return assembled.trim();
}

// ─── Report discovery + digest ────────────────────────────────────────────────

async function discoverReportFiles() {
  const cutoffMs = Date.now() - SINCE_HOURS * 60 * 60 * 1000;
  const found = [];
  for (const dir of REPORT_DIRS) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const filePath = path.join(dir, entry.name);
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoffMs) continue;
      found.push({ filePath, mtimeMs: stat.mtimeMs });
    }
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found.slice(0, LIMIT);
}

async function digestReport(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { relPath: path.relative(REPO_ROOT, filePath), digest: raw.slice(0, 1200) };
  }
  const digest = JSON.stringify(parsed, null, 2).slice(0, 1800);
  return { relPath: path.relative(REPO_ROOT, filePath).replace(/\\/g, '/'), digest };
}

// ─── LLM draft generation ──────────────────────────────────────────────────────

function buildPrompt(relPath, digest) {
  return `You are drafting an UNREVIEWED change recommendation from a codebase report. Output STRICT JSON only, no markdown fences, no commentary, matching exactly this shape:

{
  "topic_slug": "two-word-kebab-slug",
  "proposed_action": "one sentence, what to change",
  "inference_explanation": "why the report supports this, 2-3 sentences",
  "validation_criteria": "how to verify this worked, concrete and checkable",
  "expected_impact": "predicted outcome, 1-2 sentences",
  "rollback_plan": "how to undo this if validation fails",
  "rollback_verification": "how to prove the rollback succeeded",
  "confidence": 0.0
}

If the report shows a clean/healthy/no-action-needed state, still fill every field but set "proposed_action" to "No action recommended" and "confidence" to a low value (e.g. 0.2).

REPORT FILE: ${relPath}
REPORT CONTENT:
${digest}

JSON:`;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function slugify(text) {
  return String(text || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 2)
    .join('-') || 'untitled';
}

// ─── Draft file writer ──────────────────────────────────────────────────────────

async function writeDraftFile(dateStr, topicSlug, relPath, rec) {
  await fs.mkdir(DRAFTS_DIR, { recursive: true });
  let filename = `${dateStr}_${topicSlug}.md`;
  let filePath = path.join(DRAFTS_DIR, filename);
  let suffix = 2;
  while (await fs.access(filePath).then(() => true).catch(() => false)) {
    filename = `${dateStr}_${topicSlug}-${suffix}.md`;
    filePath = path.join(DRAFTS_DIR, filename);
    suffix += 1;
  }

  const body = `# ${topicSlug.replace(/-/g, ' ')} (draft, unreviewed)

**Source report**: \`${relPath}\`
**Generated**: ${new Date().toISOString()}
**Status**: DRAFT — not promoted to openspec/changes/. Requires human review via phase109a_promote_recommendation.

## Proposed Action

${rec.proposed_action}

## Why (Inference Explanation)

${rec.inference_explanation}

## Validation Criteria

${rec.validation_criteria}

## Expected Impact

${rec.expected_impact}

## Rollback Plan

${rec.rollback_plan}

## Rollback Verification

${rec.rollback_verification}

## Confidence

${rec.confidence}
`;

  await fs.writeFile(filePath, body, 'utf-8');
  return filePath;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function probeLlamaServer() {
  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/models`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data.data?.[0]?.id);
  } catch {
    return false;
  }
}

async function main() {
  log(`mode=${DRY_RUN ? 'DRY_RUN' : 'APPLY'} limit=${LIMIT} since-hours=${SINCE_HOURS}`);

  // Fail-soft: this step is a nice-to-have on top of the daily chain, not a
  // hard gate. If llama-server isn't warm, skip silently (exit 0) rather than
  // aborting whatever wrapper invoked this — matches the existing
  // "probes TurboQuant :8090 ... exits silently if GPU not warm" pattern
  // used elsewhere in this repo's startup lane.
  if (!(await probeLlamaServer())) {
    log(`llama-server not reachable at ${LLAMA_SERVER_URL}, skipping (fail-soft).`);
    return;
  }

  const workspaceId = process.env.ATLAS_WORKSPACE_ID || `snapshot-phase12-${new Date().toISOString().split('T')[0]}`;
  let revisionId = 'unknown';
  try {
    revisionId = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
  } catch { /* leave as unknown */ }

  const files = await discoverReportFiles();
  if (files.length === 0) {
    log(`No report files modified in the last ${SINCE_HOURS}h under docs/reports/. Nothing to draft.`);
    return;
  }
  log(`Found ${files.length} candidate report(s).`);

  const results = [];
  const dateStr = new Date().toISOString().split('T')[0];

  for (const { filePath } of files) {
    const { relPath, digest } = await digestReport(filePath);
    log(`→ ${relPath}`);

    let rec;
    try {
      const raw = await callLlamaServer(buildPrompt(relPath, digest));
      rec = extractJson(raw);
      if (!rec || !rec.proposed_action) {
        log(`  ⚠️ llama-server returned no usable JSON for ${relPath}, skipping.`);
        results.push({ relPath, ok: false, reason: 'no-json' });
        continue;
      }
    } catch (e) {
      log(`  ⚠️ llama-server call failed for ${relPath}: ${e.message}`);
      results.push({ relPath, ok: false, reason: e.message });
      continue;
    }

    const topicSlug = slugify(rec.topic_slug);

    if (DRY_RUN) {
      log(`  [DRY-RUN] would write openspec/drafts/${dateStr}_${topicSlug}.md`);
      log(`  [DRY-RUN] would insert recommendation_log row (subject=${relPath})`);
      if (VERBOSE) console.log(JSON.stringify(rec, null, 2));
      results.push({ relPath, ok: true, dryRun: true, topicSlug, proposedAction: rec.proposed_action });
      continue;
    }

    const draftPath = await writeDraftFile(dateStr, topicSlug, relPath, rec);
    log(`  ✓ draft written: ${path.relative(REPO_ROOT, draftPath)}`);

    let recommendationId = null;
    try {
      recommendationId = await insertRecommendation({
        workspaceId,
        revisionId,
        subjectId: `graphify-report:${relPath}`,
        proposedAction: rec.proposed_action,
        inferenceExplanation: rec.inference_explanation,
        evidenceIds: [`file:${relPath}`, `file:${path.relative(REPO_ROOT, draftPath).replace(/\\/g, '/')}`],
        evidenceConfidence: Number.isFinite(Number(rec.confidence)) ? Number(rec.confidence) : 0.5,
        validationCriteria: rec.validation_criteria,
        expectedImpact: rec.expected_impact,
        rollbackPlan: rec.rollback_plan,
        rollbackVerification: rec.rollback_verification,
        createdBy: 'graphify-report-to-openspec-draft',
      });
      log(`  ✓ recommendation_log row: ${recommendationId}`);
    } catch (e) {
      log(`  ⚠️ recommendation_log insert failed: ${e.message}`);
    }

    results.push({ relPath, ok: true, topicSlug, draftPath, recommendationId, proposedAction: rec.proposed_action });
  }

  console.log('\n─── Summary ───');
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.relPath}${r.proposedAction ? ` → ${r.proposedAction}` : ` (${r.reason})`}`);
  }
}

main().catch((err) => {
  console.error(`[graphify-report-to-openspec-draft] FATAL: ${err.message}`);
  process.exit(1);
});

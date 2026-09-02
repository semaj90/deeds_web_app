#!/usr/bin/env node

/**
 * Bounded, offline-first agentic error-fixing coordinator.
 *
 * It converts diagnostics into a deterministic repair plan. It never edits
 * source files, resolves database rows, restarts services, or writes to a
 * canonical store. A focused TypeScript validation may be requested with
 * --validate; that validation is still read-only.
 *
 * Usage:
 *   node scripts/atlas/run-agentic-error-fixing-v1.mjs --text "TS2307 ..."
 *   node scripts/atlas/run-agentic-error-fixing-v1.mjs --file report.txt
 *   node scripts/atlas/run-agentic-error-fixing-v1.mjs --file report.txt --validate
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const inputFile = getArg('--file');
const inlineText = getArg('--text');
const validate = args.includes('--validate');
const reportPath = path.resolve(ROOT, getArg('--report') ?? 'docs/reports/agentic-error-fixing-v1.json');

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function readDiagnostics() {
  if (inlineText) return inlineText;
  if (inputFile) return readFileSync(path.resolve(ROOT, inputFile), 'utf8');
  if (!process.stdin.isTTY) return readFileSync(0, 'utf8');
  return '';
}

function classify(line) {
  if (/lineage|namespace|source revision|canonical chunk/i.test(line)) return 'LINEAGE_ADMISSION';
  if (/TS\d{4}|svelte-check|typecheck|cannot find module|does not exist/i.test(line)) return 'TYPECHECK_OR_SCHEMA';
  if (/timeout|ETIMEDOUT|abort/i.test(line)) return 'TIMEOUT';
  if (/qdrant|vector|empty result|no rows/i.test(line)) return 'RETRIEVAL_OR_PROJECTION';
  if (/permission|unauthori[sz]ed|forbidden/i.test(line)) return 'AUTHORIZATION';
  if (/relation|column|migration|postgres|database/i.test(line)) return 'DATABASE_SCHEMA';
  if (/graph|neo4j|cugraph|cuda|gpu/i.test(line)) return 'GRAPH_OR_GPU';
  return 'UNKNOWN';
}

function extractCode(line) {
  return line.match(/\bTS\d{4}\b/i)?.[0]?.toUpperCase() ?? null;
}

function extractFile(line) {
  const normalized = line.replace(/\\/g, '/');
  return normalized.match(/(?:src|scripts|packages|python|services)\/[A-Za-z0-9_./-]+\.(?:svelte|ts|tsx|js|mjs|mts|py|go)/)?.[0] ?? null;
}

function ownerFor(kind, file) {
  if (kind === 'LINEAGE_ADMISSION') return 'Packet/source lineage authority';
  if (file?.includes('/db/') || kind === 'DATABASE_SCHEMA') return 'Postgres/Drizzle read-side owner';
  if (file?.includes('/retrieval/') || kind === 'RETRIEVAL_OR_PROJECTION') return 'SearchRuntime/retrieval owner';
  if (file?.includes('/graph/') || kind === 'GRAPH_OR_GPU') return 'Graph projection/executor owner';
  if (file?.includes('/server/')) return 'SvelteKit server owner';
  if (kind === 'TYPECHECK_OR_SCHEMA') return 'Owning TypeScript contract/module';
  return 'Operator review';
}

function actionFor(kind) {
  const actions = {
    LINEAGE_ADMISSION: 'Trace the authoritative workspace namespace and source revision; keep promotion blocked until both are proven.',
    TYPECHECK_OR_SCHEMA: 'Inspect the smallest owning contract and run a scoped typecheck.',
    DATABASE_SCHEMA: 'Read the live schema and migration ledger; do not apply a migration from this plan.',
    RETRIEVAL_OR_PROJECTION: 'Verify revision, identity, collection/vector binding, and strict failure behavior.',
    GRAPH_OR_GPU: 'Verify projection identity and CPU/GPU parity on the existing frozen fixture.',
    TIMEOUT: 'Reduce the bounded input or isolate the dependency timeout before changing limits.',
    AUTHORIZATION: 'Stop and obtain an explicit authorization decision; do not retry as a repair.',
    UNKNOWN: 'Collect a focused diagnostic and identify the owning boundary before proposing a patch.',
  };
  return actions[kind];
}

function buildPlan(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates = [];
  const seen = new Set();
  for (const line of lines) {
    if (!/(error|fail|warn|TS\d{4}|exception|timeout|does not exist|cannot find|blocked|unproven|missing|ambiguous)/i.test(line)) continue;
    const kind = classify(line);
    const file = extractFile(line);
    const fingerprint = sha256(`${kind}|${extractCode(line) ?? ''}|${file ?? ''}|${line.replace(/\s+/g, ' ').slice(0, 500)}`).slice(0, 23);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    candidates.push({
      fingerprint,
      errorCode: extractCode(line),
      kind,
      file,
      owner: ownerFor(kind, file),
      diagnostic: line.slice(0, 1000),
      proposedAction: actionFor(kind),
      status: 'PROPOSED',
      mutationAllowed: false,
    });
  }
  candidates.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  return candidates;
}

function runValidation() {
  const frontendRoot = path.resolve(ROOT, 'sveltekit-frontend');
  const checkCommand = process.platform === 'win32'
    ? path.join(frontendRoot, 'node_modules', '.bin', 'svelte-check.cmd')
    : path.join(frontendRoot, 'node_modules', '.bin', 'svelte-check');
  const result = spawnSync(checkCommand, ['--tsconfig', './tsconfig.json'], {
    cwd: frontendRoot,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    command: 'svelte-check --tsconfig ./tsconfig.json (cwd: sveltekit-frontend)',
    exitCode: result.status ?? 1,
    timedOut: result.error?.code === 'ETIMEDOUT',
    launchError: result.error?.message ?? null,
    outputChecksum: sha256(`${result.stdout ?? ''}\n${result.stderr ?? ''}`),
    outputExcerpt: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().slice(-4000),
  };
}

const diagnostics = readDiagnostics();
const candidates = buildPlan(diagnostics);
const validation = validate ? runValidation() : null;
const deterministicBody = {
  schema: 'atlas.agentic-error-fixing.v1',
  inputChecksum: sha256(diagnostics),
  candidates: candidates.map(({ fingerprint, errorCode, kind, file, owner, proposedAction, status, mutationAllowed }) => ({ fingerprint, errorCode, kind, file, owner, proposedAction, status, mutationAllowed })),
  validation: validation ? { command: validation.command, exitCode: validation.exitCode, timedOut: validation.timedOut, outputChecksum: validation.outputChecksum } : null,
};

const report = {
  ...deterministicBody,
  generatedAt: new Date().toISOString(),
  status: validation && validation.exitCode !== 0 ? 'VALIDATION_FAILED' : (diagnostics ? 'PLAN_READY' : 'NO_DIAGNOSTICS'),
  mode: 'READ_ONLY_PROPOSAL',
  mutationAllowed: false,
  writesPerformed: false,
  canonicalAuthority: false,
  validationDetails: validation ? { launchError: validation.launchError, outputExcerpt: validation.outputExcerpt } : null,
  deterministicPlanChecksum: sha256(JSON.stringify(deterministicBody)),
  candidateCount: candidates.length,
  nextGate: candidates.length ? 'OPERATOR_REVIEW_THEN_SCOPED_VALIDATION' : 'SUPPLY_DIAGNOSTICS',
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, candidateCount: report.candidateCount, deterministicPlanChecksum: report.deterministicPlanChecksum, validation: validation ? { exitCode: validation.exitCode, timedOut: validation.timedOut } : null, writesPerformed: false }, null, 2));

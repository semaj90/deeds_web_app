#!/usr/bin/env node
/**
 * OPENCODE-CONTEXT-ADMISSION-01 item 3 (part 2/2) -- deterministic A/B proof
 * of the ambient-context token reduction from this gate's item 1/2 work
 * (read-only w.r.t. canonical stores; reads the git object database, writes
 * only a report file).
 *
 * Scope and honesty note: this proves ADMITTED TOKENS ONLY -- the byte/line
 * count of the AGENTS.md files OpenCode's directory walk-up would inject as
 * ambient context for a session whose CWD is `sveltekit-frontend/` (this
 * repo's most common working directory), compared before vs after this
 * session's edits. It does NOT measure actual session reads, compactions,
 * or "crystallized synthesis" -- those require a live OpenCode session
 * harness this script does not have, and are NOT claimed as proven here.
 *
 * "Before" state is read directly from `git show HEAD:<path>` (the last
 * commit, i.e. the state before this session's uncommitted edits) -- not
 * simulated or reconstructed from memory. "After" state is the current
 * working tree. Token estimate uses the same conservative heuristic
 * throughout (bytes / 4, documented, not presented as an exact tokenizer
 * count) so the BEFORE/AFTER comparison is apples-to-apples even though the
 * absolute number is approximate.
 *
 * Usage: node scripts/atlas/prove-opencode-context-admission-token-reduction-v1.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_PATH = path.join(ROOT, 'docs', 'reports', 'opencode-context-admission-token-reduction-v1.json');

// The walk-up chain OpenCode would inject for a session with CWD = sveltekit-frontend/:
// every AGENTS.md from that directory up to (and including) the git worktree root. This is the
// most common working directory across this repo's own tooling (every `cd sveltekit-frontend &&
// npm run ...` command in this repo's own docs), so it's the realistic worst-case chain that
// actually changed this session -- not a cherry-picked best case.
const WALK_UP_RELATIVE_PATHS = ['sveltekit-frontend/AGENTS.md', 'AGENTS.md'];

const BYTES_PER_TOKEN_ESTIMATE = 4; // conservative, documented heuristic -- not an exact tokenizer

function gitShowAtHead(relPath) {
  try {
    const out = execFileSync('git', ['show', `HEAD:${relPath}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 });
    return { exists: true, content: out };
  } catch (error) {
    return { exists: false, content: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function readWorkingTree(relPath) {
  const absPath = path.join(ROOT, relPath);
  if (!fs.existsSync(absPath)) return { exists: false, content: null };
  return { exists: true, content: fs.readFileSync(absPath, 'utf8') };
}

function measure(content) {
  if (content === null) return { bytes: 0, lines: 0, estimatedTokens: 0 };
  const bytes = Buffer.byteLength(content, 'utf8');
  return { bytes, lines: content.split(/\r?\n/).length, estimatedTokens: Math.ceil(bytes / BYTES_PER_TOKEN_ESTIMATE) };
}

const perFile = WALK_UP_RELATIVE_PATHS.map((relPath) => {
  const before = gitShowAtHead(relPath);
  const after = readWorkingTree(relPath);
  const beforeMeasure = measure(before.content);
  const afterMeasure = measure(after.content);
  return {
    path: relPath,
    before: { existedAtHead: before.exists, ...beforeMeasure },
    after: { existsInWorkingTree: after.exists, ...afterMeasure },
    byteReduction: beforeMeasure.bytes - afterMeasure.bytes,
    estimatedTokenReduction: beforeMeasure.estimatedTokens - afterMeasure.estimatedTokens,
  };
});

const totals = perFile.reduce(
  (acc, f) => ({
    beforeBytes: acc.beforeBytes + f.before.bytes,
    afterBytes: acc.afterBytes + f.after.bytes,
    beforeTokens: acc.beforeTokens + f.before.estimatedTokens,
    afterTokens: acc.afterTokens + f.after.estimatedTokens,
  }),
  { beforeBytes: 0, afterBytes: 0, beforeTokens: 0, afterTokens: 0 },
);

const byteReductionPct = totals.beforeBytes > 0 ? Number((((totals.beforeBytes - totals.afterBytes) / totals.beforeBytes) * 100).toFixed(2)) : 0;
const tokenReductionPct = totals.beforeTokens > 0 ? Number((((totals.beforeTokens - totals.afterTokens) / totals.beforeTokens) * 100).toFixed(2)) : 0;

let gitHeadSha = null;
try {
  gitHeadSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch { /* leave null if git is unavailable */ }

const report = {
  schema: 'atlas.opencode-context-admission-token-reduction.v1',
  gate: 'OPENCODE-CONTEXT-ADMISSION-01',
  task: 'item-3-token-admission-ab-proof',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  writesPerformed: false,
  gitHeadSha,
  scope: 'ADMITTED_TOKENS_ONLY',
  scopeNote: 'Proves byte/estimated-token admission for the sveltekit-frontend/ walk-up chain '
    + 'only. Does NOT measure live-session reads, compactions, or crystallized-synthesis quality '
    + '-- those require a live OpenCode session harness not available to this script and are not '
    + 'claimed as proven.',
  tokenEstimateMethod: `ceil(bytes / ${BYTES_PER_TOKEN_ESTIMATE})`,
  walkUpChain: WALK_UP_RELATIVE_PATHS,
  perFile,
  totals: {
    ...totals,
    byteReduction: totals.beforeBytes - totals.afterBytes,
    byteReductionPct,
    estimatedTokenReduction: totals.beforeTokens - totals.afterTokens,
    estimatedTokenReductionPct: tokenReductionPct,
  },
  status: totals.afterBytes < totals.beforeBytes ? 'TOKEN_ADMISSION_REDUCTION_PROVEN' : 'NO_REDUCTION_DETECTED',
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  beforeBytes: totals.beforeBytes,
  afterBytes: totals.afterBytes,
  byteReductionPct: report.totals.byteReductionPct,
  beforeEstimatedTokens: totals.beforeTokens,
  afterEstimatedTokens: totals.afterTokens,
  estimatedTokenReductionPct: report.totals.estimatedTokenReductionPct,
  out: OUT_PATH,
}, null, 2));
process.exitCode = report.status === 'TOKEN_ADMISSION_REDUCTION_PROVEN' ? 0 : 1;

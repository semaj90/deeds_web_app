#!/usr/bin/env tsx
/**
 * ff1-propose.ts  —  FF1 Proposal Engine CLI
 *
 * Usage:
 *   npx tsx src/lib/server/ff1/cli/ff1-propose.ts
 *   npx tsx src/lib/server/ff1/cli/ff1-propose.ts --top 3
 *   npx tsx src/lib/server/ff1/cli/ff1-propose.ts --risk low
 *   npx tsx src/lib/server/ff1/cli/ff1-propose.ts --no-qdrant
 *   npx tsx src/lib/server/ff1/cli/ff1-propose.ts --from logs/ff1-diagnostics.json
 *
 * OOM-safe contract:
 *   - proposal_fixes is READ-ONLY — it never edits files
 *   - FF1_PROPOSAL_CONCURRENCY=1 (sequential, not parallel)
 *   - FF1_MAX_FILES_PER_PROPOSAL=6  (context cap)
 *   - FF1_MAX_CONTEXT_CHARS=50000   (prompt cap)
 *   - FF1_MAX_OUTPUT_TOKENS=1500    (response cap)
 *   - Cached in Redis under ff1:llm:propose:{diagId}
 *
 * Execution order:
 *   1. Load diagnostics (from cache or logs/ff1-diagnostics.json)
 *   2. Rank by riskScore (desc)
 *   3. Skip cached proposals
 *   4. For each top-N: call Gemma4 → get ProposalFix
 *   5. Save to Redis + logs/ff1-proposals.json
 *   6. Print readable summary
 *   7. STOP — do not apply any patch
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path          from 'path';
import { planRepair } from '../agent/gemma4-repair-planner.js';
import type { DiagnosticEntry } from '../graph/graph-schema.js';
import {
  getCachedDiagnostics,
  getCachedProposal,
  setCachedProposal,
  type ProposalFix,
} from '../storage/redis-cache.js';
import { createHash } from 'crypto';

const ROOT     = path.resolve(process.cwd());
const LOGS_DIR = path.join(ROOT, 'logs');
const ENV = {
  maxProposals:    parseInt(process.env.FF1_MAX_PROPOSALS    ?? '3',   10),
  concurrency:     parseInt(process.env.FF1_PROPOSAL_CONCURRENCY ?? '1', 10),
  maxContext:      parseInt(process.env.FF1_MAX_CONTEXT_CHARS ?? '50000', 10),
  maxOutputTokens: parseInt(process.env.FF1_MAX_OUTPUT_TOKENS ?? '1500', 10),
};

// ── Args ──────────────────────────────────────────────────────────────────

const argv      = process.argv.slice(2);
const topN      = parseInt(argv[argv.indexOf('--top') + 1]  ?? String(ENV.maxProposals), 10) || ENV.maxProposals;
const riskFilter = argv[argv.indexOf('--risk') + 1] as 'low' | 'medium' | 'high' | undefined;
const noQdrant  = argv.includes('--no-qdrant');
const fromFile  = argv.indexOf('--from') >= 0 ? argv[argv.indexOf('--from') + 1] : null;
const asJson    = argv.includes('--json');

// ── Load diagnostics ──────────────────────────────────────────────────────

async function loadDiagnostics(): Promise<DiagnosticEntry[]> {
  // 1. Explicit file
  if (fromFile) {
    const src = existsSync(fromFile) ? fromFile : path.join(ROOT, fromFile);
    if (!existsSync(src)) throw new Error(`Diagnostics file not found: ${fromFile}`);
    const data = JSON.parse(readFileSync(src, 'utf8')) as { diagnostics?: DiagnosticEntry[] };
    return data.diagnostics ?? (data as DiagnosticEntry[]);
  }

  // 2. Redis cache (last commit)
  try {
    const { execSync } = await import('child_process');
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
    const cached = await getCachedDiagnostics(sha);
    if (cached?.length) {
      if (!asJson) console.log(`[ff1:propose] loaded ${cached.length} diagnostics from Redis (commit ${sha})`);
      return cached;
    }
  } catch { /* git not available or Redis miss */ }

  // 3. Fall back to logs/ff1-diagnostics.json
  const logFile = path.join(LOGS_DIR, 'ff1-diagnostics.json');
  if (existsSync(logFile)) {
    const data = JSON.parse(readFileSync(logFile, 'utf8')) as { diagnostics?: DiagnosticEntry[] };
    const diags = data.diagnostics ?? [];
    if (!asJson) console.log(`[ff1:propose] loaded ${diags.length} diagnostics from ${logFile}`);
    return diags;
  }

  throw new Error('No diagnostics found. Run: npm run ff1:audit first.');
}

// ── RepairPlan → ProposalFix ───────────────────────────────────────────────

function planToProposal(plan: Awaited<ReturnType<typeof planRepair>>, d: DiagnosticEntry): ProposalFix {
  const id = createHash('sha1').update(`proposal:${d.id}`).digest('hex').slice(0, 16);
  return {
    id,
    issueId:   d.id,
    title:     `Fix: ${d.message.slice(0, 80)}`,
    rootCause: plan.rootCause,
    confidence: plan.confidence,
    risk:      plan.risk,
    affectedFiles: plan.files.map(f => ({
      path:          f.path,
      reason:        f.reason,
      plannedChange: f.edits.map(e => e.after ?? e.type).join('\n').slice(0, 400),
    })),
    validationCommands: plan.validation,
    rollbackPlan:       plan.rollbackNotes,
    notes:              [],
    model:              plan.model,
    needsHumanApproval: plan.risk === 'high' || plan.confidence < 0.5,
    createdAt:          plan.createdAt ?? new Date().toISOString(),
  };
}

// ── Print ─────────────────────────────────────────────────────────────────

function printProposal(p: ProposalFix, i: number): void {
  const riskColor = p.risk === 'high' ? '⛔' : p.risk === 'medium' ? '⚠️ ' : '✅';
  const human = p.needsHumanApproval ? ' 👤 NEEDS REVIEW' : '';
  console.log(`\n  [${i + 1}] ${riskColor} ${p.risk.toUpperCase()} confidence=${(p.confidence * 100).toFixed(0)}%${human}`);
  console.log(`      ${p.title}`);
  console.log(`      Root cause: ${p.rootCause.slice(0, 120)}`);
  for (const f of p.affectedFiles.slice(0, 3)) {
    console.log(`      📄 ${f.path}`);
    console.log(`         ${f.reason.slice(0, 80)}`);
  }
  console.log(`      Validate: ${p.validationCommands.slice(0, 2).join('  ')}`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!asJson) {
    console.log(`\n[ff1:propose] topN=${topN} risk=${riskFilter ?? 'any'} concurrency=${ENV.concurrency}`);
    console.log('[ff1:propose] ⚠  READ-ONLY — no files will be modified\n');
  }

  const allDiags = await loadDiagnostics();

  // Filter to errors only (too many warnings = OOM risk with Gemma4)
  let diags = allDiags.filter(d => d.severity === 'error');
  if (riskFilter) {
    // Map risk filter to score thresholds
    const thresholds: Record<string, number> = { low: 0, medium: 8, high: 20 };
    const min = thresholds[riskFilter] ?? 0;
    diags = diags.filter(d => d.riskScore >= min);
  }

  // Sort by riskScore desc
  diags.sort((a, b) => b.riskScore - a.riskScore);

  if (!asJson) console.log(`[ff1:propose] ${diags.length} error diagnostics, proposing fixes for top ${topN}`);

  const proposals: ProposalFix[] = [];
  let skippedCached = 0;

  for (const d of diags.slice(0, topN)) {
    // Check Redis cache first
    const cached = await getCachedProposal(d.id);
    if (cached) {
      proposals.push(cached);
      skippedCached++;
      if (!asJson) console.log(`[ff1:propose] ↩  cached  ${d.filePath}:${d.line ?? '?'}`);
      continue;
    }

    if (!asJson) process.stdout.write(`[ff1:propose] 🤔  asking Gemma4 for  ${d.filePath}:${d.line ?? '?'} …`);

    try {
      const plan     = await planRepair(d, { skipQdrant: noQdrant });
      const proposal = planToProposal(plan, d);
      await setCachedProposal(proposal);
      proposals.push(proposal);
      if (!asJson) console.log(` ${proposal.risk} confidence=${(proposal.confidence * 100).toFixed(0)}%`);
    } catch (err) {
      if (!asJson) console.log(` FAILED: ${(err as Error).message}`);
    }
  }

  // Write output
  mkdirSync(LOGS_DIR, { recursive: true });
  const outPath = path.join(LOGS_DIR, 'ff1-proposals.json');
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), proposals }, null, 2));

  if (asJson) {
    process.stdout.write(JSON.stringify(proposals, null, 2));
    return;
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log('  FF1 Proposals');
  console.log('════════════════════════════════════════════════════');
  console.log(`  Generated: ${proposals.length}  (${skippedCached} from cache)`);
  console.log(`  Auto-approvable (low risk + confidence ≥50%): ${proposals.filter(p => p.risk === 'low' && p.confidence >= 0.5 && !p.needsHumanApproval).length}`);
  console.log(`  Needs review: ${proposals.filter(p => p.needsHumanApproval).length}`);
  proposals.forEach((p, i) => printProposal(p, i));
  console.log(`\n  logs/ff1-proposals.json written`);
  console.log('  Next step: npm run ff1:validate (or review manually)');
  console.log('════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('[ff1:propose] fatal:', err);
  process.exit(2);
});

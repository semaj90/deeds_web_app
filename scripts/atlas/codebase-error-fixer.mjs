#!/usr/bin/env node
/**
 * codebase-error-fixer.mjs
 *
 * Stage 3 of the unified codebase pipeline.
 * Reads TypeScript errors (from tsc output or .tmp/tsc-errors.jsonl)
 * and maps them to feature areas via the codebase feature map.
 * Uses Gemma4 LLM to suggest targeted fixes for each error cluster.
 *
 * Error sources (in priority order):
 *   1. .tmp/tsc-errors.jsonl    — pre-parsed TS errors
 *   2. tsc --noEmit output      — live compilation (slow)
 *   3. docs/reports/*contract*  — contract audit findings
 *
 * Usage:
 *   node scripts/atlas/codebase-error-fixer.mjs
 *   node scripts/atlas/codebase-error-fixer.mjs --dry-run
 *   node scripts/atlas/codebase-error-fixer.mjs --no-llm
 *   node scripts/atlas/codebase-error-fixer.mjs --source tsc      # run tsc live
 *   node scripts/atlas/codebase-error-fixer.mjs --source audit    # read contract audits
 *   node scripts/atlas/codebase-error-fixer.mjs --limit 30
 *
 * Outputs:
 *   .tmp/error-fix-proposals.jsonl   — one fix proposal per line
 *   .tmp/error-fix-report.md         — human-readable fix guide
 *   docs/graph/error-fix-proposals.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig, resolveRepoPath, readJson, readText, writeJson, writeMarkdown, REPO_ROOT } from './_atlas-utils.mjs';
import { llamaChat } from './lib/llama-inference.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const argv  = process.argv.slice(2);

const DRY_RUN  = argv.includes('--dry-run');
const NO_LLM   = argv.includes('--no-llm');
const VERBOSE  = argv.includes('--verbose');
const LIMIT_I  = argv.indexOf('--limit');
const LIMIT    = LIMIT_I >= 0 ? Number(argv[LIMIT_I + 1]) : null;
const SOURCE_I = argv.indexOf('--source');
const SOURCE   = SOURCE_I >= 0 ? argv[SOURCE_I + 1] : 'auto';

// ── LLM ───────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 60_000;

async function callGemma4Fix(errorCluster, featureContext) {
  const prompt = `You are an expert TypeScript/SvelteKit developer.
Analyze these errors and provide a concrete fix.

Feature area: ${featureContext.featureKey}
Top file: ${featureContext.topFile}
DB tables: ${featureContext.dbTables?.join(', ') || 'none'}

Errors (${errorCluster.length} total):
${errorCluster.slice(0, 5).map(e => `  [${e.code}] ${e.file}:${e.line} — ${e.message}`).join('\n')}

Provide:
1. Root cause (1 sentence)
2. Fix pattern (2-3 lines of code or configuration change)
3. Files to check (comma-separated)
Keep response under 200 words. Be specific and actionable.`;

  try {
    return await llamaChat(prompt, { maxTokens: 512, temperature: 0.1, timeoutMs: TIMEOUT_MS });
  } catch {
    return null;
  }
}

// ── Error parsers ──────────────────────────────────────────────────────────────

/** Parse tsc --noEmit output into structured errors */
function parseTscOutput(rawOutput) {
  const errors = [];
  // Pattern: path/to/file.ts(line,col): error TSxxxx: message
  const re = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;
  let m;
  while ((m = re.exec(rawOutput))) {
    errors.push({
      file: m[1].replace(/\\/g, '/'),
      line: parseInt(m[2], 10),
      col:  parseInt(m[3], 10),
      code: m[4],
      message: m[5].trim(),
      source: 'tsc',
    });
  }
  return errors;
}

/** Parse contract audit report JSON into structured errors */
function parseContractReport(reportPath) {
  if (!fs.existsSync(reportPath)) return [];
  const data = readJson(reportPath) ?? {};
  const errors = [];
  const findings = data.findings ?? data.errors ?? data.results ?? [];
  for (const f of findings) {
    errors.push({
      file: f.file ?? f.filePath ?? 'unknown',
      line: f.line ?? 1,
      col: 1,
      code: f.errorType ?? f.type ?? 'CONTRACT',
      message: f.message ?? f.description ?? JSON.stringify(f).slice(0, 120),
      source: 'contract-audit',
      severity: f.severity ?? 'warn',
    });
  }
  return errors;
}

/** Load pre-parsed errors from JSONL file */
function loadErrorJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .trim().split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// ── Collect errors from configured sources ────────────────────────────────────

async function collectErrors() {
  const allErrors = [];

  // Source 1: pre-parsed JSONL
  const tscJsonl = resolveRepoPath('.tmp/tsc-errors.jsonl');
  if ((SOURCE === 'auto' || SOURCE === 'jsonl') && fs.existsSync(tscJsonl)) {
    const errs = loadErrorJsonl(tscJsonl);
    console.log(`[error-fixer] Loaded ${errs.length} errors from .tmp/tsc-errors.jsonl`);
    allErrors.push(...errs);
  }

  // Source 2: live tsc run
  if (SOURCE === 'tsc' || (SOURCE === 'auto' && allErrors.length === 0)) {
    console.log('[error-fixer] Running tsc --noEmit (may take 30-120s)...');
    const tscResult = spawnSync('npx', ['tsgo', '--noEmit', '--pretty', 'false'], {
      cwd: resolveRepoPath('sveltekit-frontend'),
      encoding: 'utf8',
      timeout: 120_000,
    });
    const output = (tscResult.stdout ?? '') + (tscResult.stderr ?? '');
    const errs = parseTscOutput(output);
    console.log(`[error-fixer] tsc produced ${errs.length} errors`);
    allErrors.push(...errs);

    // Cache for next run
    if (!DRY_RUN && errs.length > 0) {
      fs.mkdirSync(resolveRepoPath('.tmp'), { recursive: true });
      fs.writeFileSync(tscJsonl, errs.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    }
  }

  // Source 3: contract audit reports
  if (SOURCE === 'audit' || (SOURCE === 'auto' && allErrors.length === 0)) {
    const reportDir = resolveRepoPath('docs/reports');
    if (fs.existsSync(reportDir)) {
      for (const f of fs.readdirSync(reportDir)) {
        if (!f.endsWith('.json') || !f.includes('contract')) continue;
        const errs = parseContractReport(path.join(reportDir, f));
        if (errs.length > 0) {
          console.log(`[error-fixer] Loaded ${errs.length} errors from ${f}`);
          allErrors.push(...errs);
        }
      }
    }
  }

  return allErrors;
}

// ── Map errors to feature areas ───────────────────────────────────────────────

function mapErrorToFeature(error, featureMap) {
  const filePath = error.file?.replace(/\\/g, '/') ?? '';
  let bestKey = null;
  let bestCount = 0;

  for (const [key, fa] of Object.entries(featureMap.features ?? {})) {
    // Check if any feature files match this error file
    const matched = (fa.files ?? []).some(f => filePath.includes(f) || filePath.endsWith(f.split('/').pop() ?? ''));
    if (matched && fa.fileCount > bestCount) {
      bestCount = fa.fileCount;
      bestKey = key;
    }
  }

  if (!bestKey) {
    // Fallback: match on path segments
    const parts = filePath.split('/');
    for (const [key] of Object.entries(featureMap.features ?? {})) {
      const keyParts = key.split('.');
      if (keyParts.some(p => parts.includes(p))) {
        bestKey = key;
        break;
      }
    }
  }

  return bestKey ?? 'unknown';
}

// ── Main ──────────────────────────────────────────────────────────────────────

const FEATURE_MAP_PATH = resolveRepoPath('.tmp/codebase-feature-map.json');
const featureMapData = readJson(FEATURE_MAP_PATH) ?? { features: {} };
if (!fs.existsSync(FEATURE_MAP_PATH)) {
  console.warn(`[error-fixer] Feature map missing — run build-codebase-feature-map.mjs first`);
}

const rawErrors = await collectErrors();
const errors = LIMIT ? rawErrors.slice(0, LIMIT) : rawErrors;
console.log(`[error-fixer] Processing ${errors.length} errors (dry=${DRY_RUN} llm=${!NO_LLM})`);

// Group errors by feature area
const errorsByFeature = new Map();
for (const err of errors) {
  const featureKey = mapErrorToFeature(err, featureMapData);
  if (!errorsByFeature.has(featureKey)) errorsByFeature.set(featureKey, []);
  errorsByFeature.get(featureKey).push(err);
}

console.log(`[error-fixer] Errors mapped to ${errorsByFeature.size} feature areas`);

// Generate fix proposals
const proposals = [];

for (const [featureKey, errs] of [...errorsByFeature.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const fa = featureMapData.features?.[featureKey] ?? {};
  const proposalId = crypto.createHash('sha256').update(`${featureKey}:${errs[0]?.code ?? ''}:${errs[0]?.file ?? ''}`).digest('hex').slice(0, 12);

  // Group by error code
  const byCode = new Map();
  for (const e of errs) {
    if (!byCode.has(e.code)) byCode.set(e.code, []);
    byCode.get(e.code).push(e);
  }

  const topCode = [...byCode.entries()].sort((a, b) => b[1].length - a[1].length)[0];

  process.stdout.write(`\r[error-fixer] ${proposals.length + 1}/${errorsByFeature.size} ${featureKey.padEnd(40)}`);

  let gemma4Fix = null;
  if (!NO_LLM) {
    gemma4Fix = await callGemma4Fix(errs, { featureKey, topFile: fa.topScoreFile ?? '', dbTables: fa.dbTables ?? [] });
  }

  const proposal = {
    proposalId,
    featureKey,
    errorCount: errs.length,
    topErrorCode: topCode?.[0] ?? 'UNKNOWN',
    topErrorCount: topCode?.[1].length ?? 0,
    affectedFiles: [...new Set(errs.map(e => e.file))].slice(0, 10),
    errorCodes: [...byCode.keys()],
    sampleErrors: errs.slice(0, 3).map(e => ({ file: e.file, line: e.line, code: e.code, message: e.message.slice(0, 200) })),
    suggestedFix: gemma4Fix ?? buildFallbackFix(featureKey, errs),
    confidence: gemma4Fix ? 0.8 : 0.4,
    sourceRefs: errs.slice(0, 3).map(e => `local:${e.file}#L${e.line}`),
    featureStatus: fa.status ?? 'unknown',
    priority: errs.length > 10 ? 'HIGH' : errs.length > 3 ? 'MEDIUM' : 'LOW',
    generatedAt: new Date().toISOString(),
    usedLlm: !!gemma4Fix,
  };

  proposals.push(proposal);
}
console.log();

function buildFallbackFix(featureKey, errs) {
  const codes = [...new Set(errs.map(e => e.code))].join(', ');
  const files = [...new Set(errs.map(e => e.file))].slice(0, 3).join(', ');
  return `Fix ${errs.length} ${codes} errors in ${featureKey}. Check: ${files}. ` +
    `Run: cd sveltekit-frontend && npm run check:fast 2>&1 | grep "${featureKey.split('.').pop()}"`;
}

// ── Reports ───────────────────────────────────────────────────────────────────

function buildFixMarkdown(proposals) {
  const lines = [
    `# Error Fix Proposals`,
    ``,
    `Generated: ${new Date().toISOString()}  |  Proposals: ${proposals.length}  |  Total errors: ${errors.length}`,
    ``,
    `## Summary by Feature Area`,
    ``,
    `| Feature | Errors | Top Code | Priority |`,
    `|---|---|---|---|`,
  ];
  for (const p of proposals.slice(0, 30)) {
    lines.push(`| \`${p.featureKey}\` | ${p.errorCount} | \`${p.topErrorCode}\` | ${p.priority} |`);
  }
  lines.push('');
  lines.push('## Fix Proposals');
  lines.push('');
  for (const p of proposals) {
    lines.push(`### [${p.proposalId}] ${p.featureKey}`);
    lines.push(`- **Errors**: ${p.errorCount} (codes: ${p.errorCodes.join(', ')})`);
    lines.push(`- **Priority**: ${p.priority}  |  **Confidence**: ${Math.round(p.confidence * 100)}%  |  **Status**: ${p.featureStatus}`);
    lines.push(`- **Files**: ${p.affectedFiles.slice(0, 3).join(', ')}`);
    lines.push('');
    lines.push('**Suggested Fix:**');
    lines.push('```');
    lines.push(p.suggestedFix ?? 'No fix suggestion available.');
    lines.push('```');
    lines.push('');
    if (p.sampleErrors.length > 0) {
      lines.push('**Sample errors:**');
      for (const e of p.sampleErrors) {
        lines.push(`- \`${e.code}\` ${e.file}:${e.line} — ${e.message.slice(0, 120)}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

// ── Write outputs ─────────────────────────────────────────────────────────────

const OUT_JSONL   = resolveRepoPath('.tmp/error-fix-proposals.jsonl');
const OUT_MD      = resolveRepoPath('.tmp/error-fix-report.md');
const DOCS_JSON   = resolveRepoPath('docs/graph/error-fix-proposals.json');

if (DRY_RUN) {
  console.log(`\n[error-fixer] DRY RUN — would write:`);
  console.log(`  ${OUT_JSONL}  (${proposals.length} proposals)`);
  console.log(`  ${OUT_MD}`);
  console.log(`  ${DOCS_JSON}`);
  console.log('\nTop proposals:');
  for (const p of proposals.slice(0, 5)) {
    console.log(`  [${p.priority}] ${p.featureKey}: ${p.errorCount} errors (${p.topErrorCode})`);
  }
} else {
  fs.mkdirSync(path.dirname(OUT_JSONL), { recursive: true });
  fs.writeFileSync(OUT_JSONL, proposals.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
  writeMarkdown(OUT_MD, buildFixMarkdown(proposals));
  writeJson(DOCS_JSON, { generatedAt: new Date().toISOString(), totalErrors: errors.length, proposals });
  console.log(`[error-fixer] Written → ${OUT_JSONL}`);
  console.log(`[error-fixer] Written → ${OUT_MD}`);
  console.log(`[error-fixer] Written → ${DOCS_JSON}`);
}

// Print summary
const highPriority = proposals.filter(p => p.priority === 'HIGH');
console.log(`\n[error-fixer] Summary:`);
console.log(`  Total errors:     ${errors.length}`);
console.log(`  Feature areas:    ${errorsByFeature.size}`);
console.log(`  Proposals:        ${proposals.length}`);
console.log(`  HIGH priority:    ${highPriority.length}`);
console.log(`  Used Gemma4:      ${proposals.filter(p => p.usedLlm).length}/${proposals.length}`);

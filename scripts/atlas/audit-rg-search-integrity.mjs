#!/usr/bin/env node
/**
 * Ripgrep Visibility Integrity Auditor (Phase 9A)
 *
 * Ensures that all critical audits (contract, schema, migration, etc.) use 
 * unrestricted ripgrep flags (-u or --no-ignore) so they don't silently miss 
 * ignored files or diagnostic artifacts.
 *
 * Usage:
 *   node scripts/atlas/audit-rg-search-integrity.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const REPORTS_DIR = join(REPO_ROOT, 'docs/reports');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m', cyan: '\x1b[36m',
};

/**
 * Script classification based on filename patterns
 */
const AUDIT_PATTERNS = [
  { pattern: /audit-.*contracts/i,   category: 'contract_audit' },
  { pattern: /audit-.*schema/i,      category: 'schema_audit' },
  { pattern: /audit-.*migration/i,   category: 'migration_audit' },
  { pattern: /audit-.*form/i,        category: 'form_audit' },
  { pattern: /audit-.*route/i,       category: 'route_audit' },
  { pattern: /reconcile/i,           category: 'reconciliation' },
  { pattern: /validate/i,            category: 'validation' },
  { pattern: /contract-network/i,    category: 'network_contract' },
];

/**
 * Paths that require complete visibility in ripgrep searches
 */
const CRITICAL_SEARCH_PATHS = [
  'sveltekit-frontend/src',
  'sveltekit-frontend/drizzle',
  'docs/reports',
  'docs/graph',
  'drizzle',
];

/**
 * Categories that MUST use unrestricted ripgrep
 */
const MUST_BE_UNRESTRICTED = [
  'contract_audit',
  'schema_audit',
  'migration_audit',
  'form_audit',
  'route_audit',
  'reconciliation',
  'validation',
  'network_contract',
];

// ── helpers ───────────────────────────────────────────────────────────────────

function walk(dir, results = []) {
  if (!existsSync(dir)) return results;
  const files = readdirSync(dir);
  for (const f of files) {
    const path = join(dir, f);
    if (f === 'node_modules' || f === '.git' || f === '.svelte-kit') continue;
    if (statSync(path).isDirectory()) {
      walk(path, results);
    } else if (f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.ts')) {
      results.push(path);
    }
  }
  return results;
}

function classifyScript(filePath) {
  const fileName = relative(REPO_ROOT, filePath);
  for (const { pattern, category } of AUDIT_PATTERNS) {
    if (pattern.test(fileName)) return category;
  }
  return 'other';
}

function analyzeRgUsage(content, filePath) {
  const findings = [];
  // Look for rg as a command:
  // 1. Inside backticks: `rg -u ...`
  // 2. In spawnSync/execSync: spawnSync('rg', [...])
  // 3. In strings that look like commands: "rg -u"
  
  // Pattern 1: Command strings with flags
  const rgCommandRegex = /['"`]rg\s+((?:-[a-zA-Z-]+\s+)*[^'"`\n]+)['"`]/g;
  let match;
  while ((match = rgCommandRegex.exec(content)) !== null) {
    const args = match[1];
    findings.push({
      fullMatch: match[0],
      args,
      isUnrestricted: args.includes('-u') || args.includes('--no-ignore'),
      line: content.substring(0, match.index).split('\n').length,
    });
  }

  // Pattern 2: spawnSync('rg', [...])
  const spawnRegex = /(?:spawnSync|spawn|execSync|exec)\s*\(\s*['"]rg['"]\s*,\s*\[([^\]]+)\]/g;
  while ((match = spawnRegex.exec(content)) !== null) {
    const args = match[1];
    findings.push({
      fullMatch: match[0],
      args,
      isUnrestricted: args.includes('-u') || args.includes('--no-ignore') || args.includes('unrestricted'),
      line: content.substring(0, match.index).split('\n').length,
    });
  }
  return findings;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}── Ripgrep Visibility Integrity Audit (Phase 9A) ──${C.reset}\n`);

  const scripts = [
    ...walk(join(REPO_ROOT, 'scripts')),
    ...walk(join(REPO_ROOT, 'sveltekit-frontend/src/lib/server')),
  ];

  const results = [];
  let violationsCount = 0;

  for (const script of scripts) {
    const content = readFileSync(script, 'utf8');
    const category = classifyScript(script);
    const rgUsages = analyzeRgUsage(content, script);

    if (rgUsages.length === 0) continue;

    const scriptFindings = {
      file: relative(REPO_ROOT, script),
      category,
      usages: [],
    };

    for (const usage of rgUsages) {
      const isCriticalCategory = MUST_BE_UNRESTRICTED.includes(category);
      const isViolation = isCriticalCategory && !usage.isUnrestricted;

      if (isViolation) violationsCount++;

      scriptFindings.usages.push({
        ...usage,
        status: isViolation ? 'FAIL' : 'PASS',
        reason: isViolation ? `Critical category '${category}' must use -u or --no-ignore.` : 'Safe.',
      });
    }

    results.push(scriptFindings);
  }

  // ── Reporting ──────────────────────────────────────────────────────────────

  console.log(`${C.bold}Search Integrity Summary:${C.reset}`);
  for (const r of results) {
    const hasFail = r.usages.some(u => u.status === 'FAIL');
    const icon = hasFail ? `${C.red}✗${C.reset}` : `${C.green}✓${C.reset}`;
    console.log(`  ${icon}  [${r.category.padEnd(16)}] ${r.file}`);
    for (const u of r.usages) {
      if (u.status === 'FAIL') {
        console.log(`     ${C.yellow}Line ${u.line}:${C.reset} ${u.fullMatch}`);
        console.log(`     ${C.red}Violation:${C.reset} ${u.reason}`);
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    violationsCount,
    scriptsAnalyzed: scripts.length,
    findings: results,
    status: violationsCount === 0 ? 'PASS' : 'FAIL',
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, 'rg-search-integrity-report.json'), JSON.stringify(report, null, 2));

  // Generate MD report
  let md = `# Ripgrep Search Integrity Report (Phase 9A)\n\n`;
  md += `**Status:** ${report.status}\n`;
  md += `**Violations:** ${violationsCount}\n`;
  md += `**Generated:** ${report.generatedAt}\n\n`;
  md += `| Script | Category | Line | Match | Status | Reason |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const r of results) {
    for (const u of r.usages) {
      md += `| \`${r.file}\` | \`${r.category}\` | ${u.line} | \`${u.fullMatch}\` | ${u.status} | ${u.reason} |\n`;
    }
  }

  writeFileSync(join(REPORTS_DIR, 'rg-search-integrity-report.md'), md);

  console.log(`\n  Status: ${violationsCount === 0 ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`}`);
  console.log(`  Report → docs/reports/rg-search-integrity-report.md\n`);

  process.exit(violationsCount === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});

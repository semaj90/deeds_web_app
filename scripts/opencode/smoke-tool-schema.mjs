#!/usr/bin/env node
/**
 * smoke-tool-schema.mjs
 *
 * Validates that every tool in .opencode/tools/ follows the discipline rules:
 *   1. File exports at least one named tool (const x = tool({...}))
 *   2. Every z.* schema field has a .describe() call
 *   3. The tool has a non-empty description string
 *   4. The execute function is present
 *
 * Does NOT execute tools. Read-only static analysis.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..', '..');
const TOOLS_DIR = path.join(ROOT, '.opencode', 'tools');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const WARN = '\x1b[33m⚠\x1b[0m';

let totalPass = 0;
let totalFail = 0;
const issues = [];

function check(label, ok, detail) {
  if (ok) {
    totalPass++;
    console.log(`  ${PASS} ${label}`);
  } else {
    totalFail++;
    const msg = `  ${FAIL} ${label}${detail ? ': ' + detail : ''}`;
    console.log(msg);
    issues.push(msg.replace(/\x1b\[\d+m/g, ''));
  }
}

function analyzeToolFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  console.log(`\n${rel}`);

  const src = fs.readFileSync(filePath, 'utf8');

  // Rule 1: has export const ... = tool(
  const hasToolExport = /export\s+const\s+\w+\s*=\s*tool\s*\(/.test(src);
  check('exports a tool()', hasToolExport);

  // Rule 2: has non-empty description string
  const descMatch = src.match(/description\s*:\s*['"`]([\s\S]{10,}?)['"`]/);
  check('has non-empty description', !!descMatch);

  // Rule 3: has execute function
  const hasExecute = /execute\s*:\s*async/.test(src);
  check('has async execute function', hasExecute);

  // Rule 4: every z.string/number/array/enum/boolean() has .describe(
  // Find all z.TYPE() calls that are NOT followed by .describe(
  const zFieldPattern = /z\.(string|number|boolean|array|enum|object)\s*\([^)]*\)(?![\s\S]{0,80}\.describe\s*\()/g;
  const bare = [];
  let m;
  while ((m = zFieldPattern.exec(src)) !== null) {
    // grab surrounding context for reporting
    const context = src.slice(Math.max(0, m.index - 40), m.index + 60).replace(/\n/g, ' ').trim();
    bare.push(context);
  }
  // Reduce false positives: z.object() wrapping is OK without describe
  const bareFiltered = bare.filter((b) => !b.includes('z.object('));
  check(
    'all schema fields have .describe()',
    bareFiltered.length === 0,
    bareFiltered.length > 0 ? `${bareFiltered.length} field(s) missing .describe()` : undefined,
  );

  // Rule 5: parameters uses z.object (not raw object)
  const hasZodParams = /parameters\s*:\s*z\.object\s*\(/.test(src);
  check('parameters wrapped in z.object()', hasZodParams);
}

// --- Main ---

if (!fs.existsSync(TOOLS_DIR)) {
  console.error(`${FAIL} .opencode/tools/ directory not found at ${TOOLS_DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.mjs'));

if (files.length === 0) {
  console.warn(`${WARN} No tool files found in .opencode/tools/`);
  process.exit(0);
}

console.log(`\n=== OpenCode Tool Schema Smoke Test (${files.length} tools) ===`);

for (const file of files) {
  analyzeToolFile(path.join(TOOLS_DIR, file));
}

console.log(`\n--- Results: ${totalPass} pass, ${totalFail} fail ---`);

if (totalFail > 0) {
  console.log(`\nIssues:`);
  issues.forEach((i) => console.log(i));
  console.log(
    `\n${FAIL} Tool schema validation FAILED. Fix .describe() annotations before deploying tools.`,
  );
  process.exit(1);
} else {
  console.log(`\n${PASS} All tool schemas valid.`);
  process.exit(0);
}
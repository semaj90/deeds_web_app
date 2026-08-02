#!/usr/bin/env node
/**
 * scripts/atlas/validate-script-runners.mjs
 * ============================================
 * Consistency gate for atlas:* npm scripts in sveltekit-frontend/package.json.
 *
 * Node cannot execute TypeScript syntax directly (no supported loader by
 * default), and running a JavaScript file through tsx is unnecessary
 * overhead. This is not about extension choice being "safer" - .mts is
 * TypeScript-with-unambiguous-ESM, .mjs is JavaScript-with-unambiguous-ESM,
 * and each needs the matching runner:
 *
 *   .ts / .mts / .cts  -> tsx (or ts-node / a supported type-stripping mode)
 *   .js / .mjs / .cjs  -> node directly
 *
 * Mismatches surface as either a hard failure ("Cannot use import statement
 * outside a module", or TypeScript syntax fed to bare node) or silent
 * unnecessary transpilation overhead. This scans the declared command
 * strings (not the invocation), so it catches drift without executing
 * anything.
 *
 * Usage:
 *   node scripts/atlas/validate-script-runners.mjs
 *   npm run atlas:validate:script-runners   (from sveltekit-frontend/)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', 'sveltekit-frontend');
const PACKAGE_JSON = path.join(FRONTEND_ROOT, 'package.json');

const TS_EXTENSIONS = new Set(['.ts', '.mts', '.cts']);
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

// Matches `node <path>` or `tsx <path>` as a whole word, capturing the
// runner and the first following token that looks like a script path
// (handles cross-env/NODE_OPTIONS prefixes and ../ relative paths).
const RUNNER_RE = /\b(node|tsx)\s+(?:--[\w-]+(?:[= ]\S+)?\s+)*((?:\.\.\/)?[\w./-]+\.(?:m?[jt]s|cjs|cts))\b/g;

function classifyCommand(command) {
  const findings = [];
  let match;
  RUNNER_RE.lastIndex = 0;
  while ((match = RUNNER_RE.exec(command)) !== null) {
    const [, runner, scriptPath] = match;
    const ext = path.extname(scriptPath);

    if (runner === 'node' && TS_EXTENSIONS.has(ext)) {
      findings.push({
        runner,
        scriptPath,
        ext,
        reason: `TypeScript file (${ext}) invoked directly with node - Node cannot execute TypeScript syntax without a loader`,
      });
    } else if (runner === 'tsx' && JS_EXTENSIONS.has(ext)) {
      findings.push({
        runner,
        scriptPath,
        ext,
        reason: `JavaScript file (${ext}) unnecessarily invoked through tsx`,
      });
    }
  }
  return findings;
}

function main() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const scripts = pkg.scripts ?? {};

  const failures = [];
  const warnings = [];
  let atlasScriptCount = 0;

  for (const [name, command] of Object.entries(scripts)) {
    if (!name.startsWith('atlas:')) continue;
    atlasScriptCount++;

    for (const finding of classifyCommand(command)) {
      const entry = { script: name, ...finding };
      if (finding.runner === 'node') {
        failures.push(entry);
      } else {
        warnings.push(entry);
      }
    }
  }

  const result = {
    gate: 'ATLAS_SCRIPT_RUNNERS',
    scriptsChecked: atlasScriptCount,
    hardMismatches: failures.length,
    softMismatches: warnings.length,
  };

  if (failures.length > 0) {
    console.error(
      JSON.stringify({ ...result, status: 'FAIL', failures, warnings }, null, 2)
    );
    process.exitCode = 1;
    return;
  }

  if (warnings.length > 0) {
    console.log(
      JSON.stringify({ ...result, status: 'PASS_WITH_WARNINGS', warnings }, null, 2)
    );
    return;
  }

  console.log(JSON.stringify({ ...result, status: 'ATLAS_SCRIPT_RUNNERS_VALID' }, null, 2));
}

main();

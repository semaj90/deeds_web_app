#!/usr/bin/env node
/**
 * G11 fix: replace hardcoded localhost/127.0.0.1 service URLs with
 * ENV.<KEY> ?? '<original literal>' fallbacks, using only ENV keys that
 * already exist in env.server.ts (never invents new keys — low-confidence
 * ports are skipped and reported for manual review).
 *
 * Usage: node scripts/fix-g11-hardcoded-localhost.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

// port -> canonical ENV key (only ports with a confirmed existing key in env.server.ts)
const PORT_TO_ENV_KEY = {
  '6333': 'QDRANT_URL',
  '8090': 'LLAMA_SERVER_URL',
  '11434': 'OLLAMA_BASE_URL',
  '8095': 'MINIFORGE_SIDECAR_URL',
  '3040': 'BIFROST_URL',
  '8100': 'GO_RETRIEVAL_HTTP_URL',
  '8092': 'RERANKER_SIDECAR_URL',
  '8791': 'TURBOVEC_SIDECAR',
  '8788': 'TRACE_MCP_URL',
  '5173': 'SELF_URL',
};

const files = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'docs/graph/codebase-graph.json'), 'utf8')
).files.filter(
  (f) =>
    f.localhostBreaks === true &&
    !/backup|phase104-backups|routes_parked/.test(f.rel) &&
    !f.rel.startsWith('scripts/')
);

const results = { fixed: [], skippedLowConfidence: [], errors: [] };

for (const f of files) {
  const relFromRoot = f.rel.replace(/^sveltekit-frontend\//, '');
  const absPath = path.join(ROOT, relFromRoot);
  if (!fs.existsSync(absPath)) {
    results.errors.push(`${relFromRoot}: file not found`);
    continue;
  }

  let src = fs.readFileSync(absPath, 'utf8');
  const original = src;
  const unmappedPorts = new Set();
  let changed = false;

  for (const literal of f.localhostRefs) {
    const m = literal.match(/:(\d+)$/);
    const port = m?.[1];
    const envKey = port && PORT_TO_ENV_KEY[port];
    if (!envKey) {
      unmappedPorts.add(literal);
      continue;
    }
    // Only replace bare string literals, and only when NOT already preceded
    // by an ENV.* fallback on the same line (?? or ||) — those are already
    // fixed (possibly under a different ENV key or ad-hoc pattern) and must
    // be left alone. Mixing ?? and || without parens is a SyntaxError, so a
    // blind replace here would break already-correct code.
    const escapedLiteral = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match ANY existing guard before the literal — ENV.X, process.env.X, or
    // privateEnv.X — with either ?? or || as the fallback operator. A blind
    // replace on an already-guarded literal (regardless of which guard style)
    // produces `A || B ?? 'literal'`, a SyntaxError (?? cannot mix with ||
    // without explicit parens). Skip all pre-guarded occurrences.
    const alreadyGuardedPattern = new RegExp(
      `(?:ENV|process\\.env|privateEnv)\\.\\w+\\s*(\\?\\?|\\|\\|)\\s*(['"\`])${escapedLiteral}\\2`
    );
    const bareLiteralPattern = new RegExp(`(['"\`])${escapedLiteral}\\1`, 'g');

    if (alreadyGuardedPattern.test(src)) {
      continue; // already fixed under some ENV key — do not touch
    }
    if (bareLiteralPattern.test(src)) {
      src = src.replace(bareLiteralPattern, `ENV.${envKey} ?? '${literal}'`);
      changed = true;
    }
  }

  if (changed) {
    // Ensure ENV is imported. Match this repo's existing import convention.
    const hasEnvImport = /from\s+['"]\$lib\/server\/env\.server(\.js)?['"]/.test(src);
    if (!hasEnvImport) {
      // Insert after the last top-of-file import statement (simple heuristic:
      // after the first blank line following the first import block).
      const importRegex = /^import .+;\s*$/gm;
      let lastImportEnd = 0;
      let match;
      while ((match = importRegex.exec(src))) {
        lastImportEnd = match.index + match[0].length;
      }
      if (lastImportEnd > 0) {
        src =
          src.slice(0, lastImportEnd) +
          "\nimport { ENV } from '$lib/server/env.server.js';" +
          src.slice(lastImportEnd);
      } else {
        src = "import { ENV } from '$lib/server/env.server.js';\n" + src;
      }
    }
  }

  if (unmappedPorts.size > 0) {
    results.skippedLowConfidence.push({ file: relFromRoot, ports: [...unmappedPorts] });
  }

  if (changed && src !== original) {
    results.fixed.push(relFromRoot);
    if (!DRY) fs.writeFileSync(absPath, src, 'utf8');
  }
}

console.log(`\n${DRY ? '[DRY RUN] ' : ''}Fixed: ${results.fixed.length}`);
results.fixed.forEach((f) => console.log(`  ✓ ${f}`));

console.log(`\nSkipped (no canonical ENV key for port): ${results.skippedLowConfidence.length}`);
results.skippedLowConfidence.forEach((r) => console.log(`  ⚠ ${r.file} :: ${r.ports.join(', ')}`));

if (results.errors.length) {
  console.log(`\nErrors: ${results.errors.length}`);
  results.errors.forEach((e) => console.log(`  ✗ ${e}`));
}

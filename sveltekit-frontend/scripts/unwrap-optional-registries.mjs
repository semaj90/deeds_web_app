#!/usr/bin/env node
/**
 * One-shot: unwrap `if (ENABLE_OPTIONAL_REGISTRIES) { server.registerTool(...) }`
 * blocks that wrap canonical inline tools in trace-mcp-server.ts.
 *
 * The flag should only gate the 3 sub-module registries at line 114
 * (registerCodebaseTools / registerResearchTools / registerBifrostTools).
 * Every other inline registration is canonical and must register
 * unconditionally per §10 of the dev guide.
 *
 * The wrapped block looks like:
 *
 *     if (ENABLE_OPTIONAL_REGISTRIES) {
 *     server.registerTool(
 *       'name',
 *       { ... },
 *       handler
 *     );
 *     }
 *
 * Note the body is NOT indented — the wrapper just adds an opener/closer.
 * So unwrapping = delete the `if` line + delete the matching `}` line.
 *
 * The line-114 block (which wraps three `register*Tools(server)` calls, NOT
 * a `server.registerTool(`) is preserved by checking what the next line is.
 *
 * Idempotent. Run once. Pre-restart to apply, the operator confirms before
 * re-spawning the live MCP.
 *
 *   node scripts/unwrap-optional-registries.mjs --dry-run
 *   node scripts/unwrap-optional-registries.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'src', 'mcp', 'trace-mcp-server.ts');
const dryRun = process.argv.includes('--dry-run');

const src = readFileSync(FILE, 'utf8');
const lines = src.split('\n');

// Find every `if (ENABLE_OPTIONAL_REGISTRIES) {` opener line index (0-based).
const openerIdxs = [];
for (let i = 0; i < lines.length; i++) {
  if (/^if\s*\(\s*ENABLE_OPTIONAL_REGISTRIES\s*\)\s*\{\s*$/.test(lines[i])) {
    // Preserve only the sub-module gate at line 114 (1-based) — the one
    // whose immediate next non-blank line is `registerCodebaseTools(server);`.
    const next = lines[i + 1] ?? '';
    if (next.trim().startsWith('registerCodebaseTools(')) {
      console.log(`KEEP    line ${i + 1}: sub-module gate (registerCodebaseTools follows)`);
      continue;
    }
    if (next.trim().startsWith('server.registerTool(')) {
      openerIdxs.push(i);
    } else {
      console.log(`SKIP?   line ${i + 1}: next line is "${next.trim().slice(0, 60)}" — not a registerTool, leaving alone`);
    }
  }
}

console.log(`\nfound ${openerIdxs.length} unwrap candidates\n`);

// For each opener, brace-count forward to find the matching closer line.
// We need the closing `}` to be alone on a line (the convention used in
// this file). A bare `}` on its own line is the wrapper close.
const closerIdxs = new Set();
for (const openIdx of openerIdxs) {
  let depth = 1;
  let j = openIdx + 1;
  while (j < lines.length && depth > 0) {
    const line = lines[j];
    // Count braces ignoring obvious string-literal braces. Coarse but works
    // for this file (no template-literal braces inside registerTool bodies
    // in practice — schemas use z.object({...}) but those balance internally).
    for (let k = 0; k < line.length; k++) {
      const c = line[k];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      if (depth === 0) {
        // The wrapper-close `}` should be alone on the line. Confirm.
        if (line.trim() === '}') {
          closerIdxs.add(j);
          console.log(`unwrap  opener line ${openIdx + 1}  →  closer line ${j + 1}  →  ${lines[openIdx + 1].trim().slice(0, 60)}`);
        } else {
          console.log(`WARN    opener line ${openIdx + 1}: matching brace on line ${j + 1} is NOT a bare \`}\` (\`${line.trim().slice(0, 60)}\`) — skipping to avoid corruption`);
        }
        break;
      }
    }
    j++;
  }
}

console.log(`\nwill remove ${openerIdxs.length} opener lines + ${closerIdxs.size} closer lines = ${openerIdxs.length + closerIdxs.size} lines\n`);

if (openerIdxs.length !== closerIdxs.size) {
  console.error('opener/closer mismatch — refusing to write. Inspect output above.');
  process.exit(2);
}

// Build the new source by skipping opener and closer lines.
const openerSet = new Set(openerIdxs);
const out = lines.filter((_, i) => !openerSet.has(i) && !closerIdxs.has(i));

if (dryRun) {
  console.log('DRY RUN — no write. Removed line count:', lines.length - out.length);
  process.exit(0);
}

writeFileSync(FILE, out.join('\n'), 'utf8');
console.log(`✅ wrote ${FILE}  (${lines.length} → ${out.length} lines, removed ${lines.length - out.length})`);

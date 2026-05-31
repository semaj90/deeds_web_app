#!/usr/bin/env node
/**
 * dedupe-temporal-appends.mjs
 *
 * Cleanup pass for AGENTS.md / LLMS.md files: locate ALL atlas-append blocks
 * (matched by the HTML comment fences) and:
 *   - Keep the FIRST occurrence of each unique run-ID
 *   - Drop subsequent duplicates
 *
 * Does NOT touch any non-atlas-append content. Use after a temporal-append
 * run that accidentally produced timestamp-based (non-stable) run IDs.
 *
 * Usage:
 *   node scripts/atlas/dedupe-temporal-appends.mjs --dry-run
 *   node scripts/atlas/dedupe-temporal-appends.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

const TARGET_NAMES = ['AGENTS.md', 'LLMS.md'];

function findTargetFiles() {
  const found = [];
  const IGNORE = new Set(['node_modules', '.git', '.svelte-kit', 'dist', 'build', 'coverage', '.cache', 'tmp', '.tmp', 'target']);
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (IGNORE.has(ent.name) || ent.name.startsWith('.')) continue;
        walk(path.join(dir, ent.name));
      } else if (TARGET_NAMES.includes(ent.name)) {
        found.push(path.join(dir, ent.name));
      }
    }
  }
  walk(ROOT);
  return found;
}

// Match blocks: <!-- atlas-append:RUNID:TIMESTAMP --> ... <!-- /atlas-append:RUNID -->
// Use greedy single-block regex with capture of RUNID. Multiline.
const BLOCK_RE = /<!-- atlas-append:([a-f0-9]+):[^>]+-->\s*[\s\S]*?<!-- \/atlas-append:\1 -->\s*/g;

function dedupeFile(content) {
  const seenBodies = new Set();
  let kept = 0;
  let dropped = 0;

  const cleaned = content.replace(BLOCK_RE, (match) => {
    // Strip both wrapper comments and the H2 timestamp line, then hash the rest
    const body = match
      .replace(/<!-- atlas-append:[^>]+-->/g, '')
      .replace(/<!-- \/atlas-append:[^>]+-->/g, '')
      .replace(/^##\s+Atlas Activity\s+—\s+[\dTZ:.-]+\s*$/gm, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (seenBodies.has(body)) {
      dropped++;
      return '';
    }
    seenBodies.add(body);
    kept++;
    return match;
  });

  // Collapse 3+ consecutive blank lines to 2
  const collapsed = cleaned.replace(/\n{3,}/g, '\n\n');

  return { content: collapsed, kept, dropped };
}

function main() {
  console.log('\n══ Dedupe Temporal Appends ═══════════════════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const targets = findTargetFiles();
  console.log(`  Files found: ${targets.length}`);

  let totalKept = 0;
  let totalDropped = 0;
  let filesModified = 0;
  let filesUnchanged = 0;

  for (const fp of targets) {
    const original = fs.readFileSync(fp, 'utf8');
    if (!original.includes('atlas-append:')) {
      filesUnchanged++;
      continue;
    }
    const { content, kept, dropped } = dedupeFile(original);
    totalKept += kept;
    totalDropped += dropped;
    if (content !== original) {
      filesModified++;
      if (APPLY) fs.writeFileSync(fp, content, 'utf8');
    } else {
      filesUnchanged++;
    }
  }

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Blocks kept:      ${totalKept}`);
  console.log(`  Blocks dropped:   ${totalDropped}`);
  console.log(`  Files modified:   ${filesModified} ${APPLY ? '' : '(preview)'}`);
  console.log(`  Files unchanged:  ${filesUnchanged}`);

  if (!APPLY) {
    console.log('\n  [DRY-RUN] No files modified. Use --apply to dedupe.');
  }
}

main();

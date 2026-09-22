#!/usr/bin/env node
// SYMBOL-KIND-COVERAGE-AUDIT-01 step 1: define a deterministic, bounded corpus of
// tree-sitter-parseable TS/JS source files for the symbol-kind smoke fan-out.
//
// Read-only. Writes only docs/reports/symbol-kind-corpus-v1.json. No canonical writes.
//
// Scope rationale (recorded, not assumed): `.okf/languages/typescript.yaml`'s `extensions`
// list includes `.svelte` and `.svelte.ts`, but tree-sitter-typescript's `typescript` grammar
// cannot parse Svelte's template syntax and `.svelte.ts` files mix runes with plain TS in ways
// this smoke test does not attempt to disambiguate. This corpus is deliberately narrowed to
// plain TS/JS (`.ts .tsx .mts .cts .js .mjs .cjs`), excluding `.d.ts` (no runtime declarations)
// and `.svelte*` (different grammar) -- both flagged in the manifest's `excludedByDesign` field
// so a reader does not mistake this for full-corpus coverage.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..'); // sveltekit-frontend/
const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUT_PATH = path.join(REPORT_DIR, 'symbol-kind-corpus-v1.json');

const PARSEABLE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const EXCLUDE_SEGMENTS = [
  '/node_modules/', '/build/', '/dist/', '/coverage/', '/backup-', '/.next/', '/.nuxt/',
  '/out/', '/archive/', '/logs/', '/temp/', '/.tmp/', '/vendor/', '/__pycache__/',
];

const CORPUS_CAP = Number(process.argv.find((a) => a.startsWith('--cap='))?.split('=')[1] ?? 400);
const SCAN_ROOTS = ['src', 'scripts/atlas'];

function gitTrackedFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '--', root], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean);
  } catch (err) {
    console.error(`git ls-files failed for ${root}: ${err.message}`);
    return [];
  }
}

function isEligible(relPath) {
  const ext = path.extname(relPath);
  if (relPath.endsWith('.d.ts')) return false;
  if (relPath.includes('.svelte')) return false;
  if (!PARSEABLE_EXT.has(ext)) return false;
  const normalized = `/${relPath.replace(/\\/g, '/')}`;
  if (EXCLUDE_SEGMENTS.some((seg) => normalized.includes(seg))) return false;
  return true;
}

function workspaceRevision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function deterministicSample(files, cap) {
  if (files.length <= cap) return files.slice().sort();
  const sorted = files.slice().sort();
  const stride = sorted.length / cap;
  const sampled = [];
  for (let i = 0; i < cap; i += 1) {
    sampled.push(sorted[Math.floor(i * stride)]);
  }
  return [...new Set(sampled)];
}

function main() {
  const allEligible = [];
  for (const root of SCAN_ROOTS) {
    const tracked = gitTrackedFiles(root);
    for (const relPath of tracked) {
      if (isEligible(relPath)) allEligible.push(relPath);
    }
  }
  const uniqueSorted = [...new Set(allEligible)].sort();
  const sampled = deterministicSample(uniqueSorted, CORPUS_CAP);

  const byExt = {};
  for (const f of sampled) {
    const ext = path.extname(f);
    byExt[ext] = (byExt[ext] ?? 0) + 1;
  }

  const manifest = {
    schema: 'atlas.symbol-kind-corpus.v1',
    generatedAt: new Date().toISOString(),
    workspaceRevision: workspaceRevision(),
    scanRoots: SCAN_ROOTS,
    eligibleTotal: uniqueSorted.length,
    corpusCap: CORPUS_CAP,
    corpusSize: sampled.length,
    samplingMethod: 'deterministic_stride_over_sorted_git_tracked_paths',
    countsByExtension: byExt,
    excludedByDesign: {
      '.svelte / .svelte.ts': 'different grammar (Svelte template + runes), not tree-sitter-typescript-parseable as-is',
      '.d.ts': 'no runtime declarations to classify',
    },
    files: sampled,
    canonicalAuthority: false,
    writesPerformed: false,
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`Corpus defined: ${sampled.length}/${uniqueSorted.length} eligible files (cap=${CORPUS_CAP})`);
  console.log(`By extension: ${JSON.stringify(byExt)}`);
  console.log(`Manifest: ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main();

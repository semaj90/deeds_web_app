#!/usr/bin/env node
/**
 * Extracts IMPORTS edges directly from the CURRENT live source tree -- read-only, no Neo4j or
 * Postgres writes. Built specifically to unblock the structural-proxy golden-set methodology
 * already chosen in openspec/changes/parent-atlas-graph-analysis-contract/tasks.md, whose prior
 * attempt found the existing Neo4j IMPORTS edges point into a deleted
 * .claude/worktrees/agent-a38668f2/... path -- stale relative to the actual repo tree.
 *
 * This script avoids that failure mode structurally: every edge is verified by resolving the
 * import specifier to a real file that exists on disk RIGHT NOW, not read back from a graph that
 * could have drifted. An edge that doesn't resolve to a real file is dropped, not guessed at.
 *
 * Scope: sveltekit-frontend/src/**\/*.{ts,svelte} only (the live tree; root src/ was already
 * flagged and archived as orphaned on 2026-08-22 -- see deeds_labs/archive/2026-08-22/
 * orphaned-root-src-tree/ -- and is deliberately excluded here).
 *
 * Resolution handles: relative imports (./ ../), $lib/* -> src/lib/*, with/without extension,
 * and directory-index resolution (foo/ -> foo/index.ts). Bare package specifiers (no leading
 * '.', '$lib', or '/') are skipped -- those are node_modules, not internal structural edges.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srcRoot = path.resolve(root, 'sveltekit-frontend/src');
const outputPath = path.resolve(root, '.tmp/atlas/live-tree-imports-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/live-tree-imports-extraction-v1.json');

const IMPORT_RE = /(?:from\s+|import\()\s*['"]([^'"]+)['"]/g;
const EXTENSIONS = ['.ts', '.svelte', '.js', '.mts', '.mjs'];
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'build', '.git', 'dist']);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else if (/\.(ts|svelte)$/.test(entry.name) && !/\.(spec|test)\.ts$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function existsFile(candidate) {
  try {
    const stat = await fs.stat(candidate);
    return stat.isFile();
  } catch {
    return false;
  }
}

/** Resolve a specifier to a real file path, or null if it can't be found on disk. */
async function resolveSpecifier(specifier, fromFileDir) {
  let base;
  if (specifier.startsWith('$lib/')) {
    base = path.join(srcRoot, 'lib', specifier.slice('$lib/'.length));
  } else if (specifier === '$lib') {
    base = path.join(srcRoot, 'lib');
  } else if (specifier.startsWith('.')) {
    base = path.resolve(fromFileDir, specifier);
  } else {
    return null; // bare package specifier ($app/*, node_modules, etc.) -- not an internal edge
  }

  if (await existsFile(base)) return base;

  // SvelteKit/bundler convention: source writes a .js extension but the real file on disk is
  // .ts (bundler resolves .js -> .ts) -- documented in this repo's own root CLAUDE.md. Try
  // swapping .js for each real extension before falling back to plain appending.
  if (base.endsWith('.js')) {
    const withoutJs = base.slice(0, -3);
    for (const ext of EXTENSIONS) {
      if (await existsFile(withoutJs + ext)) return withoutJs + ext;
    }
  }

  for (const ext of EXTENSIONS) {
    if (await existsFile(base + ext)) return base + ext;
  }
  for (const ext of EXTENSIONS) {
    const indexPath = path.join(base, `index${ext}`);
    if (await existsFile(indexPath)) return indexPath;
  }
  return null;
}

function relativeRef(absPath) {
  return path.relative(root, absPath).replaceAll('\\', '/');
}

const sha = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

async function main() {
  const files = await walk(srcRoot);
  const edges = [];
  let unresolvedCount = 0;
  const unresolvedSamples = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const fileDir = path.dirname(file);
    const specifiers = new Set();
    let match;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(content)) !== null) {
      specifiers.add(match[1]);
    }

    for (const specifier of specifiers) {
      // Only attempt resolution for specifiers that look like internal paths.
      if (!specifier.startsWith('.') && !specifier.startsWith('$lib')) continue;
      const resolved = await resolveSpecifier(specifier, fileDir);
      if (resolved) {
        edges.push({
          schema: 'atlas.live-tree-imports.v1',
          type: 'IMPORTS',
          source_ref: relativeRef(file),
          target_ref: relativeRef(resolved),
          specifier,
        });
      } else {
        unresolvedCount++;
        if (unresolvedSamples.length < 20) {
          unresolvedSamples.push({ source_ref: relativeRef(file), specifier });
        }
      }
    }
  }

  edges.sort((a, b) => `${a.source_ref}|${a.target_ref}`.localeCompare(`${b.source_ref}|${b.target_ref}`));
  const output = edges.map((e) => JSON.stringify(e)).join('\n') + (edges.length ? '\n' : '');

  const report = {
    schema: 'atlas.live-tree-imports-extraction.v1',
    status: 'READ_ONLY_PROVEN',
    scope: 'sveltekit-frontend/src/**/*.{ts,svelte} (excludes *.spec.ts/*.test.ts)',
    filesScanned: files.length,
    edgesExtracted: edges.length,
    unresolvedSpecifiers: unresolvedCount,
    unresolvedSamples,
    outputPath: path.relative(root, outputPath).replaceAll('\\', '/'),
    outputChecksum: `sha256:${sha(output)}`,
    databaseWrites: false,
    neo4jWrites: false,
    readOnly: true,
    note: 'Every edge resolved against a real file on disk at extraction time -- avoids the stale-Neo4j-path failure mode found in the prior GA8 attempt. Root src/ (orphaned, archived 2026-08-22) is deliberately excluded.',
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(outputPath, output, 'utf8');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

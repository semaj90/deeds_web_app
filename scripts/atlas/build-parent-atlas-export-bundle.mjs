#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, collectFiles, readJson, toPosixPath, writeJson, writeMarkdown } from './_atlas-utils.mjs';
import { analyzeSourceRefInputs, normalizeRef } from './normalize-source-ref-id.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(REPO_ROOT, 'memory', 'exports', 'atlas');
const BUNDLE_MANIFEST = path.join(OUT_DIR, 'parent-atlas-export-bundle-manifest.json');
const BUNDLE_JSONL = path.join(OUT_DIR, 'parent-atlas-export-bundle.jsonl');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-export-bundle-report.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-export-bundle-report.md');

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.svelte', '.md', '.json', '.jsonl', '.ndjson', '.sql', '.txt', '.ps1', '.sh', '.yml', '.yaml']);

const ACTIVE_BUNDLE_ROOTS = [
  path.join(REPO_ROOT, 'scripts', 'atlas'),
  path.join(REPO_ROOT, 'docs', 'atlas'),
  path.join(REPO_ROOT, 'docs', 'operator'),
  path.join(REPO_ROOT, 'docs', 'architecture'),
  path.join(REPO_ROOT, 'reports'),
  path.join(REPO_ROOT, 'memory', 'exports', 'atlas'),
  path.join(REPO_ROOT, 'sveltekit-frontend', 'src'),
  path.join(REPO_ROOT, 'sveltekit-frontend', 'docs', 'reports'),
  path.join(REPO_ROOT, 'sveltekit-frontend', '.tmp'),
  path.join(REPO_ROOT, 'neschrom97'),
];

const OPEN_LANES_BUNDLE_ROOTS = [
  path.join(REPO_ROOT, 'scripts', 'atlas'),
  path.join(REPO_ROOT, 'scripts', 'opencode'),
  path.join(REPO_ROOT, 'docs', 'atlas'),
  path.join(REPO_ROOT, 'docs', 'architecture'),
  path.join(REPO_ROOT, 'reports'),
  path.join(REPO_ROOT, 'memory', 'exports', 'atlas'),
  path.join(REPO_ROOT, 'neschrom97'),
  path.join(REPO_ROOT, 'sveltekit-frontend', 'docs', 'reports'),
  path.join(REPO_ROOT, 'sveltekit-frontend', 'src'),
];

const OPEN_LANES_BUNDLE_FILES = [
  path.join(REPO_ROOT, '.opencode', 'startup-briefing.json'),
  path.join(REPO_ROOT, '.opencode', 'startup-briefing.md'),
  path.join(REPO_ROOT, '.opencode', 'tasks', 'task-state.md'),
  path.join(REPO_ROOT, '.opencode', 'tasks', 'task-events.jsonl'),
  path.join(REPO_ROOT, '.opencode', 'recommendations', 'recommendations.json'),
  path.join(REPO_ROOT, '.tmp', 'feature_labels.jsonl'),
  path.join(REPO_ROOT, '.tmp', 'kanban_tasks.jsonl'),
  path.join(REPO_ROOT, '.tmp', 'missing_feature_todos.jsonl'),
  path.join(REPO_ROOT, '.tmp', 'phase-lane-completion.json'),
  path.join(REPO_ROOT, '.tmp', 'parent_atlas_packets', 'parent-atlas-packets.ndjson'),
];

function uniqueExistingRoots(roots) {
  return [...new Set(roots)].filter((root) => fs.existsSync(root));
}

function classifyArtifact(relPath) {
  const posix = toPosixPath(relPath);
  if (posix.includes('drizzle-schema-map')) return 'drizzle-schema-map';
  if (posix.includes('source-ref-normalization')) return 'source-ref-normalization';
  if (posix.includes('hidden-packet-pathmap')) return 'hidden-packet-pathmap';
  if (posix.includes('feature-lineage')) return 'feature-lineage';
  if (posix.includes('runtime-packet-density')) return 'runtime-packet-density';
  if (posix.includes('postgres-contract')) return 'postgres-contract';
  if (posix.includes('live-service-env')) return 'live-service-env';
  if (posix.includes('ignored-directory-audit')) return 'ignored-directory-audit';
  if (posix.includes('all-lanes-parent-atlas')) return 'all-lanes-parent-atlas';
  if (posix.includes('parent-atlas')) return 'parent-atlas';
  return path.extname(posix).slice(1) || 'unknown';
}

function statFile(filePath) {
  const stat = fs.statSync(filePath);
  return {
    path: toPosixPath(path.relative(REPO_ROOT, filePath)),
    normalizedPath: normalizeRef(toPosixPath(path.relative(REPO_ROOT, filePath)), REPO_ROOT),
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    kind: classifyArtifact(path.relative(REPO_ROOT, filePath)),
  };
}

function collectBundleFiles(roots) {
  const ignoreDirs = new Set(['node_modules', '.git', '.svelte-kit', '.vite', 'dist', 'build']);
  const files = [];
  const seen = new Set();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stat = fs.statSync(root);
    if (stat.isFile()) {
      const rel = path.relative(REPO_ROOT, root);
      const key = rel.replaceAll('\\', '/');
      if (!seen.has(key) && ALLOWED_EXTENSIONS.has(path.extname(root).toLowerCase())) {
        seen.add(key);
        files.push(statFile(root));
      }
      continue;
    }
    for (const filePath of collectFiles(
      root,
      ignoreDirs,
      (candidate) => ALLOWED_EXTENSIONS.has(path.extname(candidate).toLowerCase()),
      [],
      new Set(['.map', '.log', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg'])
    )) {
      const rel = path.relative(REPO_ROOT, filePath);
      const key = rel.replaceAll('\\', '/');
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(statFile(filePath));
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function collectFocusedBundleFiles() {
  return collectBundleFiles(uniqueExistingRoots([...OPEN_LANES_BUNDLE_ROOTS, ...OPEN_LANES_BUNDLE_FILES]));
}

function collectActiveBundleFiles() {
  return collectBundleFiles(uniqueExistingRoots(ACTIVE_BUNDLE_ROOTS));
}

function ensurePrereqs() {
  const schemaMap = path.join(OUT_DIR, 'drizzle-schema-map.jsonl');
  const sourcePreview = path.join(REPO_ROOT, '.tmp', 'source-ref-normalization-preview.jsonl');
  const missing = [];
  if (!fs.existsSync(schemaMap)) missing.push(schemaMap);
  if (!fs.existsSync(sourcePreview)) missing.push(sourcePreview);
  return { schemaMap, sourcePreview, missing };
}

function main() {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const dryRun = args.has('--dry-run') || !args.has('--apply');
  const active = args.has('--active');
  const lanesArg = argv.find((arg) => arg.startsWith('--lanes='));
  const lanes = lanesArg ? lanesArg.slice('--lanes='.length).trim().toLowerCase() : '';
  const focused = lanes === 'open' || lanes === 'focused' || args.has('--focused');
  const prereqs = ensurePrereqs();
  const files = focused ? collectFocusedBundleFiles() : active ? collectActiveBundleFiles() : collectBundleFiles(uniqueExistingRoots([
    path.join(REPO_ROOT, 'docs'),
    path.join(REPO_ROOT, 'reports'),
    path.join(REPO_ROOT, 'scripts'),
    path.join(REPO_ROOT, 'memory', 'exports'),
    path.join(REPO_ROOT, '.tmp'),
    path.join(REPO_ROOT, '.opencode'),
    path.join(REPO_ROOT, 'sveltekit-frontend', 'src'),
    path.join(REPO_ROOT, 'sveltekit-frontend', 'docs'),
    path.join(REPO_ROOT, 'sveltekit-frontend', '.tmp'),
  ]));
  const bundle = {
    generatedAt: new Date().toISOString(),
    dryRun,
    active,
    lanes: focused ? 'open' : active ? 'active' : 'full',
    prereqs: {
      schemaMap: toPosixPath(path.relative(REPO_ROOT, prereqs.schemaMap)),
      sourcePreview: toPosixPath(path.relative(REPO_ROOT, prereqs.sourcePreview)),
      missing: prereqs.missing.map((f) => toPosixPath(path.relative(REPO_ROOT, f))),
    },
    files,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeJson(BUNDLE_MANIFEST, bundle);
  fs.writeFileSync(BUNDLE_JSONL, files.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');

  const summary = {
    generatedAt: bundle.generatedAt,
    dryRun,
    active,
    lanes: bundle.lanes,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    kindCounts: files.reduce((acc, file) => {
      acc[file.kind] = (acc[file.kind] ?? 0) + 1;
      return acc;
    }, {}),
    missingPrereqs: bundle.prereqs.missing,
  };
  writeJson(REPORT_JSON, summary);
  writeMarkdown(REPORT_MD, [
    '# Parent Atlas Export Bundle Report',
    '',
    `Generated: ${summary.generatedAt}`,
    `Mode: ${dryRun ? 'dry-run' : 'apply'}`,
    `Scope: ${summary.lanes}`,
    '',
    '## Summary',
    '',
    `- Files: ${summary.fileCount}`,
    `- Bytes: ${summary.totalBytes}`,
    `- Missing prereqs: ${summary.missingPrereqs.length ? summary.missingPrereqs.join(', ') : 'none'}`,
    '',
    '## Kind Counts',
    '',
    ...Object.entries(summary.kindCounts).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `- ${kind}: ${count}`),
  ].join('\n'));

  console.log(`Wrote ${BUNDLE_MANIFEST}`);
  console.log(`Wrote ${BUNDLE_JSONL}`);
  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  return { bundle, summary };
}

main();

#!/usr/bin/env node
/**
 * audit-model-artifacts.mjs  (Phase 9C)
 *
 * Scans known model locations for AI model files and cross-references against
 * models/model-manifest.json (the canonical declaration of expected models).
 *
 * Scan roots (env-overridable):
 *   - $USERPROFILE/Desktop          temporary / development staging
 *   - $USERPROFILE/Downloads        temporary / development staging
 *   - <repo>/models                 canonical repo-tracked metadata + small artifacts
 *   - <repo>/vendor/models          vendor-committed weights (gitignored blobs)
 *   - $TURBO_MODEL_PATH dir         runtime-declared primary model location
 *   - $TURBO_MMPROJ_PATH dir        runtime-declared mmproj location
 *
 * Outputs:
 *   docs/reports/model-inventory.json
 *   docs/reports/model-inventory.md
 *
 * Usage:
 *   node scripts/atlas/audit-model-artifacts.mjs [--json] [--dry-run]
 */

import { existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { REPO_ROOT, readJson } from './_atlas-utils.mjs';

const REPORTS_DIR = join(REPO_ROOT, 'docs', 'reports');
const ARGS        = process.argv.slice(2);
const DRY_RUN     = ARGS.includes('--dry-run');
const JSON_OUT    = ARGS.includes('--json');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m', cyan: '\x1b[36m',
};

const MODEL_EXTS = new Set(['.gguf', '.mmproj', '.onnx', '.safetensors', '.bin', '.pt', '.pth']);

// Classify files that match keywords even without a model extension
const MODEL_KEYWORDS = ['embed', 'gemma', 'llama', 'qwen', 'mmproj', 'turbo', 'rotor', 'whisper', 'clip', 'mistral'];

function isBinaryDir(name) {
  return name === 'node_modules' || name === '.git' || name === 'dist' ||
         name === '.svelte-kit' || name === '__pycache__';
}

/** Classify where a found file sits relative to known roots. */
function classifyPath(fullPath) {
  const p = fullPath.replace(/\\/g, '/');
  if (p.includes('/Desktop/') || p.includes('\\Desktop\\'))    return 'desktop_staging';
  if (p.includes('/Downloads/') || p.includes('\\Downloads\\')) return 'downloads_staging';
  if (p.includes('/vendor/models'))                             return 'vendor_canonical';
  if (p.includes('/models/'))                                   return 'repo_models';
  return 'other';
}

function scan(dir, results = []) {
  if (!existsSync(dir)) return results;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (isBinaryDir(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(full, results);
    } else {
      const lower = entry.name.toLowerCase();
      const ext   = lower.slice(lower.lastIndexOf('.'));
      const matchExt = MODEL_EXTS.has(ext);
      const matchKey = MODEL_KEYWORDS.some(k => lower.includes(k));
      if (!matchExt && !matchKey) continue;
      let sizeMB = 0;
      try { sizeMB = statSync(full).size / 1048576; } catch {}
      results.push({
        name:     entry.name,
        path:     full.replace(/\\/g, '/'),
        ext,
        sizeMB:   +sizeMB.toFixed(2),
        category: classifyPath(full),
      });
    }
  }
  return results;
}

function buildScanRoots() {
  const home = homedir();
  const roots = [
    { dir: join(home, 'Desktop'),    label: 'Desktop (staging)' },
    { dir: join(home, 'Downloads'),  label: 'Downloads (staging)' },
    { dir: join(REPO_ROOT, 'models'),        label: 'repo/models' },
    { dir: join(REPO_ROOT, 'vendor', 'models'), label: 'repo/vendor/models' },
  ];
  // Add runtime env-var paths if set
  for (const [envKey, label] of [
    ['TURBO_MODEL_PATH',  'env:TURBO_MODEL_PATH'],
    ['TURBO_MMPROJ_PATH', 'env:TURBO_MMPROJ_PATH'],
    ['ROTORQUANT_MODEL_PATH', 'env:ROTORQUANT_MODEL_PATH'],
  ]) {
    const val = process.env[envKey];
    if (val && existsSync(val)) {
      roots.push({ dir: dirname(val), label });
    }
  }
  return roots;
}

function main() {
  // Load manifest (declare of expected models)
  const manifestPath = join(REPO_ROOT, 'models', 'model-manifest.json');
  const manifest     = readJson(manifestPath, { models: [] });
  const declaredIds  = new Set((manifest.models ?? []).map(m => m.id));

  const roots    = buildScanRoots();
  const found    = [];
  const scanned  = [];

  for (const { dir, label } of roots) {
    if (!existsSync(dir)) {
      if (!JSON_OUT) console.log(`  ${C.gray}skip (missing)  ${label}${C.reset}`);
      continue;
    }
    const hits = scan(dir);
    scanned.push({ dir, label, count: hits.length });
    found.push(...hits);
    if (!JSON_OUT) {
      const icon = hits.length ? `${C.green}·${C.reset}` : `${C.gray}·${C.reset}`;
      console.log(`  ${icon} ${label.padEnd(32)} ${C.gray}${hits.length} artifact(s)${C.reset}`);
    }
  }

  // Cross-reference manifest vs discovered
  const manifestStatus = (manifest.models ?? []).map(m => {
    const discovered = found.find(f => f.name === m.filename || f.path.includes(m.filename ?? ''));
    return {
      id:         m.id,
      runtime:    m.runtime,
      filename:   m.filename ?? '(env-resolved)',
      pathEnv:    m.pathEnv,
      discovered: !!discovered,
      discoveredPath: discovered?.path ?? null,
      sizeMB:     discovered?.sizeMB ?? null,
    };
  });

  const totalSizeMB   = found.reduce((s, f) => s + f.sizeMB, 0);
  const stagingFiles  = found.filter(f => f.category === 'desktop_staging' || f.category === 'downloads_staging');
  const repoFiles     = found.filter(f => f.category === 'repo_models' || f.category === 'vendor_canonical');
  const undeclared    = found.filter(f => !declaredIds.has(f.name) && (f.sizeMB > 100));

  if (!JSON_OUT) {
    console.log(`\n${C.bold}── Model Artifact Inventory (Phase 9C) ──${C.reset}\n`);
    console.log(`  Found:          ${found.length} artifacts`);
    console.log(`  Total size:     ${totalSizeMB.toFixed(0)} MB`);
    console.log(`  Staging (tmp):  ${stagingFiles.length} files — move to models/ or vendor/models/`);
    console.log(`  In repo:        ${repoFiles.length} files`);
    if (undeclared.length) {
      console.log(`\n  ${C.yellow}⚠ ${undeclared.length} large artifacts (>100MB) not in model-manifest.json:${C.reset}`);
      for (const f of undeclared) console.log(`    ${C.yellow}·${C.reset} ${f.name} (${f.sizeMB} MB) @ ${f.category}`);
    }

    console.log(`\n  Manifest cross-check:`);
    for (const m of manifestStatus) {
      const icon = m.discovered ? `${C.green}✓${C.reset}` : `${C.yellow}?${C.reset}`;
      const loc  = m.discoveredPath ? `${m.sizeMB} MB` : 'not found on disk';
      console.log(`    ${icon} ${m.id.padEnd(36)} ${C.gray}${loc}${C.reset}`);
    }
  }

  const report = {
    generatedAt:    new Date().toISOString(),
    totalArtifacts: found.length,
    totalSizeMB:    +totalSizeMB.toFixed(0),
    stagingCount:   stagingFiles.length,
    repoCount:      repoFiles.length,
    undeclaredLarge: undeclared.length,
    status:         undeclared.length === 0 ? 'pass' : 'warn',
    scannedRoots:   scanned,
    manifestStatus,
    artifacts:      found,
  };

  if (!DRY_RUN) {
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(join(REPORTS_DIR, 'model-inventory.json'), JSON.stringify(report, null, 2));
    writeFileSync(join(REPORTS_DIR, 'model-inventory.md'), buildMd(report));
    if (!JSON_OUT) {
      console.log(`\n  ${C.gray}→ docs/reports/model-inventory.json${C.reset}`);
      console.log(`  ${C.gray}→ docs/reports/model-inventory.md${C.reset}\n`);
    }
  }

  if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

function buildMd({ generatedAt, totalArtifacts, totalSizeMB, stagingCount, repoCount, status, manifestStatus, artifacts }) {
  return [
    '# Model Artifact Inventory (Phase 9C)',
    `_Generated: ${generatedAt}_  |  Status: **${status.toUpperCase()}**`,
    '',
    '## Summary',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total artifacts | ${totalArtifacts} |`,
    `| Total size | ${totalSizeMB} MB |`,
    `| Staging (Desktop/Downloads) | ${stagingCount} |`,
    `| In repo (models/ or vendor/) | ${repoCount} |`,
    '',
    '## Manifest Status',
    '| Model ID | Runtime | Filename | Discovered | Size |',
    '|----------|---------|----------|------------|------|',
    ...manifestStatus.map(m =>
      `| \`${m.id}\` | ${m.runtime} | \`${m.filename}\` | ${m.discovered ? '✓' : '?'} | ${m.sizeMB ?? '—'} MB |`
    ),
    '',
    '## All Artifacts',
    '| Name | Size (MB) | Category | Path |',
    '|------|-----------|----------|------|',
    ...artifacts.map(f => `| \`${f.name}\` | ${f.sizeMB} | ${f.category} | \`${f.path}\` |`),
  ].join('\n');
}

main();

#!/usr/bin/env node
/**
 * analyze-directory-roles.mjs  (Phase 9F)
 *
 * Classifies top-level and second-level directories by role so audit scripts
 * and agents know whether to include or skip them, and which rg mode to use.
 *
 * Roles:
 *   source                     — live application / library code
 *   tests                      — unit, integration, e2e tests
 *   migrations                 — Drizzle SQL migration files
 *   generated_reports          — audit output / JSON reports
 *   external_docs_normalized   — post-processed docs (LLMS.txt, atlas index)
 *   binary_artifact            — large binaries / model weights
 *   build_cache                — .svelte-kit, dist, node_modules
 *   scripts                    — project tooling and audit scripts
 *   config                     — project configuration files
 *   archive                    — deprecated / archived modules
 *   unknown                    — unclassified (needs operator review)
 *
 * Usage:
 *   node scripts/atlas/analyze-directory-roles.mjs [--json] [--dry-run]
 *
 * Output:
 *   docs/graph/directory-role-map.json
 *   docs/reports/directory-analysis-report.md
 */

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './_atlas-utils.mjs';

const REPORTS_DIR = join(REPO_ROOT, 'docs', 'reports');
const GRAPH_DIR   = join(REPO_ROOT, 'docs', 'graph');
const ARGS        = process.argv.slice(2);
const DRY_RUN     = ARGS.includes('--dry-run');
const JSON_OUT    = ARGS.includes('--json');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m', cyan: '\x1b[36m',
};

// Operator-maintained role map — add entries here when new directories appear
const STATIC_ROLE_MAP = [
  // source
  { path: 'sveltekit-frontend/src',                            role: 'source',                    rg_mode: 'source_only',                 owner: 'SvelteKit App' },
  { path: 'sveltekit-frontend/src/routes',                     role: 'source',                    rg_mode: 'complete_visibility_required', owner: 'SvelteKit routes' },
  { path: 'sveltekit-frontend/src/lib/server/db',              role: 'source',                    rg_mode: 'complete_visibility_required', owner: 'Drizzle schema files' },
  { path: 'sveltekit-frontend/src/lib/db',                     role: 'source',                    rg_mode: 'source_only',                 owner: 'DB client entry' },
  // migrations
  { path: 'sveltekit-frontend/drizzle',                        role: 'migrations',                rg_mode: 'complete_visibility_required', owner: 'Drizzle ORM' },
  { path: 'sveltekit-frontend/drizzle/manual',                 role: 'migrations',                rg_mode: 'complete_visibility_required', owner: 'Manual SQL sidecars' },
  { path: 'sveltekit-frontend/drizzle/meta',                   role: 'migrations',                rg_mode: 'complete_visibility_required', owner: 'Drizzle journal' },
  // tests
  { path: 'sveltekit-frontend/tests',                          role: 'tests',                     rg_mode: 'source_only',                 owner: 'Vitest + Playwright' },
  { path: 'tests',                                             role: 'tests',                     rg_mode: 'source_only',                 owner: 'Root-level tests' },
  // generated reports
  { path: 'docs/reports',                                      role: 'generated_reports',         rg_mode: 'complete_visibility_required', owner: 'Atlas audit output' },
  { path: 'docs/graph',                                        role: 'generated_reports',         rg_mode: 'complete_visibility_required', owner: 'Graph / atlas JSON blobs' },
  // external docs
  { path: 'docs/llms',                                         role: 'external_docs_normalized',  rg_mode: 'generated_artifacts_allowed', owner: 'LLMS.txt for AI context' },
  { path: 'sveltekit-frontend/docs/atlas-index',               role: 'external_docs_normalized',  rg_mode: 'complete_visibility_required', owner: 'Atlas index snapshots' },
  { path: 'sveltekit-frontend/memory',                         role: 'external_docs_normalized',  rg_mode: 'complete_visibility_required', owner: 'Karpathy memory store' },
  // scripts
  { path: 'scripts',                                           role: 'scripts',                   rg_mode: 'source_only',                 owner: 'Atlas / audit scripts' },
  { path: 'scripts/atlas',                                     role: 'scripts',                   rg_mode: 'source_only',                 owner: 'Atlas audit scripts' },
  { path: 'sveltekit-frontend/scripts',                        role: 'scripts',                   rg_mode: 'source_only',                 owner: 'Frontend tooling' },
  { path: 'next_steps',                                        role: 'scripts',                   rg_mode: 'source_only',                 owner: 'Operator roadmap documents' },
  // archive
  { path: 'sveltekit-frontend/src/lib/server/db/archived-schemas', role: 'archive',             rg_mode: 'safe_to_respect_gitignore',   owner: 'Legacy schema files' },
  // binary artifacts
  { path: 'granite-docling-258M',                              role: 'binary_artifact',           rg_mode: 'safe_to_respect_gitignore',   owner: 'Docling model weights' },
  { path: 'turbovec',                                          role: 'binary_artifact',           rg_mode: 'safe_to_respect_gitignore',   owner: 'Turbovec binary' },
  { path: 'sveltekit-frontend/static',                         role: 'binary_artifact',           rg_mode: 'safe_to_respect_gitignore',   owner: 'Static assets (WASM, fonts, images)' },
  // build cache
  { path: 'sveltekit-frontend/.svelte-kit',                    role: 'build_cache',               rg_mode: 'safe_to_respect_gitignore',   owner: 'SvelteKit build cache' },
  { path: 'sveltekit-frontend/node_modules',                   role: 'build_cache',               rg_mode: 'safe_to_respect_gitignore',   owner: 'Frontend npm deps' },
  { path: 'node_modules',                                      role: 'build_cache',               rg_mode: 'safe_to_respect_gitignore',   owner: 'Root npm deps' },
  // additional top-level dirs
  { path: 'artifacts',           role: 'diagnostic_log',       rg_mode: 'complete_visibility_required', owner: 'Build/test artifacts' },
  { path: 'audit',               role: 'generated_reports',    rg_mode: 'complete_visibility_required', owner: 'Root-level audit output' },
  { path: 'data',                role: 'external_docs_raw',    rg_mode: 'complete_visibility_required', owner: 'Raw data files' },
  { path: 'deeds_labs',          role: 'archive',              rg_mode: 'safe_to_respect_gitignore',   owner: 'Gitignored lab/experimental code' },
  { path: 'docker',              role: 'config',               rg_mode: 'source_only',                 owner: 'Docker Compose / Caddy / service configs' },
  { path: 'drizzle',             role: 'migrations',           rg_mode: 'complete_visibility_required', owner: 'Root-level legacy drizzle (pre-monorepo)' },
  { path: 'karpathy-wiki',       role: 'external_docs_raw',    rg_mode: 'complete_visibility_required', owner: 'Karpathy wiki raw notes' },
  { path: 'lawpdfs',             role: 'binary_artifact',      rg_mode: 'safe_to_respect_gitignore',   owner: 'Legal PDF source documents' },
  { path: 'llm',                 role: 'external_docs_raw',    rg_mode: 'source_only',                 owner: 'LLM notes / timelines' },
  { path: 'logs',                role: 'diagnostic_log',       rg_mode: 'safe_to_respect_gitignore',   owner: 'Runtime and task output logs' },
  { path: 'memory',              role: 'external_docs_normalized', rg_mode: 'complete_visibility_required', owner: 'Root-level Claude memory files' },
  { path: 'minio-data',          role: 'binary_artifact',      rg_mode: 'safe_to_respect_gitignore',   owner: 'MinIO object storage data' },
  { path: 'minio',               role: 'config',               rg_mode: 'source_only',                 owner: 'MinIO configuration' },
  { path: 'models',              role: 'binary_artifact',      rg_mode: 'safe_to_respect_gitignore',   owner: 'ML model weights' },
  { path: 'nginx',               role: 'config',               rg_mode: 'source_only',                 owner: 'Nginx proxy config' },
  { path: 'onnx',                role: 'binary_artifact',      rg_mode: 'safe_to_respect_gitignore',   owner: 'ONNX model files' },
  { path: 'pgvector-precompiled', role: 'binary_artifact',     rg_mode: 'safe_to_respect_gitignore',   owner: 'Precompiled pgvector binaries' },
  { path: 'playwright_todos',    role: 'tests',                rg_mode: 'source_only',                 owner: 'Playwright TODO tracking' },
  { path: 'proto',               role: 'source',               rg_mode: 'complete_visibility_required', owner: 'gRPC protobuf definitions' },
  { path: 'python',              role: 'scripts',              rg_mode: 'source_only',                 owner: 'Python utility scripts' },
  { path: 'qdrant-windows',      role: 'binary_artifact',      rg_mode: 'safe_to_respect_gitignore',   owner: 'Qdrant Windows binary' },
  { path: 'qdrant',              role: 'config',               rg_mode: 'source_only',                 owner: 'Qdrant config / data' },
  { path: 'redis',               role: 'config',               rg_mode: 'source_only',                 owner: 'Redis config' },
  { path: 'scratch',             role: 'diagnostic_log',       rg_mode: 'safe_to_respect_gitignore',   owner: 'Scratch / temp files' },
  { path: 'services',            role: 'source',               rg_mode: 'source_only',                 owner: 'Go / auxiliary microservices' },
  { path: 'simd-bridge',         role: 'source',               rg_mode: 'source_only',                 owner: 'C++ N-API SIMD/LibTorch bridge' },
  { path: 'sql',                 role: 'migrations',           rg_mode: 'complete_visibility_required', owner: 'Root-level raw SQL files' },
  { path: 'ssl',                 role: 'config',               rg_mode: 'safe_to_respect_gitignore',   owner: 'TLS certificates (gitignored)' },
  { path: 'storage',             role: 'binary_artifact',      rg_mode: 'safe_to_respect_gitignore',   owner: 'Local object storage data' },
  { path: 'test-results',        role: 'diagnostic_log',       rg_mode: 'safe_to_respect_gitignore',   owner: 'Playwright / Vitest test result outputs' },
  { path: 'tools',               role: 'scripts',              rg_mode: 'source_only',                 owner: 'Developer tooling' },
  { path: 'vscode-extension',    role: 'source',               rg_mode: 'source_only',                 owner: 'VS Code extension source' },
];

const RG_LABEL = {
  complete_visibility_required: 'rg -u required',
  source_only:                  'default rg OK',
  generated_artifacts_allowed:  'rg -u preferred',
  safe_to_respect_gitignore:    'skip / ignore OK',
};

function main() {
  // Augment static map with existence check
  const entries = STATIC_ROLE_MAP.map(e => ({
    ...e,
    exists: existsSync(join(REPO_ROOT, e.path)),
    rgModeLabel: RG_LABEL[e.rg_mode] ?? e.rg_mode,
  }));

  // Detect unclassified top-level dirs
  const topDirs = readdirSync(REPO_ROOT).filter(name => {
    if (name.startsWith('.') || name === 'node_modules') return false;
    try { return statSync(join(REPO_ROOT, name)).isDirectory(); } catch { return false; }
  });

  for (const name of topDirs) {
    const known = STATIC_ROLE_MAP.some(e => e.path === name || e.path.startsWith(name + '/'));
    if (!known) {
      entries.push({
        path: name,
        role: 'unknown',
        rg_mode: 'complete_visibility_required',
        rgModeLabel: 'rg -u required',
        owner: 'Unclassified — add to STATIC_ROLE_MAP',
        exists: true,
      });
    }
  }

  const byRole = {};
  for (const e of entries) (byRole[e.role] ??= []).push(e);

  const unknowns = entries.filter(e => e.role === 'unknown');
  const allPass  = unknowns.length === 0;

  if (!JSON_OUT) {
    console.log(`\n${C.bold}── Directory Role Analysis ──${C.reset}\n`);
    for (const role of Object.keys(byRole).sort()) {
      console.log(`  ${C.cyan}${role}${C.reset}`);
      for (const e of byRole[role]) {
        const flag = e.exists ? '' : ` ${C.gray}(missing)${C.reset}`;
        const icon = e.role === 'unknown' ? `${C.yellow}?${C.reset}` : `${C.green}·${C.reset}`;
        console.log(`    ${icon} ${e.path.padEnd(56)} ${C.gray}${e.rgModeLabel}${C.reset}${flag}`);
      }
    }
    if (unknowns.length) {
      console.log(`\n  ${C.yellow}⚠ ${unknowns.length} unclassified — add to STATIC_ROLE_MAP in analyze-directory-roles.mjs${C.reset}`);
    }
    console.log(`\n  ${allPass ? `${C.green}PASS${C.reset}` : `${C.yellow}WARN${C.reset}`} — ${entries.length} entries\n`);
  }

  const report = { generatedAt: new Date().toISOString(), totalEntries: entries.length, unknownCount: unknowns.length, status: allPass ? 'pass' : 'warn', byRole, entries };

  if (!DRY_RUN) {
    mkdirSync(REPORTS_DIR, { recursive: true });
    mkdirSync(GRAPH_DIR,   { recursive: true });
    writeFileSync(join(GRAPH_DIR,   'directory-role-map.json'),       JSON.stringify(report, null, 2));
    writeFileSync(join(REPORTS_DIR, 'directory-analysis-report.md'),  buildMd(entries, byRole));
    if (!JSON_OUT) {
      console.log(`  ${C.gray}→ docs/graph/directory-role-map.json${C.reset}`);
      console.log(`  ${C.gray}→ docs/reports/directory-analysis-report.md${C.reset}\n`);
    }
  }

  if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

function buildMd(entries, byRole) {
  return [
    '# Directory Role Map',
    `_Generated: ${new Date().toISOString()}_`,
    '',
    '## Summary',
    '| Role | Count |',
    '|------|-------|',
    ...Object.entries(byRole).map(([r, items]) => `| \`${r}\` | ${items.length} |`),
    '',
    '## All Entries',
    '| Path | Role | rg Mode | Owner |',
    '|------|------|---------|-------|',
    ...entries.map(e => `| \`${e.path}\` | \`${e.role}\` | ${e.rgModeLabel} | ${e.owner} |`),
  ].join('\n');
}

main();

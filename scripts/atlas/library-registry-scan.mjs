#!/usr/bin/env node
/**
 * Library Registry Scan
 *
 * Populates the library_identities table (npm + pip) and writes a JSON
 * snapshot. Addressing scheme: "npm:pkg@version" / "pip:pkg@version".
 *
 * npm phase scans package-lock.json (lockfileVersion 3) at repo root and
 * sveltekit-frontend/. pip phase scans the miniforge NLP sidecar's Python
 * interpreter (plain CPython 3.13 at C:\Python313\python.exe by default,
 * override via MINIFORGE_PYTHON).
 *
 * Tier 1 (name/version/exports/types) is populated for every discovered
 * package. Tier 2 (declaration file paths, no content) is populated only
 * for an explicit allow-list. Tier 3/4 (implementation content) are never
 * written here — see fetch-tier-content.ts for on-demand resolution.
 *
 * Usage:
 *   node scripts/library-registry-scan.mjs
 *   node scripts/library-registry-scan.mjs --json=docs/reports/library-registry.json
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { REPO_ROOT, resolveRepoPath, readJson } from './_atlas-utils.mjs';

const { Pool } = pg;

const args = process.argv.slice(2);
const jsonArg = args.find((a) => a.startsWith('--json='));
const jsonOutPath = jsonArg
  ? jsonArg.slice('--json='.length)
  : `docs/reports/library-registry-${new Date().toISOString().slice(0, 10)}.json`;

const TIER2_ALLOWLIST = new Set([
  'ts-morph',
  '@playwright/test',
  '@qdrant/js-client-rest',
  'tree-sitter',
  'tree-sitter-language-pack',
  'ast-grep-py',
  'spacy',
  'langextract',
  'torch',
]);

const MINIFORGE_PYTHON = process.env.MINIFORGE_PYTHON || 'C:\\Python313\\python.exe';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function makeAddress(manager, name, version) {
  return `${manager}:${name}@${version}`;
}

// ── npm phase ────────────────────────────────────────────────────────────
function scanNpmRoot(rootRel, workspaceRoot) {
  const rootAbs = resolveRepoPath(rootRel);
  const lockPath = path.join(rootAbs, 'package-lock.json');
  if (!existsSync(lockPath)) {
    console.warn(`[npm] no package-lock.json at ${rootRel}, skipping`);
    return [];
  }
  const lock = readJson(lockPath, null);
  if (!lock?.packages) {
    console.warn(`[npm] unreadable/unexpected lockfile shape at ${rootRel}, skipping`);
    return [];
  }
  const rows = [];
  for (const [pkgPath, entry] of Object.entries(lock.packages)) {
    if (pkgPath === '') continue; // the root project entry itself
    if (entry?.link) continue; // symlink pointer duplicating a workspace entry captured below
    if (!entry?.version) continue;

    // Two shapes in lockfileVersion 3:
    //   "packages/atlas-core"                       — the workspace package itself (no node_modules/ prefix)
    //   "node_modules/x" or "packages/y/node_modules/x" — a regular/nested dependency; name is the
    //     segment after the LAST "node_modules/" occurrence (handles per-workspace nested duplicates)
    const isWorkspaceRoot = !pkgPath.includes('node_modules/');
    const name = isWorkspaceRoot ? entry.name ?? pkgPath.split('/').pop() : pkgPath.split('node_modules/').pop();

    const installationPath = path.join(rootAbs, pkgPath);
    const pkgJsonPath = path.join(installationPath, 'package.json');
    let tier1 = {};
    let packageJsonDigest = null;
    if (existsSync(pkgJsonPath)) {
      const raw = readFileSync(pkgJsonPath, 'utf8');
      packageJsonDigest = sha256(raw);
      try {
        const parsed = JSON.parse(raw);
        tier1 = {
          exports: parsed.exports,
          types: parsed.types ?? parsed.typings,
          main: parsed.main,
          description: parsed.description,
        };
      } catch {
        // leave tier1 empty on parse failure
      }
    }

    const lockfileDigest = entry.integrity ?? sha256(JSON.stringify(entry));
    const isVendored = pkgPath.includes('/vendor/');
    const sourceType = isVendored ? 'vendored' : isWorkspaceRoot ? 'workspace' : 'dependency';

    let tier2Paths = null;
    if (TIER2_ALLOWLIST.has(name)) {
      tier2Paths = collectDeclarationFiles(installationPath);
    }

    rows.push({
      address: makeAddress('npm', name, entry.version),
      packageManager: 'npm',
      packageName: name,
      packageVersion: entry.version,
      lockfileDigest,
      packageJsonDigest,
      installationPath,
      sourceType,
      workspaceRoot,
      tier1,
      tier2Paths,
    });
  }
  return rows;
}

function collectDeclarationFiles(dir, depth = 0, out = []) {
  if (depth > 3 || !existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'test', 'tests', '__pycache__'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectDeclarationFiles(full, depth + 1, out);
    } else if (/\.d\.ts$|\.pyi$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// ── pip phase ────────────────────────────────────────────────────────────
function scanPip() {
  if (!existsSync(MINIFORGE_PYTHON)) {
    console.warn(`[pip] interpreter not found at ${MINIFORGE_PYTHON}, skipping`);
    return [];
  }
  let list;
  try {
    const out = execFileSync(MINIFORGE_PYTHON, ['-m', 'pip', 'list', '--format=json'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    list = JSON.parse(out);
  } catch (err) {
    console.warn(`[pip] pip list failed: ${err.message}`);
    return [];
  }

  const rows = [];
  for (const { name, version } of list) {
    let show;
    try {
      const out = execFileSync(MINIFORGE_PYTHON, ['-m', 'pip', 'show', name], { encoding: 'utf8' });
      show = Object.fromEntries(
        out.split('\n').filter((l) => l.includes(': ')).map((l) => {
          const idx = l.indexOf(': ');
          return [l.slice(0, idx).trim(), l.slice(idx + 2).trim()];
        })
      );
    } catch {
      show = {};
    }
    const location = show.Location || '';
    const editableLocation = show['Editable project location'];
    const installationPath = editableLocation || (location ? path.join(location, name.replace(/-/g, '_')) : '');
    const distInfoDir = location
      ? findDistInfoDir(location, name, version)
      : null;

    let packageJsonDigest = null;
    let lockfileDigest = null;
    if (distInfoDir) {
      const metadataPath = path.join(distInfoDir, 'METADATA');
      const recordPath = path.join(distInfoDir, 'RECORD');
      if (existsSync(metadataPath)) packageJsonDigest = sha256(readFileSync(metadataPath, 'utf8'));
      if (existsSync(recordPath)) lockfileDigest = sha256(readFileSync(recordPath, 'utf8'));
    }

    let tier2Paths = null;
    if (TIER2_ALLOWLIST.has(name) && installationPath && existsSync(installationPath)) {
      tier2Paths = collectDeclarationFiles(installationPath);
    }

    rows.push({
      address: makeAddress('pip', name, version),
      packageManager: 'pip',
      packageName: name,
      packageVersion: version,
      lockfileDigest,
      packageJsonDigest,
      installationPath: installationPath || location || 'unknown',
      sourceType: editableLocation ? 'vendored' : 'dependency',
      workspaceRoot: 'miniforge-sidecar',
      tier1: { description: show.Summary },
      tier2Paths,
    });
  }
  return rows;
}

function findDistInfoDir(sitePackagesDir, name, version) {
  if (!existsSync(sitePackagesDir)) return null;
  // PEP 503-style normalization: lowercase, collapse -/_/. runs to a single "-"
  const norm = (s) => s.toLowerCase().replace(/[-_.]+/g, '-');
  const target = `${norm(name)}-${norm(version)}`;
  try {
    const match = readdirSync(sitePackagesDir).find((d) => {
      if (!d.endsWith('.dist-info') && !d.endsWith('.egg-info')) return false;
      const stem = d.replace(/\.(dist-info|egg-info)$/, '');
      return norm(stem) === target || norm(stem).startsWith(`${norm(name)}-`);
    });
    return match ? path.join(sitePackagesDir, match) : null;
  } catch {
    return null;
  }
}

// ── write path ───────────────────────────────────────────────────────────
async function upsertRows(pool, rows) {
  let count = 0;
  for (const row of rows) {
    await pool.query(
      `INSERT INTO library_identities
         (address, package_manager, package_name, package_version, lockfile_digest,
          package_json_digest, installation_path, source_type, workspace_root, tier1, tier2_paths, scanned_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (address) DO UPDATE SET
         lockfile_digest = EXCLUDED.lockfile_digest,
         package_json_digest = EXCLUDED.package_json_digest,
         installation_path = EXCLUDED.installation_path,
         source_type = EXCLUDED.source_type,
         workspace_root = EXCLUDED.workspace_root,
         tier1 = EXCLUDED.tier1,
         tier2_paths = EXCLUDED.tier2_paths,
         scanned_at = now()`,
      [
        row.address,
        row.packageManager,
        row.packageName,
        row.packageVersion,
        row.lockfileDigest,
        row.packageJsonDigest,
        row.installationPath,
        row.sourceType,
        row.workspaceRoot,
        JSON.stringify(row.tier1 ?? {}),
        row.tier2Paths ? JSON.stringify(row.tier2Paths) : null,
      ]
    );
    count++;
  }
  return count;
}

async function main() {
  console.log('\n📚 LIBRARY REGISTRY SCAN\n');

  const rows = [
    ...scanNpmRoot('.', 'root'),
    ...scanNpmRoot('sveltekit-frontend', 'sveltekit-frontend'),
    ...scanPip(),
  ];

  console.log(`Discovered ${rows.length} packages (npm root + sveltekit-frontend + pip sidecar)`);

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set — cannot write to Postgres');
    process.exit(1);
  }
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 });
  pool.on('error', () => {});

  try {
    const written = await upsertRows(pool, rows);
    console.log(`Upserted ${written} rows into library_identities`);
  } finally {
    await pool.end().catch(() => {});
  }

  const fullJsonPath = path.join(REPO_ROOT, jsonOutPath);
  mkdirSync(path.dirname(fullJsonPath), { recursive: true });
  writeFileSync(fullJsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  console.log(`JSON snapshot: ${jsonOutPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

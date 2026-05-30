#!/usr/bin/env node
/**
 * append-dir-agents-llms.mjs
 *
 * Temporal-append directory analyser.
 * Walks every directory that contains source files and APPENDS (never deletes)
 * a timestamped analysis section to that directory's AGENTS.md and LLMS.md.
 *
 * Contract:
 *  - Never truncate or overwrite existing content.
 *  - Every run appends a new <!--atlas-append ... --> fenced section.
 *  - Skips directories that already have an entry for today (--force overrides).
 *  - The feature map produced by build-codebase-feature-map.mjs is the input.
 *
 * Usage:
 *   node scripts/atlas/append-dir-agents-llms.mjs
 *   node scripts/atlas/append-dir-agents-llms.mjs --dry-run
 *   node scripts/atlas/append-dir-agents-llms.mjs --limit 20
 *   node scripts/atlas/append-dir-agents-llms.mjs --force           # re-append even if today exists
 *   node scripts/atlas/append-dir-agents-llms.mjs --dir sveltekit-frontend/src
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPO_ROOT, loadConfig, collectFiles, readJson, readText, toPosixPath, resolveRepoPath,
} from './_atlas-utils.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const argv  = process.argv.slice(2);

const DRY_RUN  = argv.includes('--dry-run');
const FORCE    = argv.includes('--force');
const VERBOSE  = argv.includes('--verbose');
const LIMIT_I  = argv.indexOf('--limit');
const LIMIT    = LIMIT_I >= 0 ? parseInt(argv[LIMIT_I + 1], 10) : Infinity;
const DIR_I    = argv.indexOf('--dir');
const SCOPE_DIR = DIR_I >= 0 ? resolveRepoPath(argv[DIR_I + 1]) : null;

const FEATURE_MAP_PATH = resolveRepoPath('.tmp/codebase-feature-map.json');
const TODAY = new Date().toISOString().slice(0, 10);
const NOW   = new Date().toISOString();

const config   = loadConfig();
const IGNORE   = new Set([...config.ignoreDirs, '.opencode', '.gemini', '.cache', 'backups', 'archive', 'lawpdfs', 'models', 'logs', 'tmp', '.tmp', 'node_modules', '.git', 'build', 'dist', '.svelte-kit']);

// ── Source file extensions that count as "populated" directories ───────────────
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.svelte', '.py', '.go', '.sql', '.sh']);

// ── Load feature map for semantic context ─────────────────────────────────────
function loadFeatureMap() {
  if (!fs.existsSync(FEATURE_MAP_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(FEATURE_MAP_PATH, 'utf8'));
  } catch { return null; }
}

// ── Collect all directories that have source files ────────────────────────────
function collectSourceDirs(root) {
  const dirs = new Set();
  if (!fs.existsSync(root)) return dirs;
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    let hasSource = false;
    for (const e of entries) {
      if (IGNORE.has(e.name)) continue;
      if (e.isDirectory()) {
        walk(path.join(dir, e.name));
      } else if (SOURCE_EXTS.has(path.extname(e.name).toLowerCase())) {
        hasSource = true;
      }
    }
    if (hasSource) dirs.add(dir);
  }
  walk(root);
  return dirs;
}

// ── Check whether a file already has a section for today ──────────────────────
function alreadyAppendedToday(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes(`atlas-append date="${TODAY}"`);
}

// ── Build a AGENTS.md section for a directory ────────────────────────────────
function buildAgentsSection(dirRel, filesInDir, featureAreas) {
  const lines = [
    ``,
    `<!-- atlas-append date="${TODAY}" ts="${NOW}" tool="append-dir-agents-llms" -->`,
    `## Directory Analysis — ${TODAY}`,
    ``,
    `**Path**: \`${dirRel}/\``,
    `**Source files**: ${filesInDir.length}`,
    ``,
  ];

  if (featureAreas.length > 0) {
    lines.push(`**Feature areas detected**:`);
    for (const fa of featureAreas.slice(0, 8)) {
      lines.push(`- ${fa.label} (${fa.fileCount} files, confidence ${fa.confidence ?? 'n/a'})`);
    }
    lines.push('');
  }

  // List top-5 files
  lines.push(`**Key files**:`);
  for (const f of filesInDir.slice(0, 5)) {
    lines.push(`- \`${path.basename(f)}\``);
  }
  lines.push('');
  lines.push(`<!-- /atlas-append -->`);
  return lines.join('\n');
}

// ── Build a LLMS.md section for a directory ──────────────────────────────────
function buildLlmsSection(dirRel, filesInDir, featureAreas) {
  const lines = [
    ``,
    `<!-- atlas-append date="${TODAY}" ts="${NOW}" tool="append-dir-agents-llms" -->`,
    `## LLM Context — ${dirRel} — ${TODAY}`,
    ``,
  ];

  if (featureAreas.length > 0) {
    lines.push(`This directory is part of the following feature areas:`);
    for (const fa of featureAreas.slice(0, 5)) {
      lines.push(`- **${fa.label}**: ${fa.description ?? ''}`);
    }
    lines.push('');
  }

  lines.push(`Source files (${filesInDir.length} total):`);
  for (const f of filesInDir.slice(0, 10)) {
    lines.push(`- \`${path.basename(f)}\``);
  }
  if (filesInDir.length > 10) lines.push(`- …and ${filesInDir.length - 10} more`);
  lines.push('');
  lines.push(`<!-- /atlas-append -->`);
  return lines.join('\n');
}

// ── Append text to a file (create with header if new) ────────────────────────
function appendToFile(filePath, header, section) {
  if (DRY_RUN) {
    if (VERBOSE) console.log(`  [dry-run] would append to ${filePath}`);
    return;
  }
  let existing = '';
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, 'utf8');
  } else {
    existing = header + '\n';
  }
  // Ensure trailing newline before appending
  if (!existing.endsWith('\n')) existing += '\n';
  fs.writeFileSync(filePath, existing + section + '\n', 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[dir-append] Temporal AGENTS.md/LLMS.md appender`);
  console.log(`[dir-append] date=${TODAY}  dry=${DRY_RUN}  force=${FORCE}  limit=${isFinite(LIMIT) ? LIMIT : 'all'}`);

  const featureMap = loadFeatureMap();
  if (!featureMap) {
    console.warn('[dir-append] No feature map found at .tmp/codebase-feature-map.json — run Stage 1 first');
    console.warn('[dir-append] Continuing without semantic feature context…');
  }

  // Build lookup: relPath → feature areas
  const fileToFeatures = new Map();
  if (featureMap?.featureAreas) {
    for (const fa of featureMap.featureAreas) {
      for (const f of (fa.files ?? [])) {
        if (!fileToFeatures.has(f)) fileToFeatures.set(f, []);
        fileToFeatures.get(f).push(fa);
      }
    }
  }

  // Collect directories to process
  const scanRoot = SCOPE_DIR ?? REPO_ROOT;
  const dirs = [...collectSourceDirs(scanRoot)];
  console.log(`[dir-append] Found ${dirs.length} source directories`);

  let processed = 0, skipped = 0, written = 0;

  for (const absDir of dirs) {
    if (processed >= LIMIT) break;

    const dirRel = toPosixPath(path.relative(REPO_ROOT, absDir));

    // Collect source files in this dir (non-recursive, top-level only)
    let entries;
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { continue; }
    const filesInDir = entries
      .filter(e => e.isFile() && SOURCE_EXTS.has(path.extname(e.name).toLowerCase()))
      .map(e => path.join(absDir, e.name));

    if (filesInDir.length === 0) { skipped++; continue; }

    // Find feature areas that cover files in this directory
    const featureAreas = [];
    const seen = new Set();
    for (const f of filesInDir) {
      const relF = toPosixPath(path.relative(REPO_ROOT, f));
      for (const fa of (fileToFeatures.get(relF) ?? [])) {
        if (!seen.has(fa.label)) { seen.add(fa.label); featureAreas.push(fa); }
      }
    }

    const agentsPath = path.join(absDir, 'AGENTS.md');
    const llmsPath   = path.join(absDir, 'LLMS.md');

    // Skip if already done today (unless --force)
    const agentsNeedsUpdate = FORCE || !alreadyAppendedToday(agentsPath);
    const llmsNeedsUpdate   = FORCE || !alreadyAppendedToday(llmsPath);

    if (!agentsNeedsUpdate && !llmsNeedsUpdate) {
      if (VERBOSE) console.log(`  [skip] ${dirRel} — already up-to-date for ${TODAY}`);
      skipped++;
      continue;
    }

    if (VERBOSE) console.log(`  [write] ${dirRel} (${filesInDir.length} files, ${featureAreas.length} features)`);

    if (agentsNeedsUpdate) {
      const header = `# AGENTS.md — ${dirRel}\n\n> Auto-managed by Atlas pipeline. Append-only — never delete sections.\n`;
      const section = buildAgentsSection(dirRel, filesInDir, featureAreas);
      appendToFile(agentsPath, header, section);
      written++;
    }

    if (llmsNeedsUpdate) {
      const header = `# LLMS.md — ${dirRel}\n\n> Auto-managed by Atlas pipeline. Append-only — never delete sections.\n`;
      const section = buildLlmsSection(dirRel, filesInDir, featureAreas);
      appendToFile(llmsPath, header, section);
      written++;
    }

    processed++;
  }

  console.log(`\n[dir-append] Done`);
  console.log(`  Directories processed : ${processed}`);
  console.log(`  Directories skipped   : ${skipped}`);
  console.log(`  Files written/updated : ${written}${DRY_RUN ? ' (dry-run)' : ''}`);
}

main().catch(e => { console.error('[dir-append] Fatal:', e); process.exit(1); });

#!/usr/bin/env node
// scripts/fix-svelte-phase5.mjs
// Combined cleanup toolkit (Svelte + TypeScript + WASM repairs)
// - Backs up files before editing (to scripts/backups/<timestamp>)
// - Fixes <script, lang="ts"> and related comma corruptions
// - Fixes common import, {, ,} and return, patterns
// - Attempts to fix AssemblyScript parameter/return comma issues in src/wasm/*.ts
// - Writes a log of changed files and a statistics summary

import fs from 'fs';
import path from 'path';

const ROOT_SVELTE = path.join(process.cwd(), 'sveltekit-frontend', 'src');
const WASM_DIR = path.join(process.cwd(), 'sveltekit-frontend', 'src', 'wasm');
const TIMESTAMP = Date.now();
const BACKUP_DIR = path.join(process.cwd(), 'scripts', 'backups', `phase5-${TIMESTAMP}`);
const LOG_DIR = path.join(process.cwd(), 'scripts', 'logs');
const LOG_FILE = path.join(LOG_DIR, `fix-svelte-phase5-${TIMESTAMP}.log`);

const changed = [];
const backedUp = [];
let scanned = 0;
let fixed = 0;

// CLI flags
const APPLY = process.argv.includes('--run') || process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

function usage() {
  console.log('Usage: node scripts/fix-svelte-phase5.mjs [--run|--apply] [--verbose]');
  console.log('  --run / --apply   Actually write changes and create backups. Without it the script runs in dry-run mode.');
  console.log('  --verbose         Print file-level diffs for changed files.');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function backupFile(filePath) {
  ensureDir(BACKUP_DIR);
  const rel = path.relative(process.cwd(), filePath);
  const dest = path.join(BACKUP_DIR, rel);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(filePath, dest);
  backedUp.push(rel);
}

function processFile(file) {
  scanned++;
  const original = fs.readFileSync(file, 'utf8');
  let updated = original;

  // Svelte <script> tag fixes
  updated = updated.replace(/<script\s*,\s*(lang|context|module)(=|\s)/g, '<script $1$2');
  updated = updated.replace(/<script\s*,/g, '<script ');

  // import, fixes
  updated = updated.replace(/\bimport\s*,/g, 'import ');
  updated = updated.replace(/\bimport,\s*/g, 'import ');

  // Object brace fixes
  updated = updated.replace(/\{\s*,/g, '{');
  updated = updated.replace(/,\s*\}/g, '}');

  // fix return, X -> return X
  updated = updated.replace(/return\s*,\s*/g, 'return ');

  // Fix AssemblyScript parameter corruption: patterns like "aPtr, usize, bPtr: usize" -> "aPtr: usize, bPtr: usize"
  updated = updated.replace(/([A-Za-z0-9_]+)\s*,\s*usize\s*,/g, '$1: usize,');
  updated = updated.replace(/([A-Za-z0-9_]+)\s*,\s*i32\s*,/g, '$1: i32,');
  updated = updated.replace(/([A-Za-z0-9_]+)\s*,\s*f32\s*,/g, '$1: f32,');

  // Tidy multiple consecutive commas
  updated = updated.replace(/,\s*,+/g, ',');

  if (updated !== original) {
    changed.push(path.relative(process.cwd(), file));
    if (APPLY) {
      backupFile(file);
      fs.writeFileSync(file, updated, 'utf8');
      fixed++;
      if (VERBOSE) {
        console.log(`Edited: ${file}`);
      }
    } else {
      // dry-run: report potential change
      if (VERBOSE) {
        console.log(`Would edit: ${file}`);
      }
    }
  }
}

function walkAndProcess(dir, extRegex = /\.(svelte|ts)$/) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkAndProcess(full, extRegex);
    else if (extRegex.test(full)) processFile(full);
  }
}

// Run on Svelte + TS source
console.log('🔧 Running Phase5 cleanup...');
ensureDir(LOG_DIR);

if (!APPLY) {
  console.log('ℹ️  Running in dry-run mode. No files will be modified. Use --run to apply changes.');
}

try {
  walkAndProcess(ROOT_SVELTE);
  // Also target WASM directory explicitly for AssemblyScript-like fixes
  if (fs.existsSync(WASM_DIR)) walkAndProcess(WASM_DIR, /\.ts$/);

  const lines = [];
  lines.push(`DryRun: ${!APPLY}`);
  lines.push(`Scanned: ${scanned}`);
  lines.push(`Fixed (written): ${fixed}`);
  lines.push('');
  lines.push('Backups:');
  lines.push(...backedUp);
  lines.push('');
  lines.push('Changed files:');
  lines.push(...changed);

  fs.writeFileSync(LOG_FILE, lines.join('\n'), 'utf8');

  console.log('✨ Phase5 cleanup complete');
  console.log(`   Scanned: ${scanned}`);
  console.log(`   Potential changes: ${changed.length}`);
  console.log(`   Files actually modified: ${fixed}`);
  if (APPLY) console.log(`   Backups: ${BACKUP_DIR}`);
  console.log(`   Log: ${LOG_FILE}`);
  if (!APPLY) console.log('Run with --run to apply these changes and create backups.');
} catch (e) {
  console.error('❌ Phase5 cleanup failed:', e.message);
  process.exitCode = 2;
}

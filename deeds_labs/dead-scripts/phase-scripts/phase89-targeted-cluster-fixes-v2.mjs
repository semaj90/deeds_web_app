#!/usr/bin/env node
/**
 * Phase 89: Targeted Cluster Fixes (v2)
 * - Runs in frontend cwd
 * - Forces NODE_ENV=development for svelte-check
 * - Supports --dry-run for preview
 */

import { execSync } from 'child_process';
import { glob } from 'glob';
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_DIR = process.cwd();
process.env.NODE_ENV = 'development';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function log(msg) { console.log(msg); }

function getErrorCount() {
  try {
    execSync('npx svelte-check --threshold error', {
      cwd: FRONTEND_DIR,
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    return 0;
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const m = out.match(/found (\d+) errors/);
    return m ? parseInt(m[1]) : -1;
  }
}

async function findCssFiles() {
  const patterns = ['src/**/*.css', 'src/**/*.svelte'];
  const files = new Set();
  for (const p of patterns) {
    for (const f of await glob(p, { cwd: FRONTEND_DIR, absolute: true })) {
      files.add(f);
    }
  }
  return Array.from(files);
}

async function fixSplitGlobalSelectors() {
  log('\n📊 Cluster 1: Split Global Selectors');
  log('Pattern: `: global(` → `:global(`\n');
  const files = await findCssFiles();
  let fixCount = 0; const fixedFiles = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const pattern1 = /:\s+global\(/g;
    const pattern2 = /:\s+global\s/g;
    if (pattern1.test(content) || pattern2.test(content)) {
      const fixed = content.replace(pattern1, ':global(').replace(pattern2, ':global ');
      if (!DRY_RUN) fs.writeFileSync(file, fixed, 'utf-8');
      fixedFiles.push(path.relative(FRONTEND_DIR, file));
      fixCount += ((content.match(pattern1) || []).length + (content.match(pattern2) || []).length);
    }
  }
  log(`✅ ${DRY_RUN ? 'Would fix' : 'Fixed'} ${fixCount} split global selectors in ${fixedFiles.length} files\n`);
  return { fixCount, files: fixedFiles };
}

async function fixMalformedKeyframes() {
  log('\n📊 Cluster 2: Malformed Keyframes');
  log('Pattern: quoted percentages inside keyframes → unquoted\n');
  const files = await findCssFiles();
  let fixCount = 0; const fixedFiles = [];
  const pattern = /"(\d+)"%/g;
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    if (pattern.test(content)) {
      const fixed = content.replace(pattern, '$1%');
      if (!DRY_RUN) fs.writeFileSync(file, fixed, 'utf-8');
      fixedFiles.push(path.relative(FRONTEND_DIR, file));
      fixCount += (content.match(pattern) || []).length;
    }
  }
  log(`✅ ${DRY_RUN ? 'Would fix' : 'Fixed'} ${fixCount} malformed keyframes in ${fixedFiles.length} files\n`);
  return { fixCount, files: fixedFiles };
}

async function fixTS1005Errors() {
  log('\n📊 Cluster 3: TypeScript TS1005 Errors');
  log('Pattern: Missing commas/semicolons at object/type boundaries\n');
  // Collect errors
  let out = ''; let errors = [];
  try {
    execSync('npx svelte-check --threshold error', {
      cwd: FRONTEND_DIR,
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'pipe',
      encoding: 'utf-8'
    });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const re = /(.+?)\((\d+),(\d+)\):\s+error TS1005:\s+(.+)/g;
  let m; while ((m = re.exec(out)) !== null) {
    errors.push({ file: path.resolve(FRONTEND_DIR, m[1]), line: parseInt(m[2]), column: parseInt(m[3]), message: m[4] });
  }
  if (errors.length === 0) { log('✅ No TS1005 errors found in this pass'); return { fixCount: 0, files: [] }; }
  // Group by file
  const byFile = new Map();
  for (const e of errors.slice(0, 50)) {
    const arr = byFile.get(e.file) || []; arr.push(e); byFile.set(e.file, arr);
  }
  let fixCount = 0; const fixedFiles = [];
  for (const [file, fileErrors] of byFile.entries()) {
    const content = fs.readFileSync(file, 'utf-8'); const lines = content.split('\n'); let changed = false;
    for (const e of fileErrors) {
      const idx = e.line - 1; const line = lines[idx]; if (!line) continue;
      if (e.message.includes("',' expected")) {
        const fixed = line.replace(/(\w+:\s*[^,\s]+)\s+(\w+:)/g, '$1, $2');
        if (fixed !== line) { lines[idx] = fixed; fixCount++; changed = true; }
      }
      if (e.message.includes("';' expected")) {
        const fixed = line.replace(/(\w+:\s*\w+)\s*$/g, '$1;');
        if (fixed !== line) { lines[idx] = fixed; fixCount++; changed = true; }
      }
    }
    if (changed && !DRY_RUN) { fs.writeFileSync(file, lines.join('\n'), 'utf-8'); fixedFiles.push(path.relative(FRONTEND_DIR, file)); }
    if (changed && DRY_RUN) { fixedFiles.push(path.relative(FRONTEND_DIR, file)); }
  }
  log(`✅ ${DRY_RUN ? 'Would fix' : 'Fixed'} ${fixCount} TS1005 errors in ${fixedFiles.length} files\n`);
  return { fixCount, files: fixedFiles };
}

async function main() {
  log('\n🚀 Targeted Cluster Fixes v2');
  const initial = getErrorCount();
  log(`\n📊 Initial error count: ${initial}`);
  const r1 = await fixSplitGlobalSelectors();
  const r2 = await fixMalformedKeyframes();
  const r3 = await fixTS1005Errors();
  const final = DRY_RUN ? initial : getErrorCount();
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('\n📊 Summary');
  log(`Total ${DRY_RUN ? 'potential ' : ''}fixes: ${r1.fixCount + r2.fixCount + r3.fixCount}`);
  log(`Cluster1: ${r1.fixCount} | Cluster2: ${r2.fixCount} | Cluster3: ${r3.fixCount}`);
  log(`Error count: ${initial} → ${final}`);
  log('\n✅ Completed');
}

main().catch(err => { console.error(err); process.exit(1); });

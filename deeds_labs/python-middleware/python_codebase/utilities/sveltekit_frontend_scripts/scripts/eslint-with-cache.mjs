#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

const ROOT = process.cwd();
const FRONTEND_SRC = path.join(ROOT, 'sveltekit-frontend', 'src');
const REPORT_DIR = path.join(ROOT, 'sveltekit-frontend', 'test-reports');
const CACHE_FILE = path.join(ROOT, 'sveltekit-frontend', '.eslint-cache.json');
const ESLINT_RESULTS = path.join(REPORT_DIR, 'eslint-results.json');

// file extensions to consider
const EXTS = ['.js', '.ts', '.svelte'];

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.svelte-kit' || name === 'dist' || name === 'build') continue;
      out.push(...walk(p));
    } else if (st.isFile()) {
      if (EXTS.includes(path.extname(name))) out.push(p);
    }
  }
  return out;
}

function hashFile(file) {
  const data = fs.readFileSync(file);
  return crypto.createHash('sha1').update(data).digest('hex');
}

// Ensure report dir
fs.mkdirSync(REPORT_DIR, { recursive: true });

const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
const files = walk(FRONTEND_SRC);
const toLint = [];
const results = [];
let hadError = false;

for (const f of files) {
  try {
    const h = hashFile(f);
    if (cache[f] && cache[f].hash === h && cache[f].result) {
      // reuse cached result
      results.push(...(cache[f].result || []));
    } else {
      toLint.push(f);
    }
  } catch (e) {
    toLint.push(f);
  }
}

console.log(`Found ${files.length} source files. ${toLint.length} need linting (cache hit: ${files.length - toLint.length})`);

if (toLint.length > 0) {
  // run eslint on changed files and capture JSON output
  const args = ['-f', 'json', '--config', 'sveltekit-frontend/eslint.config.js', '--ext', '.js,.ts,.svelte', ...toLint];
  const res = spawnSync('npx', ['eslint', ...args], { encoding: 'utf8', shell: true });
  if (res.error) {
    console.error('Failed to run eslint:', res.error);
    process.exit(1);
  }
  const out = res.stdout.trim();
  try {
    const parsed = out ? JSON.parse(out) : [];
    // append to results and update cache per file
    for (const fileResult of parsed) {
      results.push(fileResult);
      const h = hashFile(fileResult.filePath || fileResult.file || fileResult.filePath);
      cache[fileResult.filePath] = { hash: h, result: [fileResult] };
    }
    if (parsed.some(r => r.errorCount || r.warningCount)) hadError = true;
  } catch (e) {
    console.warn('ESLint produced non-JSON output or empty results. Output head:', out.slice(0, 400));
  }
}

// write aggregated results
fs.writeFileSync(ESLINT_RESULTS, JSON.stringify(results, null, 2));
fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

console.log(`Wrote eslint results: ${ESLINT_RESULTS}`);
if (hadError) process.exit(1);
else process.exit(0);

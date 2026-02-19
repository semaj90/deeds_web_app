#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const child_process = require('child_process');

const ROOT = process.cwd();
const FRONTEND_SRC = path.join(ROOT, 'sveltekit-frontend', 'src');
const REPORT_DIR = path.join(ROOT, 'sveltekit-frontend', 'test-reports');
const CACHE_FILE = path.join(ROOT, 'sveltekit-frontend', '.eslint-cache.json');
const ESLINT_RESULTS = path.join(REPORT_DIR, 'eslint-results.json');

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

fs.mkdirSync(REPORT_DIR, { recursive: true });

const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
const files = walk(FRONTEND_SRC);
// Normalize file paths for cache keys
const normFiles = new Set(files.map(f => path.normalize(f)));
const toLint = [];
const results = [];
let hadError = false;
let batchesExecuted = 0;
let prunedCount = 0;

for (const f of files) {
  try {
    const h = hashFile(f);
    if (cache[f] && cache[f].hash === h && cache[f].result) {
      results.push(...(cache[f].result || []));
    } else {
      toLint.push(f);
    }
  } catch (e) {
    toLint.push(f);
  }
}

// Prune cache entries for files that no longer exist on disk
for (const k of Object.keys(cache)) {
  const nk = path.normalize(k);
  if (!normFiles.has(nk)) {
    delete cache[k];
    prunedCount++;
  }
}

console.log(`Found ${files.length} source files. ${toLint.length} need linting (cache hit: ${files.length - toLint.length})`);
if (prunedCount) console.log(`Pruned ${prunedCount} stale cache entries from ${CACHE_FILE}`);

if (toLint.length > 0) {
  // CLI flags: --force to ignore cache, --batch-size N to tune windows command length
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const batchArgIndex = argv.indexOf('--batch-size');
  const BATCH_SIZE = batchArgIndex !== -1 && argv[batchArgIndex + 1] ? parseInt(argv[batchArgIndex + 1], 10) || 150 : 150; // keep command lengths reasonable on Windows
  if (force) {
    console.log('Force flag detected --force: ignoring cache and relinting all files');
    toLint.length = 0; // clear
    toLint.push(...files);
  }
  for (let i = 0; i < toLint.length; i += BATCH_SIZE) {
    const batch = toLint.slice(i, i + BATCH_SIZE);
    console.log(`Linting batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(toLint.length / BATCH_SIZE)} (${batch.length} files)`);
    batchesExecuted++; // Increment batch counter here

    for (const fileToLint of batch) {
      const args = ['eslint', '-f', 'json', '--config', 'sveltekit-frontend/eslint.config.js', '--ext', '.js,.ts,.svelte', fileToLint];
      const res = child_process.spawnSync('npx', args, { encoding: 'utf8', shell: true });

      if (res.error) {
        console.error(`Failed to run eslint for file ${fileToLint}:`, res.error);
        hadError = true;
        continue;
      }
      const out = ((res.stdout || '') + '\n' + (res.stderr || '')).trim();
      try {
        const parsed = out ? JSON.parse(out) : [];
        for (const fileResult of parsed) {
          results.push(fileResult);
          const fp = fileResult.filePath || fileResult.file;
          try {
            const h = hashFile(fp);
            cache[fp] = { hash: h, result: [fileResult] };
          } catch (e) {
            // ignore hash failures
          }
        }
        if (parsed.some(r => r.errorCount || r.warningCount || r.fatalErrorCount)) hadError = true;
      } catch (e) {
        console.warn(`ESLint produced non-JSON output or empty results for file ${fileToLint}. Output head:`, out.slice(0, 400));
        hadError = true;
      }
    }
  }
}

// Always write results and cache so downstream steps can operate even on partial/failing lint runs
try {
  fs.writeFileSync(ESLINT_RESULTS, JSON.stringify(results, null, 2));
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log(`Wrote eslint results: ${ESLINT_RESULTS}`);
} catch (e) {
  console.error('Failed to write eslint results or cache:', e);
  process.exit(2);
}

// Summary log
const total = files.length;
const changed = toLint.length;
const cacheHits = total - changed;
const hitPct = total > 0 ? Math.round((cacheHits / total) * 100) : 0;
console.log(`Summary: ${total} files scanned — ${changed} changed — ${cacheHits} cache hits (${hitPct}%) — ${batchesExecuted} batches executed`);

// Respect CONTINUE_ON_ERROR env or --continue-on-error CLI flag
const CONTINUE_ON_ERROR = process.env.CONTINUE_ON_ERROR === 'true' || process.env.CONTINUE_ON_ERROR === '1' || process.argv.includes('--continue-on-error');
if (hadError) {
  if (CONTINUE_ON_ERROR) {
    console.warn('Lint reported errors, but CONTINUE_ON_ERROR is set — exiting 0');
    process.exit(0);
  }
  process.exit(1);
} else {
  process.exit(0);
}

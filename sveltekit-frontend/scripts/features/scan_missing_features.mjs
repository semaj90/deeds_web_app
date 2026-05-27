#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const root = path.resolve(process.cwd());
const outDir = path.join(root, '.tmp');
await fs.mkdir(outDir, { recursive: true });

const exts = ['.md', '.markdown', '.json', '.yml', '.yaml', '.ndjson'];
const matches = [];

function isTextFile(file) {
  return exts.includes(path.extname(file).toLowerCase());
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p.includes('node_modules') || p.includes('.git') || p.includes('.cache')) continue;
      await walk(p);
    } else if (e.isFile() && isTextFile(p)) {
      try {
        const txt = await fs.readFile(p, 'utf8');
        // look for missing: [] or missing_features: [] (allow whitespace)
        const re = /(?:\bmissing\b|\bmissing_features\b)\s*:\s*\[\s*\]/i;
        if (re.test(txt)) {
          const stat = await fs.stat(p);
          matches.push({ path: path.relative(root, p).replace(/\\/g, '/'), mtime: stat.mtime.toISOString() });
        }
      } catch (err) {
        // ignore read errors
      }
    }
  }
}

await walk(root);

const out = { found: matches.length, files: matches };
await fs.writeFile(path.join(outDir, 'missing_features_report.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(`Scan complete — found ${matches.length} files. Report: .tmp/missing_features_report.json`);

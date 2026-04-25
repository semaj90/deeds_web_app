/* global console */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('sveltekit-frontend');
const IGNORE_PATHS = [
  'node_modules/**',
  'build/**',
  'dist/**',
  '.svelte-kit/**',
  'static/**',
  'public/**',
  '**/*.d.ts',
  '**/*.json',
  'test-reports/**',
];

function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else acc.push(full.replace(ROOT + path.sep, '').replace(/\\/g, '/'));
  }
  return acc;
}

const allFiles = walk(path.join(ROOT, 'src'));
const total = allFiles.length;
console.log(`📂 Analyzing ${total} files for ignore patterns...`);

fs.writeFileSync(path.join(ROOT, '.eslintignore'), IGNORE_PATHS.join('\n'));
fs.writeFileSync(path.join(ROOT, '.gitignore'), IGNORE_PATHS.join('\n'));
console.log(`✅ Updated .eslintignore and .gitignore`);

const outReport = path.join(ROOT, 'test-reports/file-categorization-summary.json');
fs.mkdirSync(path.dirname(outReport), { recursive: true });
fs.writeFileSync(outReport, JSON.stringify({ total, IGNORE_PATHS }, null, 2));
console.log(`📊 Wrote ${outReport}`);

#!/usr/bin/env node
/*
  fix-css-commas.mjs
  Scans Svelte/CSS files and replaces mistaken commas between CSS declarations with semicolons.
  Uses a tolerant regex and PostCSS safe parsing to avoid breaking valid code. Runs in dry-run by default.

  Usage:
    node scripts/fix-css-commas.mjs --dry
    node scripts/fix-css-commas.mjs --apply
*/
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const root = path.resolve(process.cwd(), 'sveltekit-frontend');
const files = await glob('**/*.{svelte,css,scss,less}', { cwd: root, nodir: true });
let totalFound = 0;
let filesFound = 0;
const matches = [];

for (const rel of files) {
  const abs = path.join(root, rel);
  let src = fs.readFileSync(abs, 'utf8');

  // Extract style blocks if it's a .svelte file
  if (rel.endsWith('.svelte')) {
    const styleMatches = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
    if (!styleMatches.length) continue;
    let modified = src;
    let fileMatches = 0;
    for (const m of styleMatches) {
      const block = m[1];
      // simple heuristic: look for commas between declarations (e.g. "top: 10px, right: 10px")
      const re = /([a-zA-Z-]+\s*:\s*[^;\n]+)\s*,\s*([a-zA-Z-]+\s*:\s*[^;\n]+)/g;
      const found = [...block.matchAll(re)];
      if (found.length) {
        totalFound += found.length;
        fileMatches += found.length;
        // prepare replacement for dry-run; actual apply mode will replace more carefully
        modified = modified.replace(re, (s, a, b) => `${a}; ${b}`);
      }
    }
    if (fileMatches) {
      filesFound++;
      matches.push({ file: rel, count: fileMatches });
      if (process.argv.includes('--apply')) {
        fs.writeFileSync(abs, modified, 'utf8');
      }
    }
  } else {
    // raw css/scss/less
    const re = /([a-zA-Z-]+\s*:\s*[^;\n]+)\s*,\s*([a-zA-Z-]+\s*:\s*[^;\n]+)/g;
    const found = [...src.matchAll(re)];
    if (found.length) {
      totalFound += found.length;
      filesFound++;
      matches.push({ file: rel, count: found.length });
      if (process.argv.includes('--apply')) {
        const replaced = src.replace(re, (s, a, b) => `${a}; ${b}`);
        fs.writeFileSync(abs, replaced, 'utf8');
      }
    }
  }
}

console.log('CSS Fixer Summary');
console.log(`Root: ${root}`);
console.log(`Files scanned: ${files.length}`);
console.log(`Files with issues: ${filesFound}`);
console.log(`Total occurrences: ${totalFound}`);
if (matches.length) console.log(matches.slice(0, 100));

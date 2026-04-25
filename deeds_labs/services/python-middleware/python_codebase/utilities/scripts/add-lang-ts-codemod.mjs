import fs from 'fs';
import path from 'path';

const root = path.resolve('sveltekit-frontend', 'src');
const exts = ['.svelte'];
let changed = 0;

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (exts.includes(path.extname(full))) processFile(full);
  }
}

function processFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  const original = src;

  // Heuristics: look for TS tokens that indicate TypeScript usage
  const hasTS = /\b(interface|type|as\s+[A-Za-z_$]|import\s+type|:\s*[A-Za-z_$][A-Za-z0-9_$<>\[\]]*)\b/.test(src);
  if (!hasTS) return;

  // Add lang="ts" to the first <script> tag that doesn't already have it
  src = src.replace(/<script(.*?)>/i, (m, attrs) => {
    if (/\blang\s*=\s*['\"]ts['\"]/i.test(attrs)) return m; // already has lang
    return `<script${attrs} lang="ts">`;
  });

  if (src !== original) {
    fs.writeFileSync(file, src, 'utf8');
    console.log('Patched', file);
    changed++;
  }
}

console.log('Running add-lang-ts codemod under', root);
if (!fs.existsSync(root)) {
  console.error('Path not found:', root);
  process.exit(1);
}
walk(root);
console.log('Done. Files changed:', changed);

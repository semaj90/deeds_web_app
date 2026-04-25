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

  // Replace common patterns: event.detail -> (event as CustomEvent).detail
  // Also replace `e.detail` and `evt.detail` variants conservatively.
  src = src.replace(/([\w\)\]\"'\s])([a-zA-Z_$][a-zA-Z0-9_$]{0,3})\.detail/g, (m, prefix, id) => {
    // avoid replacing `.detail` on known types like window.navigator? best-effort
    return `${prefix}(${id} as CustomEvent).detail`;
  });

  // Also handle direct `event.detail` patterns without prefix group
  src = src.replace(/\bevent\.detail\b/g, '(event as CustomEvent).detail');
  src = src.replace(/\bevt\.detail\b/g, '(evt as CustomEvent).detail');
  src = src.replace(/\be\.detail\b/g, '(e as CustomEvent).detail');

  if (src !== original) {
    fs.writeFileSync(file, src, 'utf8');
    console.log('Patched', file);
    changed++;
  }
}

console.log('Running event.detail codemod under', root);
if (!fs.existsSync(root)) {
  console.error('Path not found:', root);
  process.exit(1);
}
walk(root);
console.log('Done. Files changed:', changed);

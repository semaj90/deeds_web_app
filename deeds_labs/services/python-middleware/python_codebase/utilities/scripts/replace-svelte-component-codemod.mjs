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

  // Replace self-closing <svelte:component this={X} .../> with <X .../>
  src = src.replace(/<svelte:component\s+this=\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}(.*?)\/>/gs, (m, comp, rest) => {
    return `<${comp}${rest}/>`;
  });

  // Replace opening/closing pairs <svelte:component this={X}>...</svelte:component> with <X>...</X>
  src = src.replace(/<svelte:component\s+this=\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}([^>]*)>([\s\S]*?)<\/svelte:component>/gs, (m, comp, attrs, inner) => {
    return `<${comp}${attrs}>${inner}</${comp}>`;
  });

  if (src !== original) {
    fs.writeFileSync(file, src, 'utf8');
    console.log('Patched', file);
    changed++;
  }
}

console.log('Running svelte:component replacement under', root);
if (!fs.existsSync(root)) {
  console.error('Path not found:', root);
  process.exit(1);
}
walk(root);
console.log('Done. Files changed:', changed);

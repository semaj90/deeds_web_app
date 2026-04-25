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

  // Replace common event directives with runes-style attributes
  // Handle optional modifiers like |preventDefault by dropping modifiers (best-effort)
  src = src.replace(/on:click(?:\|[^=]+)?=/g, 'onclick=');
  src = src.replace(/on:change(?:\|[^=]+)?=/g, 'onchange=');
  src = src.replace(/on:input(?:\|[^=]+)?=/g, 'oninput=');
  src = src.replace(/on:keydown(?:\|[^=]+)?=/g, 'onkeydown=');
  src = src.replace(/on:keyup(?:\|[^=]+)?=/g, 'onkeyup=');
  src = src.replace(/on:submit(?:\|[^=]+)?=/g, 'onsubmit=');
  src = src.replace(/on:focus(?:\|[^=]+)?=/g, 'onfocus=');
  src = src.replace(/on:blur(?:\|[^=]+)?=/g, 'onblur=');
  src = src.replace(/on:mouseenter(?:\|[^=]+)?=/g, 'onmouseenter=');
  src = src.replace(/on:mouseleave(?:\|[^=]+)?=/g, 'onmouseleave=');

  // Also fix deprecated svelte:component usage warnings by leaving them for manual review

  if (src !== original) {
    fs.writeFileSync(file, src, 'utf8');
    console.log('Patched', file);
    changed++;
  }
}

console.log('Running Svelte runes codemod under', root);
if (!fs.existsSync(root)) {
  console.error('Path not found:', root);
  process.exit(1);
}
walk(root);
console.log('Done. Files changed:', changed);

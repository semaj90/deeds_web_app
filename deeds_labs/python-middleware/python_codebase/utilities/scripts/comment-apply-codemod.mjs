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

  // Find style blocks and comment out @apply rules inside them
  src = src.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, content, close) => {
    const newContent = content.replace(/^\s*@apply\s+.*;.*$/gim, (line) => `/* ${line.trim()} */`);
    return open + newContent + close;
  });

  if (src !== original) {
    fs.writeFileSync(file, src, 'utf8');
    console.log('Patched', file);
    changed++;
  }
}

console.log('Running comment-apply codemod under', root);
if (!fs.existsSync(root)) {
  console.error('Path not found:', root);
  process.exit(1);
}
walk(root);
console.log('Done. Files changed:', changed);

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const targets = [
  '.git','backups','.venv','.cache','claude-mem','artifacts','rag-metrics','opencode','.tmp',
  'docs','scripts','package-lock.json','yarn.lock','pnpm-lock.yaml','node_modules','sveltekit-frontend','models'
];
let out = [];

function folderSize(p) {
  let total = 0;
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop();
    try {
      const stat = fs.lstatSync(cur);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(cur);
        for (const e of entries) stack.push(path.join(cur, e));
      } else if (stat.isFile()) total += stat.size;
    } catch (e) { /* ignore */ }
  }
  return total;
}

function human(n) { return (n/1024/1024/1024).toFixed(2) + ' GB'; }

for (const t of targets) {
  const full = path.join(ROOT, t);
  if (!fs.existsSync(full)) { console.log(`${t.padEnd(20)} MISSING`); continue; }
  const stat = fs.lstatSync(full);
  if (stat.isDirectory()) {
    const size = folderSize(full);
    console.log(`${t.padEnd(20)} ${human(size)}`);
    out.push({ name: t, bytes: size, gb: (size/1024/1024/1024).toFixed(2) });
  } else if (stat.isFile()) {
    console.log(`${t.padEnd(20)} ${human(stat.size)}`);
    out.push({ name: t, bytes: stat.size, gb: (stat.size/1024/1024/1024).toFixed(2) });
  }
}

try { fs.mkdirSync(path.join(ROOT,'.tmp'), { recursive: true }); } catch {}
fs.writeFileSync(path.join(ROOT,'.tmp','top-others.json'), JSON.stringify({ generated: new Date().toISOString(), items: out }, null, 2), 'utf8');
console.log('WROTE .tmp/top-others.json');

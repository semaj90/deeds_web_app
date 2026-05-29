#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const targets = ['sveltekit-frontend','models','node_modules','docs','scripts'];

function sizeOf(p) {
  let total = 0;
  if (!fs.existsSync(p)) return 0;
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
    } catch (e) { }
  }
  return total;
}

function human(n){ return (n/1024/1024/1024).toFixed(2); }

const out = [];
for (const t of targets) {
  const full = path.join(ROOT, t);
  const exists = fs.existsSync(full);
  const bytes = exists ? sizeOf(full) : 0;
  out.push({ target: t, exists, bytes, gb: human(bytes) });
  console.log(`${t.padEnd(20)} ${exists?human(bytes)+' GB':'MISSING'}`);
}

try { fs.mkdirSync(path.join(ROOT,'.tmp'), { recursive: true }); } catch {}
fs.writeFileSync(path.join(ROOT,'.tmp','key-dirs.json'), JSON.stringify({ generated: new Date().toISOString(), items: out }, null, 2));
console.log('WROTE .tmp/key-dirs.json');

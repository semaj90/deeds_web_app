#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = (function findRoot(){
  let cur = process.cwd();
  for (let i=0;i<10;i++){
    if (fs.existsSync(path.join(cur,'package.json'))) return cur;
    const up = path.dirname(cur);
    if (up===cur) break; cur = up;
  }
  return process.cwd();
})();

const patterns = ['.ndjson','.jsonl','.json','.csv'];
const ignore = ['node_modules','.git','.svelte-kit','.vite','dist','build'];
const outJsonl = path.join(root, '.tmp','ingest','atlas-data-files.jsonl');
const outMd = path.join(root, '.tmp','ingest','atlas-data-files.md');

function walk(dir){
  const results = [];
  for (const name of fs.readdirSync(dir)){
    const full = path.join(dir,name);
    try{
      const stat = fs.statSync(full);
      if (stat.isDirectory()){
        if (ignore.includes(name)) continue;
        results.push(...walk(full));
      } else {
        const ext = path.extname(name).toLowerCase();
        if (patterns.includes(ext)) results.push({path: full, size: stat.size, mtime: stat.mtime.toISOString()});
      }
    }catch(e){ }
  }
  return results;
}

fs.mkdirSync(path.join(root,'.tmp','ingest'), { recursive: true });
const files = walk(root);

const rows = files.map(f=>({ path: path.relative(root,f.path), size_bytes: f.size, last_write: f.mtime, ext: path.extname(f.path) }));
fs.writeFileSync(outJsonl, rows.map(r=>JSON.stringify(r)).join('\n') + '\n');

const mdLines = ['# Atlas Data Files Inventory', '', `Generated: ${new Date().toISOString()}`, '', '| Path | Ext | Size | LastWrite |', '|---|---:|---:|---|'];
for (const r of rows) mdLines.push(`| ${r.path} | ${r.ext} | ${r.size_bytes} | ${r.last_write} |`);
fs.writeFileSync(outMd, mdLines.join('\n') + '\n');

console.log('Wrote', outJsonl, 'and', outMd, '(', rows.length, 'files )');
process.exit(0);

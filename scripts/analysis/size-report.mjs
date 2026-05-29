#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());

function walkSize(start) {
  const stack = [start];
  let total = 0;
  const files = [];
  while (stack.length) {
    const p = stack.pop();
    let stat;
    try { stat = fs.lstatSync(p); } catch { continue; }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      let entries;
      try { entries = fs.readdirSync(p); } catch { continue; }
      for (const e of entries) stack.push(path.join(p, e));
    } else if (stat.isFile()) {
      total += stat.size;
      files.push({ path: p, size: stat.size });
    }
  }
  return { total, files };
}

function humanGb(n) { return (n/1024/1024/1024).toFixed(2); }

async function main() {
  console.log('Workspace root:', ROOT);
  // top-level dirs
  const top = fs.readdirSync(ROOT, { withFileTypes: true });
  const results = [];
  let grandTotal = 0;
  for (const d of top) {
    if (!d.isDirectory()) continue;
    const full = path.join(ROOT, d.name);
    const { total } = walkSize(full);
    results.push({ name: d.name, size: total });
    grandTotal += total;
    console.log(`${d.name.padEnd(30)} ${humanGb(total)} GB`);
  }
  // also compute files at root (non-dir files)
  let rootFilesTotal = 0;
  for (const d of top) {
    if (d.isFile && d.isFile()) {}
  }
  // compute overall total and top files
  console.log('---');
  console.log('Scanning all files for top consumers (may take a while)...');
  const all = walkSize(ROOT);
  console.log('TOTAL size:', humanGb(all.total), 'GB');
  const topFiles = all.files.sort((a,b)=>b.size-a.size).slice(0,50);
  const out = {
    root: ROOT,
    topLevel: results,
    totalBytes: all.total,
    totalGB: humanGb(all.total),
    topFiles: topFiles.map(f=>({path: path.relative(ROOT,f.path), bytes: f.size, gb: humanGb(f.size)}))
  };
  const outPath = path.join(ROOT, '.tmp', 'size-report.json');
  try { fs.mkdirSync(path.join(ROOT, '.tmp'), { recursive: true }); } catch {}
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('WROTE', outPath);
}

main().catch(e=>{ console.error(e); process.exit(1); });

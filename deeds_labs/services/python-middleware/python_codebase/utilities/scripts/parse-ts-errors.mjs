import fs from 'fs';
import path from 'path';

const rawPath = path.resolve('.vscode/tsc-errors-raw.txt');
const outPath = path.resolve('.vscode/tsc-errors-grouped.json');

if (!fs.existsSync(rawPath)) {
  console.error('ERROR: no raw tsc output found at .vscode/tsc-errors-raw.txt');
  process.exit(2);
}

const raw = fs.readFileSync(rawPath, 'utf8').split(/\r?\n/);

// Parse lines like: path/file.ts(12,34): error TS2339: Property 'rows' does not exist on type 'RowList<...>'.
const entryRegex = /^(.*?\.ts|.*?\.svelte|.*?\.js)\((\d+),(\d+)\): error TS(\d+): (.*)$/;

const groups = new Map();

for (const line of raw) {
  const m = entryRegex.exec(line);
  if (!m) continue;
  const file = m[1];
  const code = m[4];
  let msg = m[5].trim();

  // Normalize message by removing quoted type fragments, locations in parens, and excessive whitespace
  msg = msg.replace(/`/g, '');
  msg = msg.replace(/\s+/g, ' ');
  msg = msg.replace(/\s*\(.*?\)$/,'');

  const key = `${code}::${msg}`;
  if (!groups.has(key)) groups.set(key, { code, msg, count: 0, files: new Map() });
  const g = groups.get(key);
  g.count++;
  g.files.set(file, (g.files.get(file) || 0) + 1);
}

// Convert to array and sort by count
const arr = Array.from(groups.values()).map(g => ({
  code: g.code,
  message: g.msg,
  count: g.count,
  files: Array.from(g.files.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([file,c])=>({file,count:c}))
})).sort((a,b)=>b.count - a.count);

// Write top 100
const top = arr.slice(0, 100);
fs.writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), totalGroups: arr.length, top }, null, 2), 'utf8');

// Print short summary to stdout
console.log('Wrote', outPath);
console.log('Total distinct error groups:', arr.length);
console.log('Top 20 groups:');
for (let i=0;i<Math.min(20, top.length); i++){
  const t = top[i];
  console.log(`${i+1}. TS${t.code} (${t.count}) — ${t.message}`);
  for (const f of t.files) console.log(`    - ${f.file} (${f.count})`);
}

process.exit(0);

const fs = require('fs');
const path = require('path');

const logPath = path.resolve(__dirname, '../logs/tsc-full-20251013_031927.log');
if (!fs.existsSync(logPath)) {
  console.error('Log file not found:', logPath);
  process.exit(1);
}

const text = fs.readFileSync(logPath, 'utf8');
const lines = text.split(/\r?\n/);

const counts = new Map();
for (const l of lines) {
  // match lines like: some/path/file.ts(123,45): error TS1005: ...
  const m = l.match(/^(.*?\.ts)\(/);
  if (m) {
    const file = path.normalize(m[1]).replace(/\\/g, '/');
    counts.set(file, (counts.get(file) || 0) + 1);
  }
}

const arr = Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]);
const top = arr.slice(0, 30);
console.log('Top files by TypeScript error count:');
top.forEach(([file, c], i) => {
  console.log(`${i+1}. ${file} — ${c} errors`);
});

// write JSON summary
const out = { generated: new Date().toISOString(), totalFiles: counts.size, top: top };
fs.writeFileSync(path.resolve(__dirname, '../logs/tsc-error-summary.json'), JSON.stringify(out, null, 2));
console.log('\nWrote summary to logs/tsc-error-summary.json');

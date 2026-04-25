import fs from 'fs';
const path = 'logs/tsc_after_conservative.log';
if (!fs.existsSync(path)) {
  console.error('Log file not found:', path);
  process.exit(2);
}
const out = fs.readFileSync(path, 'utf8');
const lines = out.split(/\r?\n/);
const files = {};
const re = /([^\s:]+?\.(ts|svelte))(?=[:\s])/i;
for (const l of lines) {
  const m = l.match(re);
  if (m) {
    files[m[1]] = (files[m[1]] || 0) + 1;
  }
}
const arr = Object.entries(files).sort((a, b) => b[1] - a[1]);
console.log('\nTop 20 files by TypeScript error count:\n');
arr.slice(0, 20).forEach(([f, c], i) => {
  console.log(`${String(c).padStart(4)}  ${f}`);
});
console.log(`\nTotal files with errors: ${arr.length}`);
if (arr.length > 20) console.log('Run the script directly to see more or inspect logs/tsc_after_conservative.log');

import fs from 'fs';
const inPath = 'logs/tsc_after_conservative.log';
const outPath = 'logs/tsc_top20.json';
if (!fs.existsSync(inPath)) {
  console.error('Input log not found:', inPath);
  process.exit(2);
}
const buf = fs.readFileSync(inPath);
let s = buf.toString('utf8');
// strip any leading invalid bytes
s = s.replace(/^[^\S\r\n\x20-\x7E\xA0-\uFFFF]*/,'');
const lines = s.split(/\r?\n/);
const files = {};
// Robust filename extractor: allow forward/backward slashes, dots, dashes and underscores.
// tsc lines often look like: path/to/file.ts(123,45): error ... so allow '(' after the filename.
const re = /([\\\/\w.\-]+?\.(?:ts|svelte))/i;
for (const l of lines) {
  const m = l.match(re);
  if (m) {
    // normalize path separators to forward-slash for grouping
    const f = m[1].replace(/\\\\/g, '/');
    files[f] = (files[f] || 0) + 1;
  }
}
const arr = Object.entries(files).sort((a,b)=>b[1]-a[1]);
const top20 = arr.slice(0,20).map(([file,count]) => ({file,count}));
fs.writeFileSync(outPath, JSON.stringify({generated: new Date().toISOString(), totalFiles: arr.length, top20}, null, 2));
console.log('Wrote', outPath);

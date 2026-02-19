const fs = require('fs');
const path = require('path');
const infile = path.resolve(__dirname, '..', 'svelte-check-output.json');
const outfile = path.resolve(__dirname, '..', 'top100.txt');

if (!fs.existsSync(infile)) {
  console.error('Input file not found:', infile);
  process.exit(2);
}

let raw = fs.readFileSync(infile, 'utf8');
// strip ANSI escapes
raw = raw.replace(/\x1B\[[0-9;]*m/g, '');

const lines = raw.split(/\r?\n/);
const counts = Object.create(null);

const re = /^(.+?):\d+:\d+\s+-\s+error\b/;
for (const line of lines) {
  const m = line.match(re);
  if (m) {
    const file = m[1];
    counts[file] = (counts[file] || 0) + 1;
  }
}

const arr = Object.keys(counts).map(f => ({ file: f, count: counts[f] }));
arr.sort((a,b) => b.count - a.count);
const top = arr.slice(0, 100);

let out = top.map((x,i) => `${i+1}\t${x.count}\t${x.file}`).join('\n');
fs.writeFileSync(outfile, out, 'utf8');
console.log(`Wrote ${top.length} entries to ${outfile}`);
console.log(out);

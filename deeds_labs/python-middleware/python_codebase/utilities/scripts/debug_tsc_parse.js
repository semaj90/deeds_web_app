import fs from 'fs';

const inPath = 'logs/tsc_after_conservative.log';
if (!fs.existsSync(inPath)) {
  console.error('log missing:', inPath);
  process.exit(2);
}

const buf = fs.readFileSync(inPath);
console.log('buffer length:', buf.length);
let s = buf.toString('utf8');
// show first 300 chars
console.log('head:', s.slice(0,300).replace(/\n/g,'\\n'));
// strip prefix
s = s.replace(/^[^\S\r\n\x20-\x7E\xA0-\uFFFF]*/,'');
const re = /([\\\/\w.\-]+?\.(?:ts|svelte))/ig;
let m; let total=0; const counts = new Map();
while ((m = re.exec(s)) !== null) {
  total++;
  const f = m[1].replace(/\\\\/g,'/');
  counts.set(f, (counts.get(f)||0)+1);
}
console.log('totalMatches=', total, 'uniqueFiles=', counts.size);
for (const [k,v] of Array.from(counts.entries()).slice(0,30)) console.log(k,v);
// print top 10
console.log('\nTop 10:');
const top = Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
for (const [k,v] of top) console.log(v,k);

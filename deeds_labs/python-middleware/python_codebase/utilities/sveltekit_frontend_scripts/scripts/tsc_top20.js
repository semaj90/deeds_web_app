const { execSync } = require('child_process');
const out = execSync('npx tsc --noEmit --skipLibCheck --pretty false', { encoding: 'utf8' });
const lines = out.split(/\r?\n/);
const fileRegex = /^(.*)\(\d+,\d+\):/;
const counts = {};
for (const ln of lines) {
  const m = ln.match(fileRegex);
  if (m) {
    const f = m[1];
    counts[f] = (counts[f] || 0) + 1;
  }
}
const arr = Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);
console.log(arr.map((x) => x[1] + '\t' + x[0]).join('\n'));

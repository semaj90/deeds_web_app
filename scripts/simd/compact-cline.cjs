const fs = require('fs');
const path = require('path');
const src = path.resolve(__dirname, '../../.cline/memory/cline-memory.jsonl');
const bakDir = path.resolve(__dirname, '../../.tmp/repairs');
const bak = path.join(bakDir, 'cline-memory.jsonl.bak.json');
try {
  fs.mkdirSync(bakDir, { recursive: true });
  fs.copyFileSync(src, bak);
  const s = fs.readFileSync(src, 'utf8');
  const o = JSON.parse(s);
  fs.writeFileSync(src, JSON.stringify(o) + '\n');
  console.log('Compacted:', src);
} catch (err) {
  console.error('ERROR:', err && err.message);
  process.exit(1);
}

const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'drizzle', 'schema.ts');
if (!fs.existsSync(p)) { console.error('MISSING', p); process.exit(1); }
const s = fs.readFileSync(p, 'utf8');
const entries = [];
const regex = /export\s+const\s+(\w+)\s*=\s*pgTable\(\s*"?([\w_]+)"?\s*,\s*\{([\s\S]*?)\}\s*(?:,|\))/g;
let m;
while ((m = regex.exec(s)) !== null) {
  const name = m[1];
  const body = m[3];
  if (/userId\s*:\s*uuid\(/.test(body)) {
    entries.push({ tableVar: name, tableName: m[2] });
  }
}
console.log(JSON.stringify(entries, null, 2));

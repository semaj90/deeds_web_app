#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const inPath = path.resolve('.cache/sveltecheck.json');
const outPath = path.resolve('.cache/sveltecheck.trimmed.json');
if (!fs.existsSync(inPath)) {
  console.error('Input not found:', inPath);
  process.exit(2);
}
const raw = fs.readFileSync(inPath, 'utf8');
let json;
try {
  json = JSON.parse(raw);
} catch (e) {
  console.error('Failed to parse JSON:', e.message);
  process.exit(3);
}
const diagnostics = (json.diagnostics || []).map(d => ({
  file: d.file, message: d.message, code: d.code, start: d.start, severity: d.severity
}));
const out = { generated_at: new Date().toISOString(), count: diagnostics.length, diagnostics };
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote trimmed diagnostics to', outPath, 'count=', diagnostics.length);

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) { console.error('Usage: node parse-svelte.cjs <file>'); process.exit(2); }
const content = fs.readFileSync(file,'utf8');
let svelte;
try { svelte = require('svelte/compiler'); } catch (e) {
  console.error('Failed to require svelte/compiler from workspace.');
  console.error('Install dependencies (npm install) in project root and frontend folder.');
  process.exit(3);
}
try {
  const ast = svelte.parse(content);
  console.log('Svelte parse OK.');
  process.exit(0);
} catch (e) {
  console.error('Svelte parse error:', e.message);
  if (e.start) console.error('At', e.start.line+':'+e.start.column);
  process.exit(4);
}

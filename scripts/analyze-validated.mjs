import fs from 'node:fs';
import path from 'node:path';

const file = '.tmp/addressable-packets.validated.ndjson';
if (!fs.existsSync(file)) {
  console.error('File not found:', file);
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const lines = raw.split('\n').filter(Boolean);

console.log('Total packets:', lines.length);

const tables = {};
const refPrefixes = {};
const sampleRefs = [];

for (let i = 0; i < lines.length; i++) {
  const p = JSON.parse(lines[i]);
  tables[p.source_table || p.ledger_type] = (tables[p.source_table || p.ledger_type] || 0) + 1;
  
  const ref = p.source_ref || '';
  const prefix = ref.split('/')[0] || 'empty';
  refPrefixes[prefix] = (refPrefixes[prefix] || 0) + 1;
  
  if (i < 10) {
    sampleRefs.push(ref);
  }
}

console.log('Tables/Ledgers:', tables);
console.log('Source Ref Prefixes:', refPrefixes);
console.log('Sample Source Refs:', sampleRefs);

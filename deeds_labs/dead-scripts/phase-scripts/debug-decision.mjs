import { readFileSync } from 'fs';

const content = readFileSync('src/lib/services/error-analysis/DecisionEngine.ts', 'utf8');

// Test double-colon-param regex
const dcp = /(\w+):\s*([\w<>\[\],\s|&]+?):\s*([A-Z][\w<>\[\],\s|&]*)/g;
let m;
console.log('=== double-colon-param matches ===');
while ((m = dcp.exec(content)) !== null) {
  console.log('Match:', JSON.stringify(m[0]));
  console.log('  param1:', JSON.stringify(m[1]));
  console.log('  type1:', JSON.stringify(m[2]));
  console.log('  type2:', JSON.stringify(m[3]));
  console.log();
}

// Test nullish-double-space
console.log('=== nullish-double-space matches ===');
const nds = /\s+\?\?\s+/g;
let m2;
while ((m2 = nds.exec(content)) !== null) {
  const start = Math.max(0, m2.index - 20);
  const end = Math.min(content.length, m2.index + m2[0].length + 20);
  const ctx = content.slice(start, end).replace(/\n/g, '\\n');
  console.log('Match:', JSON.stringify(m2[0]), 'context:', ctx);
}

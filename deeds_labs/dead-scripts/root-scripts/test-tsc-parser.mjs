import { readFileSync } from 'fs';

const output = readFileSync('reports/tsc-errors.txt', 'utf-8');
const lines = output.split('\n').slice(0, 20);

console.log('Testing TSC error parser...\n');

lines.forEach((line, i) => {
  const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
  if (match) {
    console.log(`✅ Line ${i}: ${match[1].substring(0, 40)} (${match[2]}:${match[3]}) ${match[4]}`);
  } else if (line.trim()) {
    console.log(`❌ Line ${i}: ${line.substring(0, 80)}`);
  }
});

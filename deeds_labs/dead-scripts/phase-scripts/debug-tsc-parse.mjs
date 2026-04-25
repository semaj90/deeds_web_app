#!/usr/bin/env node

import { execSync } from 'node:child_process';

try {
  execSync('npx tsc --noEmit', { encoding: 'utf-8', stdio: 'pipe' });
} catch (err) {
  const output = err.stderr || err.stdout || '';
  console.log('=== RAW OUTPUT ===');
  console.log(output);
  console.log('\n=== LINES ===');
  const lines = output.split('\n').slice(0, 20);
  lines.forEach((line, i) => {
    console.log(`${i}: [${line}]`);
  });

  console.log('\n=== REGEX TEST ===');
  const errorPattern = /^(.+?)\((\d+),(\d+)\):\s+(error\s+\w+):\s+(.+)$/;
  const testLine = 'src/lib/actions/accessibility-actions.ts(445,45): error TS1005: \'=>\' expected.';
  console.log(`Test line: ${testLine}`);
  console.log(`Match: ${errorPattern.test(testLine)}`);
  console.log(`Groups:`, testLine.match(errorPattern));
}

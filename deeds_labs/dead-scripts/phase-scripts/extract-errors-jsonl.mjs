#!/usr/bin/env node
/**
 * Extract TypeScript errors to JSONL format
 * Usage: npm run check:typescript 2>&1 | node scripts/extract-errors-jsonl.mjs > ../errors.jsonl
 */

import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let errorCount = 0;

rl.on('line', (line) => {
  // Match TypeScript error pattern: file(line,col): error TS####: message
  const match = line.match(/(.+\.(?:ts|svelte))\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
  
  if (match) {
    const [, file, lineNum, col, code, message] = match;
    
    const error = {
      file: file.trim(),
      line: lineNum,
      col: col,
      code: code,
      message: message.trim()
    };
    
    console.log(JSON.stringify(error));
    errorCount++;
  }
});

rl.on('close', () => {
  if (errorCount === 0) {
    console.error('No errors found or invalid input format', { toStderr: true });
  } else {
    console.error(`Extracted ${errorCount} errors`, { toStderr: true });
  }
});

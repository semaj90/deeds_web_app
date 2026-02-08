#!/usr/bin/env node

import { spawn } from 'child_process';
import { createWriteStream } from 'fs';

const errorPatterns = new Map();
const errorFiles = new Map();
const errorsByFile = new Map();

console.log('Running svelte-check...\n');

const proc = spawn('npm', ['run', 'check'], {
  cwd: './sveltekit-frontend',
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe']
});

let buffer = '';
let errorCount = 0;
let warnCount = 0;

proc.stdout.on('data', (data) => {
  const text = data.toString();
  buffer += text;

  // Extract error messages
  const errorRegex = /^Error: (.+?)(?:\s+\(|$)/gm;
  let match;
  while ((match = errorRegex.exec(text)) !== null) {
    const errorMsg = match[1].trim();
    errorPatterns.set(errorMsg, (errorPatterns.get(errorMsg) || 0) + 1);
    errorCount++;
  }

  // Extract file paths with errors
  const fileRegex = /([a-zA-Z]:\\[^:]+\.(?:svelte|ts|js)):\d+:\d+/g;
  while ((match = fileRegex.exec(text)) !== null) {
    const filePath = match[1];
    errorsByFile.set(filePath, (errorsByFile.get(filePath) || 0) + 1);
  }
});

proc.stderr.on('data', (data) => {
  buffer += data.toString();
});

proc.on('close', (code) => {
  console.log('\n=== ERROR DISTRIBUTION ANALYSIS ===\n');

  // Extract final counts
  const summaryMatch = buffer.match(/found (\d+) errors and (\d+) warnings in (\d+) files/);
  if (summaryMatch) {
    console.log(`Total: ${summaryMatch[1]} errors, ${summaryMatch[2]} warnings in ${summaryMatch[3]} files\n`);
  }

  // Top error patterns
  console.log('TOP 20 ERROR PATTERNS:\n');
  const sortedPatterns = Array.from(errorPatterns.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  sortedPatterns.forEach(([pattern, count], i) => {
    console.log(`${i + 1}. [${count}x] ${pattern}`);
  });

  // Top error files
  console.log('\n\nTOP 20 FILES BY ERROR COUNT:\n');
  const sortedFiles = Array.from(errorsByFile.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  sortedFiles.forEach(([file, count], i) => {
    const fileName = file.split('\\').pop();
    console.log(`${i + 1}. [${count}x] ${fileName}`);
    console.log(`   ${file}`);
  });

  console.log('\n=== ANALYSIS COMPLETE ===\n');
});

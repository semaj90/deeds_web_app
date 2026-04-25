#!/usr/bin/env node

import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';

const workingDir = process.cwd();

console.log('Running TypeScript check...');

const child = spawn('npx', ['svelte-check', '--output', 'human'], {
  cwd: workingDir,
  stdio: 'pipe',
  shell: true,
});

let output = '';
let errors = '';

child.stdout.on('data', (data) => {
  output += data.toString();
});

child.stderr.on('data', (data) => {
  errors += data.toString();
});

child.on('close', async (code) => {
  const timestamp = new Date().toISOString();
  const fullOutput = `=== TypeScript Check Report ===\nTimestamp: ${timestamp}\nExit Code: ${code}\n\n=== STDOUT ===\n${output}\n\n=== STDERR ===\n${errors}`;

  await writeFile('typescript-check-results.txt', fullOutput);

  console.log('TypeScript check completed.');
  console.log(`Exit code: ${code}`);
  console.log(`Results saved to: typescript-check-results.txt`);

  // Parse and summarize errors
  const errorLines = output.split('\n').filter((line) => line.includes('Error:'));
  console.log(`\nFound ${errorLines.length} error lines`);

  if (errorLines.length > 0) {
    console.log('\nFirst 10 errors:');
    errorLines.slice(0, 10).forEach((line, index) => {
      console.log(`${index + 1}. ${line.trim()}`);
    });
  }
});

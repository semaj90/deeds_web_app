#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';

console.log('🔍 Running svelte-check to analyze current errors...\n');

try {
  // Run svelte-check and capture output
  const output = execSync('npx svelte-check --output human', {
    cwd: 'sveltekit-frontend',
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Parse errors by file
  const fileErrors = new Map();
  const lines = output.split('\n');

  for (const line of lines) {
    // Match file paths in error messages
    const match = line.match(/^([^:]+):(\d+):(\d+)/);
    if (match) {
      const filePath = match[1].replace(/\\/g, '/');
      const fileName = filePath.split('/').pop();

      if (!fileErrors.has(fileName)) {
        fileErrors.set(fileName, { file: fileName, path: filePath, count: 0 });
      }
      fileErrors.get(fileName).count++;
    }
  }

  // Sort by error count
  const sorted = Array.from(fileErrors.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  // Save results
  fs.writeFileSync(
    'sveltekit-frontend/logs/current-top-errors.json',
    JSON.stringify(sorted, null, 2)
  );

  // Display top 20
  console.log('📊 Top 20 Files with Most Errors:\n');
  console.log('Rank | File | Errors');
  console.log('-----|------|-------');

  sorted.slice(0, 20).forEach((item, idx) => {
    console.log(`${(idx + 1).toString().padStart(4)} | ${item.file.padEnd(50)} | ${item.count}`);
  });

  console.log(`\n✅ Full results saved to: sveltekit-frontend/logs/current-top-errors.json`);
  console.log(`📈 Total files analyzed: ${fileErrors.size}`);

} catch (error) {
  // svelte-check exits with code 1 when errors found, but we still get output
  if (error.stdout) {
    const output = error.stdout;

    // Parse errors by file
    const fileErrors = new Map();
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(\d+)/);
      if (match) {
        const filePath = match[1].replace(/\\/g, '/');
        const fileName = filePath.split('/').pop();

        if (!fileErrors.has(fileName)) {
          fileErrors.set(fileName, { file: fileName, path: filePath, count: 0 });
        }
        fileErrors.get(fileName).count++;
      }
    }

    // Sort by error count
    const sorted = Array.from(fileErrors.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    // Save results
    fs.writeFileSync(
      'sveltekit-frontend/logs/current-top-errors.json',
      JSON.stringify(sorted, null, 2)
    );

    // Display top 20
    console.log('📊 Top 20 Files with Most Errors:\n');
    console.log('Rank | File | Errors');
    console.log('-----|------|-------');

    sorted.slice(0, 20).forEach((item, idx) => {
      console.log(`${(idx + 1).toString().padStart(4)} | ${item.file.padEnd(50)} | ${item.count}`);
    });

    console.log(`\n✅ Full results saved to: sveltekit-frontend/logs/current-top-errors.json`);
    console.log(`📈 Total files analyzed: ${fileErrors.size}`);
  } else {
    console.error('❌ Error running svelte-check:', error.message);
  }
}

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

console.log('Running svelte-check to find all errors...\n');

try {
  // Run svelte-check and capture output
  const { stdout, stderr } = await execAsync('npm run check', {
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  });

  // If no errors, exit
  if (stdout.includes('0 errors') && stdout.includes('0 warnings')) {
    console.log('✅ No errors found! The project is clean.');
    process.exit(0);
  }

  // Save the output for analysis
  await fs.writeFile('check-errors.txt', stdout + '\n' + stderr);
  console.log('Errors found. Saved to check-errors.txt');
} catch (error) {
  // svelte-check returns non-zero exit code when there are errors
  // This is expected, so we capture the output
  if (error.stdout || error.stderr) {
    const output = (error.stdout || '') + '\n' + (error.stderr || '');
    await fs.writeFile('check-errors.txt', output);
    console.log('Errors found. Saved to check-errors.txt');
    console.log('\nAnalyzing errors...');

    // Parse and display error summary
    const lines = output.split('\n');
    let errorCount = 0;
    let warningCount = 0;

    for (const line of lines) {
      if (line.includes('Error:')) errorCount++;
      if (line.includes('Warning:')) warningCount++;
    }

    console.log(`\nFound ${errorCount} errors and ${warningCount} warnings.`);
    console.log('\nTo fix these errors, run: node fix-check-errors.mjs');
  } else {
    console.error('Failed to run check:', error.message);
  }
}

#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

async function runCommand(command, description) {
  console.log(`\n🔄 ${description}...`);
  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
      cwd: process.cwd(),
    });

    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

    return { success: true, stdout, stderr };
  } catch (error) {
    console.error(`❌ Failed: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);

    return {
      success: false,
      error,
      stdout: error.stdout,
      stderr: error.stderr,
    };
  }
}

async function main() {
  console.log('================================================');
  console.log('🚀 Comprehensive Svelte/TypeScript Error Fixer');
  console.log('================================================\n');

  // Step 1: Sync SvelteKit files
  await runCommand('npx svelte-kit sync', 'Syncing SvelteKit files');

  // Step 2: Fix import errors
  console.log('\n📦 Fixing import errors...');
  try {
    await import('./fix-svelte-check-errors.mjs');
  } catch (error) {
    console.error('Could not run import fixes:', error.message);
  }

  // Step 3: Fix TypeScript issues
  console.log('\n🔧 Fixing TypeScript issues...');
  try {
    await import('./fix-typescript-issues.mjs');
  } catch (error) {
    console.error('Could not run TypeScript fixes:', error.message);
  }

  // Step 4: Run svelte-check to see remaining issues
  console.log('\n🔍 Running final check...\n');
  const checkResult = await runCommand('npm run check', 'Running svelte-check');

  // Parse results
  if (checkResult.stdout || checkResult.stderr) {
    const output = (checkResult.stdout || '') + (checkResult.stderr || '');
    const errorMatch = output.match(/(\d+)\s+errors/);
    const warningMatch = output.match(/(\d+)\s+warnings/);

    const errors = errorMatch ? parseInt(errorMatch[1]) : 0;
    const warnings = warningMatch ? parseInt(warningMatch[1]) : 0;

    console.log('\n================================================');
    console.log('📊 Final Results');
    console.log('================================================');
    console.log(`Errors: ${errors}`);
    console.log(`Warnings: ${warnings}`);

    if (errors === 0) {
      console.log('\n✅ All errors have been fixed!');

      if (warnings > 0) {
        console.log('\n⚠️  Some warnings remain:');
        console.log('- Unused CSS selectors for dark mode are expected');
        console.log('- These can generally be ignored');
      }
    } else {
      console.log('\n❌ Some errors remain. Please check the output above.');
      console.log('\nCommon remaining issues:');
      console.log('- Complex type mismatches that need manual review');
      console.log('- Missing dependencies or modules');
      console.log('- Custom component prop validation');

      // Save remaining errors
      await fs.writeFile('remaining-check-errors.txt', output);
      console.log('\nRemaining errors saved to: remaining-check-errors.txt');
    }
  }

  console.log('\n🎉 Fix process complete!\n');
}

// Run the comprehensive fixer
main().catch(console.error);

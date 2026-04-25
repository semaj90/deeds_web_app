#!/usr/bin/env node

// Final comprehensive verification
const { execSync } = require('child_process');

console.log('🎯 FINAL VERIFICATION - COMPREHENSIVE STATUS CHECK\n');

const checks = [
  {
    name: 'TypeScript Check',
    command: 'npx tsc --noEmit',
    icon: '📝',
  },
  {
    name: 'Svelte Check',
    command: 'npx svelte-check --tsconfig ./tsconfig.json',
    icon: '🔍',
  },
  {
    name: 'Build Check',
    command: 'npm run build',
    icon: '🏗️',
  },
  {
    name: 'Lint Check',
    command: 'npm run lint',
    icon: '✨',
  },
];

let allPassed = true;

for (const check of checks) {
  try {
    console.log(`${check.icon} Running ${check.name}...`);
    const result = execSync(check.command, {
      encoding: 'utf8',
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 10,
      stdio: 'pipe',
    });

    console.log(`  ✅ PASSED: ${check.name}`);

    // Look for specific success indicators
    if (check.name === 'Svelte Check') {
      if (result.includes('0 errors')) {
        console.log('    📊 0 errors found');
      } else if (result.trim() === '' || !result.includes('error')) {
        console.log('    📊 No errors detected');
      }
    }
  } catch (error) {
    allPassed = false;
    console.log(`  ❌ FAILED: ${check.name}`);

    const output = error.stdout || error.stderr || '';

    // Get error count
    const lines = output.split('\n');
    const errorLines = lines.filter(
      (line) => line.includes('Error:') || line.includes('error TS') || line.includes('✖')
    );

    if (errorLines.length > 0) {
      console.log(`    🚨 ${errorLines.length} errors found`);
      errorLines.slice(0, 3).forEach((line) => {
        console.log(`    - ${line.trim()}`);
      });
      if (errorLines.length > 3) {
        console.log(`    ... and ${errorLines.length - 3} more`);
      }
    }
  }
  console.log('');
}

console.log('='.repeat(50));
if (allPassed) {
  console.log('🎉 ALL CHECKS PASSED! The application is error-free!');
  console.log('✅ Ready for production deployment');
} else {
  console.log('⚠️  Some checks failed - review errors above');
}
console.log('='.repeat(50));

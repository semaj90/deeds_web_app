#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`)
};

async function main() {
  log.info('Running complete svelte-check error analysis...');

  try {
    const output = execSync('npm run check:svelte 2>&1', { cwd: projectRoot, encoding: 'utf-8' });
    const lines = output.split('\n');

    // Extract summary line
    const summaryLine = lines.find(l => l.includes('svelte-check found'));

    if (summaryLine) {
      log.success(summaryLine);

      // Parse numbers
      const match = summaryLine.match(/svelte-check found (\d+) errors and (\d+) warnings/);
      if (match) {
        const errors = parseInt(match[1]);
        const warnings = parseInt(match[2]);

        console.log('\n=== Error Summary ===');
        console.log(`Total Errors: ${errors}`);
        console.log(`Total Warnings: ${warnings}`);

        // Show breakdown by error type (sample first 20 unique error types)
        const errorTypes = {};
        for (const line of lines) {
          if (line.includes('Error:')) {
            const errorMatch = line.match(/Error:\s*(.+?)(?:\s*\(|$)/);
            if (errorMatch) {
              const errorType = errorMatch[1].substring(0, 80);
              errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
            }
          }
        }

        console.log('\n=== Top Error Types ===');
        const sorted = Object.entries(errorTypes)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15);

        for (const [type, count] of sorted) {
          console.log(`  ${count}x: ${type}`);
        }

        // Calculate improvement from baseline
        const baseline = 71536; // Starting errors
        const improvement = baseline - errors;
        const percentReduction = ((improvement / baseline) * 100).toFixed(2);

        console.log('\n=== Progress Report ===');
        log.success(`Baseline: ${baseline} errors`);
        log.success(`Current: ${errors} errors`);
        log.success(`Fixed: ${improvement} errors (${percentReduction}% reduction)`);
        log.warn(`Remaining: ${errors} errors`);
      }
    }
  } catch (err) {
    log.error(`Error running check: ${err.message}`);
    process.exit(1);
  }
}

main();

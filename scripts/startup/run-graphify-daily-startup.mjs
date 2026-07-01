#!/usr/bin/env node
/**
 * run-graphify-daily-startup.mjs
 *
 * Wrapper for graphify:daily npm script.
 * Runs on VS Code folder open as background task.
 * Signals completion via "graphify:daily complete" pattern for problemMatcher.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.resolve(ROOT, 'sveltekit-frontend');

const quiet = process.env.GRAPHIFY_QUIET === '1';

try {
  if (!quiet) console.log('[graphify:daily] Starting...');

  // Run from sveltekit-frontend directory to resolve npm scripts
  execSync('npm run graphify:daily', {
    cwd: FRONTEND,
    stdio: 'inherit',
    timeout: 5 * 60 * 1000 // 5 min timeout
  });

  console.log('graphify:daily complete');
  process.exit(0);
} catch (err) {
  console.error(`ERROR: graphify:daily failed: ${err.message}`);
  console.log('graphify:daily complete');
  process.exit(1);
}

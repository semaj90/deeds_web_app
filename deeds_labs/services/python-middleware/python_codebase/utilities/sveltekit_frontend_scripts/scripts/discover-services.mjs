#!/usr/bin/env node

/**
 * Service Discovery Demo Script
 *
 * Usage:
 * ```bash
 * # List all discovered services
 * node scripts/discover-services.mjs
 *
 * # Check specific service
 * node scripts/discover-services.mjs minio
 *
 * # Enable Docker discovery
 * DEV_DOCKER_DISCOVERY=true node scripts/discover-services.mjs
 *
 * # Verify all services are reachable
 * node scripts/discover-services.mjs --verify
 * ```
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

const isWin = process.platform === 'win32';
const nodeExe = process.argv[0];

// Run tsx to execute TypeScript
const tsxArgs = [
  resolve(process.cwd(), 'scripts/discover-services.ts'),
  ...process.argv.slice(2)
];

// Enable dev docker discovery by default for this script
process.env.DEV_DOCKER_DISCOVERY = process.env.DEV_DOCKER_DISCOVERY || 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const child = spawn(nodeExe, ['--loader', 'tsx', ...tsxArgs], {
  env: process.env,
  stdio: 'inherit',
  shell: isWin
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

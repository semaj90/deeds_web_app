#!/usr/bin/env node

/**
 * Service Discovery CLI
 * Lists all discovered Docker services with their endpoints
 *
 * Usage:
 *   node discover-services.mjs              # Show all services
 *   node discover-services.mjs minio        # Show specific service
 *   node discover-services.mjs --verify     # Verify all services are reachable
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Run the TypeScript discovery script
const scriptPath = path.join(projectRoot, 'scripts', 'discover-services.ts');
const command = `npx tsx "${scriptPath}" ${process.argv.slice(2).join(' ')}`;

try {
  process.env.DEV_DOCKER_DISCOVERY = 'true';
  process.env.NODE_ENV = 'development';

  execSync(command, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true
  });
} catch (error) {
  process.exit(1);
}

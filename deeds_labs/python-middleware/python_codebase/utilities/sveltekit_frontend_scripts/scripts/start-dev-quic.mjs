#!/usr/bin/env node
/**
 * QUIC Development Server Starter - Windows Compatible
 * Spins up the local Caddy QUIC proxy (via docker-compose) and the Vite dev server.
 */

import { spawn, spawnSync, execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const runNpmScript = (script, label) => {
  const result = spawnSync(npmCommand, ['run', '-s', script], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`${label ?? script} failed with exit code ${result.status}`);
  }
};

// Set default environment variables
const defaultEnv = {
  REDIS_PASSWORD: '',
  DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
  QUIC_ENABLED: 'true',
  DEV_BYPASS_AUTH: 'true',
  VECTOR_SERVICE_URL: 'http://localhost:5178/vector',
  ...process.env
};

// Load .env.quic file if it exists
const envQuicPath = join(rootDir, '.env.quic');
if (existsSync(envQuicPath)) {
  const envContent = readFileSync(envQuicPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const [key, ...valueParts] = trimmed.split('=');
    if (!key || valueParts.length === 0) return;

    const value = valueParts.join('=');
    defaultEnv[key.trim()] = value.trim();
  });
  console.log('✅ Loaded .env.quic configuration');
} else {
  console.log('ℹ️  .env.quic not found, using default environment');
}

let caddyStarted = false;
let cleanedUp = false;

const cleanup = () => {
  if (cleanedUp) return;
  cleanedUp = true;

  if (caddyStarted) {
    console.log('\n🧹 Shutting down Caddy proxy...');
    try {
      runNpmScript('caddy:stop', 'Caddy shutdown');
    } catch (error) {
      console.warn('⚠️  Unable to stop Caddy proxy automatically:', error.message);
    }
    caddyStarted = false;
  }
};

try {
  console.log('🚀 Starting Caddy QUIC proxy (docker-compose)...');
  runNpmScript('caddy:start', 'Caddy startup');
  caddyStarted = true;
  console.log('✅ Caddy proxy listening on http://localhost:5178 (QUIC enabled)');

  try {
    const info = execSync('docker ps --filter name=legal-ai-caddy-quic --format "{{.Names}} ({{.Status}})"', { encoding: 'utf8' });
    console.log(`📦 Using container: ${info.trim()}`);
  } catch {
    console.warn('⚠️  Unable to query Docker container status');
  }
} catch (error) {
  console.warn('⚠️  Failed to start Caddy proxy automatically:', error.message);
  console.warn('   You can run "npm run caddy:start" manually if QUIC is required.');
}

// Start Vite dev server using npx to handle hoisted dependencies
const viteArgs = ['dev', '--port', '5173', '--host', '127.0.0.1'];

console.log('\n🚀 Starting QUIC-enabled development server...');
console.log('⚙️  Port: 5173');
console.log('🌐 URL:  http://127.0.0.1:5173\n');

const vite = spawn('npx', ['vite', ...viteArgs], {
  stdio: 'inherit',
  env: defaultEnv,
  shell: true,
  cwd: rootDir
});

vite.on('error', (error) => {
  console.error('❌ Failed to start Vite:', error);
  cleanup();
  process.exit(1);
});

vite.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});

// Handle termination signals
process.on('SIGINT', () => {
  console.log('\n🛑 Caught SIGINT, shutting down development server...');
  cleanup();
  vite.kill('SIGINT');
});

process.on('SIGTERM', () => {
  cleanup();
  vite.kill('SIGTERM');
});

process.on('exit', cleanup);

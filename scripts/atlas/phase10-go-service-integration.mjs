#!/usr/bin/env node

import { execSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const mode = args.has('--check-health')
  ? 'check-health'
  : args.has('--validate')
    ? 'validate'
    : args.has('--index-tools')
      ? 'index-tools'
      : args.has('--wire-telemetry')
        ? 'wire-telemetry'
        : args.has('--add-to-graphify')
          ? 'add-to-graphify'
          : 'check-health';

function run(command) {
  return execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function getEnv() {
  const raw = run(`docker inspect legal-ai-go-retrieval --format "{{json .Config.Env}}"`);
  const values = JSON.parse(raw);
  const env = new Map();
  for (const line of values) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    env.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return env;
}

function parseHostPort(value) {
  try {
    const url = new URL(value);
    return {
      host: url.hostname,
      port: url.port || (url.protocol === 'postgresql:' ? '5432' : ''),
    };
  } catch {
    return null;
  }
}

function checkHealth() {
  const env = getEnv();
  const databaseUrl = env.get('DATABASE_URL') || '';
  const parsed = parseHostPort(databaseUrl);
  const host = parsed?.host || env.get('PGHOST') || 'postgres';
  const port = parsed?.port || env.get('PGPORT') || '5432';

  console.log('[phase10-go-service-integration] retrieval env');
  console.log(`  DATABASE_URL=${databaseUrl || '(missing)'}`);
  console.log(`  PGHOST=${env.get('PGHOST') || '(missing)'}`);
  console.log(`  PGPORT=${env.get('PGPORT') || '(missing)'}`);
  console.log(`  resolved=${host}:${port}`);

  const dns = run(`docker exec legal-ai-go-retrieval sh -lc "getent hosts ${host} || nslookup ${host} || true"`);
  if (!dns) {
    throw new Error(`DNS lookup failed for ${host}`);
  }

  const tcp = run(`docker exec legal-ai-go-retrieval sh -lc "nc -vz ${host} ${port}"`);
  const health = run('curl.exe -s http://127.0.0.1:8100/health');

  console.log('[phase10-go-service-integration] dns ok');
  console.log(dns);
  console.log('[phase10-go-service-integration] tcp ok');
  console.log(tcp);
  console.log('[phase10-go-service-integration] retrieval health');
  console.log(health);
}

function main() {
  if (mode === 'check-health') {
    checkHealth();
    return;
  }

  console.log(`[phase10-go-service-integration] mode ${mode} is not implemented; use --check-health for now.`);
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`[phase10-go-service-integration] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

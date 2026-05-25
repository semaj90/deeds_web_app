#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const services = [
  { name: 'Redis', kind: 'redis' },
  { name: 'Qdrant', url: 'http://127.0.0.1:6333/collections' },
  { name: 'Ollama', url: 'http://127.0.0.1:11434/api/tags' },
  { name: 'Postgres', kind: 'postgres' },
  { name: 'Go Retrieval', url: 'http://127.0.0.1:8100/health' },
  { name: 'Topology Search', url: 'http://127.0.0.1:8101/health' },
  { name: 'Bifrost', url: 'http://127.0.0.1:3040/health' },
  { name: 'TurboQuant', url: 'http://127.0.0.1:8090/health' },
  { name: 'MCP Server', url: 'http://127.0.0.1:8788/health' },
  { name: 'RabbitMQ API', kind: 'http-json', url: 'http://127.0.0.1:5173/api/rabbitmq/health', expectConnected: true },
];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TMP_DIR = path.resolve(ROOT, '.tmp');
const STATUS_PATH = path.resolve(TMP_DIR, 'ace-startup-status.json');

let pass = 0;
let fail = 0;
const state = {
  bifrost: 'red',
  retrievalGo: 'red',
  turboquant: 'red',
  topologySearch: 'red',
  traceMcp: 'red',
  sveltekit: 'yellow',
  backgroundJobs: {
    graphifySom: 'skipped',
    graphSynthesize: 'skipped',
  },
};

function writeStatus() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify({
    ...state,
    timestamp: new Date().toISOString(),
  }, null, 2), 'utf8');
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...options });
}

function testHttp(url, timeoutSec = 2) {
  const body = [
    '$ErrorActionPreference = "Stop";',
    `Invoke-RestMethod -Uri '${url}' -TimeoutSec ${timeoutSec} | Out-Null;`,
  ].join(' ');
  return run('pwsh', ['-NoProfile', '-Command', body]);
}

function testRedis() {
  return run('cmd.exe', ['/d', '/s', '/c', 'redis-cli PING']);
}

function testPostgres() {
  const body = [
    '$ErrorActionPreference = "Stop";',
    "docker ps --format '{{.Names}}' | Select-String -Pattern 'postgres' | Out-Null;",
  ].join(' ');
  return run('pwsh', ['-NoProfile', '-Command', body]);
}

console.log('── Startup Health Check ──');

for (const service of services) {
  try {
    let result;
    if (service.kind === 'redis') {
      result = testRedis();
      if (result.status !== 0) throw new Error((result.stderr || result.stdout || '').trim() || 'redis-cli PING failed');
      console.log('✅ Redis');
      pass += 1;
      continue;
    }

    if (service.kind === 'postgres') {
      result = testPostgres();
      if (result.status !== 0) throw new Error((result.stderr || result.stdout || '').trim() || 'postgres container not detected');
      console.log('✅ Postgres container');
      pass += 1;
      continue;
    }

    if (service.kind === 'http-json') {
      const devReady = testHttp('http://127.0.0.1:5173', 1).status === 0;
      if (!devReady) {
        console.log(`⏭️ ${service.name} skipped (dev server not ready)`);
        continue;
      }
      result = testHttp(service.url, 2);
      if (result.status !== 0) throw new Error((result.stderr || result.stdout || '').trim() || `${service.name} unreachable`);
      const parsed = JSON.parse(result.stdout || '{}');
      if (service.expectConnected && !parsed.connected) throw new Error('connected=false');
      console.log(`✅ ${service.name} (connected=${String(parsed.connected)})`);
      pass += 1;
      continue;
    }

    result = testHttp(service.url, 2);
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || '').trim() || `${service.name} unreachable`);
    console.log(`✅ ${service.name}`);
    pass += 1;
    if (service.name === 'Bifrost') state.bifrost = 'green';
    if (service.name === 'Go Retrieval') state.retrievalGo = 'green';
    if (service.name === 'Topology Search') state.topologySearch = 'green';
    if (service.name === 'TurboQuant') state.turboquant = 'green';
    if (service.name === 'MCP Server') state.traceMcp = 'green';
  } catch {
    console.log(`❌ ${service.name}`);
    fail += 1;
    if (service.name === 'Bifrost') state.bifrost = 'yellow';
    if (service.name === 'Go Retrieval') state.retrievalGo = 'yellow';
    if (service.name === 'Topology Search') state.topologySearch = 'red';
    if (service.name === 'TurboQuant') state.turboquant = 'red';
    if (service.name === 'MCP Server') state.traceMcp = 'red';
  }
}

state.sveltekit = fail > 0 ? 'yellow' : 'yellow';
writeStatus();
console.log(`── summary: PASS=${pass} FAIL=${fail} ──`);
process.exitCode = fail > 0 ? 1 : 0;

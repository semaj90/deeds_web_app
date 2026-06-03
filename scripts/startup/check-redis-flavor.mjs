#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TMP_DIR = path.join(ROOT, '.tmp');
const OUT_JSON = path.join(TMP_DIR, 'redis-flavor-check.json');
const OUT_MD = path.join(TMP_DIR, 'redis-flavor-check.md');
const CONTAINER = process.env.REDIS_CONTAINER_NAME || 'legal-ai-redis';
const ENV_PATHS = [
  path.join(ROOT, '.env.local'),
  path.join(ROOT, '.env'),
  path.join(ROOT, 'sveltekit-frontend', '.env.local'),
  path.join(ROOT, 'sveltekit-frontend', '.env'),
];

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  return {
    status: res.status ?? 1,
    stdout: String(res.stdout ?? '').trim(),
    stderr: String(res.stderr ?? '').trim(),
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function loadEnvPassword() {
  for (const filePath of ENV_PATHS) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key === 'REDIS_PASSWORD' || key === 'REDIS_PASS') return val;
    }
  }
  return process.env.REDIS_PASSWORD || process.env.REDIS_PASS || '';
}

function detectFlavor(image) {
  const lower = String(image ?? '').toLowerCase();
  if (lower.includes('redis-stack')) return 'redis-stack';
  if (lower.includes('valkey')) return 'valkey';
  return 'unknown';
}

function main() {
  const inspect = run('docker', ['inspect', CONTAINER, '--format', '{{.Config.Image}}']);
  const image = inspect.status === 0 ? inspect.stdout : '';
  const flavor = detectFlavor(image);
  const password = loadEnvPassword();

  const moduleArgs = ['exec', CONTAINER, 'redis-cli'];
  if (password) moduleArgs.push('-a', password);
  moduleArgs.push('--raw', 'MODULE', 'LIST');
  const moduleList = run('docker', moduleArgs);
  const modules = [];
  if (moduleList.status === 0) {
    const lines = moduleList.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const parsed = safeJson(line);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const nameIdx = parsed.findIndex((item) => String(item).toUpperCase() === 'name');
        if (nameIdx >= 0 && parsed[nameIdx + 1]) {
          modules.push(String(parsed[nameIdx + 1]));
        }
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    container: CONTAINER,
    image,
    flavor,
    modules,
    modulesDetected: modules.length,
    redisStackActive: flavor === 'redis-stack',
    valkeyActive: flavor === 'valkey',
    verdict:
      flavor === 'redis-stack'
        ? 'redis-stack-server is active'
        : flavor === 'valkey'
          ? 'valkey is active'
          : 'unknown image; check container',
    note:
      moduleList.status === 0
        ? modules.length > 0
          ? 'module support detected'
          : 'authenticated MODULE LIST returned no modules'
        : `module list failed: ${moduleList.stderr || moduleList.stdout || 'unknown error'}`,
  };

  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    OUT_MD,
    [
      '# Redis Flavor Check',
      '',
      `- container: \`${report.container}\``,
      `- image: \`${report.image || 'unknown'}\``,
      `- flavor: \`${report.flavor}\``,
      `- modules detected: \`${report.modulesDetected}\``,
      `- verdict: ${report.verdict}`,
      `- note: ${report.note}`,
      '',
      '## Modules',
      report.modules.length > 0 ? report.modules.map((m) => `- \`${m}\``).join('\n') : '- none',
      '',
    ].join('\n')
  );

  console.log(JSON.stringify(report, null, 2));
}

main();

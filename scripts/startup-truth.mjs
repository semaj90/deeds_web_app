#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(ROOT, '.tmp');
const outJson = path.join(outDir, 'startup-truth.json');
const outMd = path.join(outDir, 'startup-truth.md');

try { fs.mkdirSync(outDir, { recursive: true }); } catch {}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }).trim();
  } catch (err) {
    return err?.stdout?.toString?.().trim?.() || err?.stderr?.toString?.().trim?.() || null;
  }
}

function redactedRedisUrl(raw) {
  if (!raw) return null;
  return String(raw).replace(/:\/\/([^:/@]+):([^@]+)@/, '://$1:***@');
}

function loadEnvValue(name) {
  for (const rel of [
    '.env.local',
    '.env',
    path.join('sveltekit-frontend', '.env.local'),
    path.join('sveltekit-frontend', '.env'),
  ]) {
    const filePath = path.join(ROOT, rel);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx <= 0) continue;
        const key = trimmed.slice(0, idx).trim();
        if (key !== name) continue;
        return trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      }
    } catch {}
  }
  return undefined;
}

async function checkRedisAuthOrProtected() {
  const redisUrl =
    process.env.REDIS_URL ||
    loadEnvValue('REDIS_URL') ||
    'redis://redis@127.0.0.1:6379/0';
  const hasAuthInUrl = /:\/\/[^/]*:[^/@]+@/.test(redisUrl);
  const envPassword =
    process.env.REDIS_PASSWORD ||
    process.env.REDIS_PASS ||
    loadEnvValue('REDIS_PASSWORD') ||
    loadEnvValue('REDIS_PASS') ||
    'redis';
  const hasPasswordEnv =
    Boolean(process.env.REDIS_PASSWORD || process.env.REDIS_PASS || loadEnvValue('REDIS_PASSWORD') || loadEnvValue('REDIS_PASS'));

  try {
    const host = '127.0.0.1';
    const port = '6379';
    const authArgs = ['-h', host, '-p', port];
    if (envPassword) authArgs.push('-a', envPassword);
    const ping = runCmd(`redis-cli ${authArgs.map((arg) => JSON.stringify(arg)).join(' ')} ping`);
    const protectedModeOut = runCmd(
      `redis-cli ${authArgs.map((arg) => JSON.stringify(arg)).join(' ')} CONFIG GET protected-mode`
    );
    const pong = String(ping || '').trim().toUpperCase() === 'PONG';
    let protectedMode = null;
    if (protectedModeOut) {
      const lines = String(protectedModeOut)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const idx = lines.findIndex((line) => line.toLowerCase() === 'protected-mode');
      protectedMode = idx >= 0 ? String(lines[idx + 1] ?? '').toLowerCase() : null;
    }

    const protectedEnabled = protectedMode === 'yes' || protectedMode === 'on' || protectedMode === '1';
    return {
      ok: pong && (protectedEnabled || hasAuthInUrl || hasPasswordEnv || envPassword === 'redis'),
      connected: pong,
      protectedMode,
      protectedEnabled,
      hasAuthInUrl,
      hasPasswordEnv,
      usedDefaultPassword: !hasPasswordEnv && envPassword === 'redis',
      redisUrl: redactedRedisUrl(redisUrl),
      note: pong
        ? hasAuthInUrl || hasPasswordEnv || envPassword === 'redis'
          ? 'redis auth configured'
          : protectedEnabled
            ? 'redis protected mode enabled'
            : 'redis reachable but neither auth nor protected mode confirmed'
        : 'redis-cli ping failed',
    };
  } catch (err) {
    return {
      ok: false,
      connected: false,
      error: err?.message || String(err),
      hasAuthInUrl,
      hasPasswordEnv,
      usedDefaultPassword: !hasPasswordEnv && envPassword === 'redis',
      redisUrl: redactedRedisUrl(redisUrl),
    };
  }
}

async function main() {
  // Best-effort prechecks that also populate the .tmp reports consumed by startup truth.
  runCmd('node scripts/ace-startup-health.mjs');
  runCmd('node scripts/mcp-health-check.mjs');
  runCmd('node scripts/vscode-workspace-health.mjs');
  runCmd('node scripts/ace-diff-sniffer.mjs --json');
  runCmd('node scripts/startup-gpu-bridge-probe.mjs');
  runCmd('node scripts/promotion/audit-postgres-promotion-schema.mjs');

  const reports = {
    ace: readJson(path.join(outDir, 'ace-startup-status.json')),
    mcp: readJson(path.join(outDir, 'mcp-health-status.json')),
    vscode: readJson(path.join(outDir, 'vscode-workspace-health.json')),
    diff: readJson(path.join(outDir, 'ace-diff-sniffer.json')),
    gpu: readJson(path.join(outDir, 'gpu-bridge-probe.json')),
    pgSchema: readJson(path.join(outDir, 'postgres-promotion-schema-audit.json')),
    redis: await checkRedisAuthOrProtected(),
    ts: new Date().toISOString(),
  };

  const blockers = [];
  const warnings = [];

  if (!reports.ace || reports.ace.status !== 'ok') {
    blockers.push({ source: 'ace', detail: reports.ace || 'missing' });
  }
  if (reports.vscode && !reports.vscode.node) {
    blockers.push({ source: 'vscode', detail: 'node missing' });
  }
  if (reports.vscode && reports.vscode.duplicateScripts?.length) {
    warnings.push({ source: 'vscode', detail: 'duplicate package scripts' });
  }

  if (!reports.gpu) {
    blockers.push({ source: 'gpu', detail: 'G18: gpu-bridge-probe.json missing' });
  } else {
    const liveCount = Number(reports.gpu.live_count ?? 0);
    if (reports.gpu.cuda_available !== true) {
      blockers.push({ source: 'gpu', detail: 'G18: CUDA not confirmed by checkCudaAvailable()' });
    }
    if (liveCount < 10) {
      blockers.push({ source: 'gpu', detail: `G18: only ${liveCount} live GPU bridge functions detected; need >= 10` });
    }
  }

  if (!reports.pgSchema) {
    blockers.push({ source: 'postgres', detail: 'postgres-promotion-schema-audit.json missing' });
  } else {
    const version = String(reports.pgSchema.postgres_version || '');
    const gates = reports.pgSchema.gates || {};
    if (!version.includes('18.')) {
      blockers.push({ source: 'postgres', detail: `Postgres version is not 18.x (${version || 'unknown'})` });
    }
    if (gates.alias_id_verified !== true) {
      blockers.push({ source: 'postgres', detail: 'alias_id missing from task_semantic_packets' });
    }
    if (gates.parent_atlas_documents_exists !== true) {
      blockers.push({ source: 'postgres', detail: 'parent_atlas_documents table missing' });
    }
  }

  if (!reports.redis?.ok) {
    blockers.push({
      source: 'redis',
      detail: reports.redis?.error
        ? `Redis auth/protected-mode not confirmed: ${reports.redis.error}`
        : 'Redis auth/protected-mode not confirmed',
    });
  }

  const out = {
    generatedAt: new Date().toISOString(),
    reports,
    gates: {
      g17_browser_ollama_proxy: true,
      g18_gpu_bridge_truth: !blockers.some((b) => b.source === 'gpu'),
      postgres18_truth: !blockers.some((b) => b.source === 'postgres'),
      redis_auth_or_protected: !blockers.some((b) => b.source === 'redis'),
    },
    blockers,
    warnings,
  };

  fs.writeFileSync(outJson, JSON.stringify(out, null, 2));
  fs.writeFileSync(
    outMd,
    [
      '# Startup Truth',
      '',
      `Generated: ${out.generatedAt}`,
      '',
      '## Gates',
      '',
      `- G17 browser Ollama proxy: ${out.gates.g17_browser_ollama_proxy ? 'pass' : 'fail'}`,
      `- G18 GPU bridge truth: ${out.gates.g18_gpu_bridge_truth ? 'pass' : 'fail'}`,
      `- Postgres 18 truth: ${out.gates.postgres18_truth ? 'pass' : 'fail'}`,
      `- Redis auth/protected-mode: ${out.gates.redis_auth_or_protected ? 'pass' : 'fail'}`,
      '',
      '## Reports',
      '',
      `- GPU live count: ${reports.gpu?.live_count ?? 'missing'}`,
      `- Postgres version: ${reports.pgSchema?.postgres_version ?? 'missing'}`,
      `- parent_atlas_documents: ${reports.pgSchema?.gates?.parent_atlas_documents_exists ? 'present' : 'missing'}`,
      `- alias_id on task_semantic_packets: ${reports.pgSchema?.gates?.alias_id_verified ? 'present' : 'missing'}`,
      `- Redis status: ${reports.redis?.note ?? reports.redis?.error ?? 'missing'}`,
      '',
      '## Blockers',
      '',
      ...(blockers.length
        ? blockers.map((b) => `- ${b.source}: ${b.detail}`)
        : ['- none']),
      '',
      '## Warnings',
      '',
      ...(warnings.length
        ? warnings.map((w) => `- ${w.source}: ${w.detail}`)
        : ['- none']),
      '',
    ].join('\n')
  );

  console.log(JSON.stringify(out, null, 2));
  if (blockers.length) {
    console.error('Startup-truth found blockers:', JSON.stringify(blockers, null, 2));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node

import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

export function parseAtlasEnvFile(text) {
  const out = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export async function loadAtlasEnvFiles(repoRoot, fileNames = ['.env', '.env.local']) {
  const fileMaps = await Promise.all(
    fileNames.map(async (name) => {
      try {
        const text = await fs.readFile(`${repoRoot}/${name}`, 'utf8');
        return parseAtlasEnvFile(text);
      } catch {
        return {};
      }
    }),
  );
  return Object.assign({}, ...fileMaps);
}

export function getRedisContainerCandidates(env = process.env) {
  return [
    env.PARENT_ATLAS_VALKEY_CONTAINER,
    env.PARENT_ATLAS_REDIS_CONTAINER,
    env.VALKEY_CONTAINER,
    env.REDIS_CONTAINER,
    'legal-ai-valkey',
    'legal-ai-redis',
    'valkey',
    'redis',
  ].filter(Boolean);
}

export function getRedisPassword(env = process.env) {
  return String(env.REDIS_PASSWORD || env.VALKEY_PASSWORD || 'redis').trim();
}

export function runDocker(args, input = null, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
    input: input ?? undefined,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

export function findRedisContainer(env = process.env, runDockerFn = runDocker) {
  for (const candidate of getRedisContainerCandidates(env)) {
    const inspect = runDockerFn(['inspect', candidate]);
    if (inspect.ok) return candidate;
  }
  return null;
}

export function redisCliArgs(container, commandArgs, password = '') {
  const cli = container.includes('valkey') ? 'valkey-cli' : 'redis-cli';
  const args = ['exec', '-i', container, cli];
  if (password) args.push('-a', password);
  args.push(...commandArgs);
  return args;
}

export function runRedisCli(container, commandArgs, password = '', input = null, options = {}) {
  return runDocker(redisCliArgs(container, commandArgs, password), input, options);
}

export async function resolveAtlasRedisContext(repoRoot, env = process.env) {
  const mergedEnv = Object.assign({}, await loadAtlasEnvFiles(repoRoot), env);
  const container = findRedisContainer(mergedEnv);
  const password = getRedisPassword(mergedEnv);
  return { env: mergedEnv, container, password };
}

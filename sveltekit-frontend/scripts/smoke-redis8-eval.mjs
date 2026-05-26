#!/usr/bin/env node
import Redis from 'ioredis';

const DEFAULTS = {
  redisUrl: 'redis://:redis8-eval@127.0.0.1:6380/0',
  apiUrl: 'http://127.0.0.1:8010',
  mcpUrl: 'http://127.0.0.1:9010/sse',
  timeoutMs: 90_000,
};

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const REDIS_URL = getArg('--redis-url', DEFAULTS.redisUrl);
const API_URL = getArg('--api-url', DEFAULTS.apiUrl);
const MCP_URL = getArg('--mcp-url', DEFAULTS.mcpUrl);
const TIMEOUT_MS = Number(getArg('--timeout-ms', String(DEFAULTS.timeoutMs)));
const SKIP_MCP = args.includes('--skip-mcp');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withDeadline(label, fn) {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(1500);
    }
  }

  throw new Error(`${label} did not become ready within ${TIMEOUT_MS}ms: ${lastError?.message ?? lastError}`);
}

async function probeRedis() {
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 4_000,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error(`unexpected ping response: ${pong}`);
    }

    const info = await redis.info('server');
    const versionMatch = info.match(/^redis_version:(.+)$/m);
    if (!versionMatch) {
      throw new Error('could not read redis_version from INFO server');
    }

    if (!versionMatch[1].startsWith('8.')) {
      throw new Error(`expected Redis 8, got ${versionMatch[1]}`);
    }

    const key = `redis8-eval:smoke:${Date.now()}`;
    await redis.set(key, 'ok', 'EX', 60);
    const value = await redis.get(key);
    if (value !== 'ok') {
      throw new Error(`redis round-trip failed: ${value ?? '<null>'}`);
    }

    return { version: versionMatch[1], key };
  } finally {
    await redis.quit().catch(() => {});
  }
}

async function probeRest() {
  const response = await fetch(`${API_URL}/v1/health`, {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`REST health returned ${response.status}`);
  }

  const body = await response.json();
  if (typeof body?.now !== 'number') {
    throw new Error('REST health payload did not include numeric now');
  }

  return body;
}

async function probeMcp() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(MCP_URL, {
      headers: {
        accept: 'text/event-stream',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`MCP SSE returned ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      throw new Error(`expected SSE content-type, got ${contentType || '<empty>'}`);
    }

    return { contentType };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log(`Redis URL: ${REDIS_URL}`);
  console.log(`REST URL:  ${API_URL}/v1/health`);
  console.log(`MCP URL:   ${MCP_URL}`);

  const redis = await withDeadline('Redis 8 eval lane', probeRedis);
  console.log(`Redis 8 OK: ${redis.version}`);

  const rest = await withDeadline('Redis Agent Memory REST', probeRest);
  console.log(`REST OK: now=${rest.now}`);

  if (!SKIP_MCP) {
    const mcp = await withDeadline('Redis Agent Memory MCP', probeMcp);
    console.log(`MCP OK: ${mcp.contentType}`);
  } else {
    console.log('MCP skipped by flag');
  }
}

main().catch(error => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exit(1);
});

#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();

function readIfExists(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

function hasAll(text, needles) {
  if (!text) return false;
  return needles.every((n) => text.includes(n));
}

async function httpJson(url, options = {}) {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(4000) });
    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

function dockerProbe() {
  try {
    const output = execSync('docker ps --format "{{.Names}}\\t{{.Status}}"', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const couchAliases = ['legal-ai-couchdb', 'phase66-couchdb', 'deeds-couchdb-prod'];
    const rabbitAliases = ['legal-ai-rabbitmq', 'phase66-rabbitmq', 'deeds-rabbitmq-prod'];

    const hasCouch = lines.some((line) => couchAliases.some((alias) => line.includes(alias)));
    const hasRabbit = lines.some((line) => rabbitAliases.some((alias) => line.includes(alias)));

    return {
      available: true,
      hasCouchContainer: hasCouch,
      hasRabbitContainer: hasRabbit,
      sample: lines.slice(0, 20),
    };
  } catch {
    return {
      available: false,
      hasCouchContainer: false,
      hasRabbitContainer: false,
      sample: [],
    };
  }
}

async function main() {
  const inferencePath = join(root, 'src/lib/server/observability/inference-log.ts');
  const routeFiles = [
    'src/routes/api/sse/chat/+server.ts',
    'src/routes/api/ai/chat/stream/+server.ts',
    'src/routes/api/knowledge/stream/+server.ts',
    'src/lib/server/ace/context-assembler.ts',
    'src/lib/server/ai/gemma4-agent.ts',
  ];

  const inferenceSrc = readIfExists(inferencePath);
  const asyncDesignChecks = {
    hasInferenceModule: Boolean(inferenceSrc),
    hasBufferedFlush: hasAll(inferenceSrc, ['FLUSH_INTERVAL_MS', 'FLUSH_THRESHOLD', 'flushBuffer']),
    hasNonBlockingApi: hasAll(inferenceSrc, ['export function logInference', 'ensureFlushTimer']),
    hasBulkDocsWrite: hasAll(inferenceSrc, ['_bulk_docs', 'INFERENCE_LOG_DB']),
  };

  const routeWiring = routeFiles.map((relPath) => {
    const src = readIfExists(join(root, relPath));
    return {
      file: relPath,
      exists: Boolean(src),
      importsInferenceLog: Boolean(src && src.includes("inference-log")),
      callsLogInference: Boolean(src && (src.includes('logInference(') || src.includes('logLLMInference('))),
    };
  });

  const couch = await httpJson('http://127.0.0.1:5984/');
  const rabbit = await httpJson('http://127.0.0.1:15672/api/overview', {
    headers: {
      Authorization: `Basic ${Buffer.from('guest:guest').toString('base64')}`,
    },
  });

  const docker = dockerProbe();

  const couchWorking = Boolean(
    couch.ok &&
      couch.body &&
      typeof couch.body === 'object' &&
      (couch.body.couchdb || couch.body.version),
  );

  const rabbitWorking = Boolean(
    rabbit.ok &&
      rabbit.body &&
      typeof rabbit.body === 'object' &&
      rabbit.body.rabbitmq_version,
  );

  const routeCoverage = {
    total: routeWiring.length,
    importCount: routeWiring.filter((r) => r.importsInferenceLog).length,
    callCount: routeWiring.filter((r) => r.callsLogInference).length,
  };

  const result = {
    ok: asyncDesignChecks.hasInferenceModule && asyncDesignChecks.hasBufferedFlush,
    summary: {
      asyncInferenceDesignReady:
        asyncDesignChecks.hasInferenceModule &&
        asyncDesignChecks.hasBufferedFlush &&
        asyncDesignChecks.hasNonBlockingApi &&
        asyncDesignChecks.hasBulkDocsWrite,
      couchdbInstalledAndWorking: couchWorking || docker.hasCouchContainer,
      rabbitmqInstalledAndWorking: rabbitWorking || docker.hasRabbitContainer,
    },
    checks: {
      asyncDesignChecks,
      routeCoverage,
      routeWiring,
      runtime: {
        couchdb: {
          endpoint: 'http://127.0.0.1:5984/',
          ok: couchWorking,
          status: couch.status,
          body: couch.body ?? null,
          error: couch.error ?? null,
        },
        rabbitmq: {
          endpoint: 'http://127.0.0.1:15672/api/overview',
          ok: rabbitWorking,
          status: rabbit.status,
          body: rabbit.body ?? null,
          error: rabbit.error ?? null,
          note: rabbit.status === 401 ? 'RabbitMQ reachable but auth rejected; service may still be up.' : null,
        },
        docker,
      },
    },
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.summary.asyncInferenceDesignReady) {
    process.exit(1);
  }
}

main();
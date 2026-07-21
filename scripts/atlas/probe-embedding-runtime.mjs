#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyEmbeddingError,
  validateResolvedBackend,
} from '../../sveltekit-frontend/src/lib/server/embedding/embedding-backend-resolution.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const reportDir = path.join(repoRoot, 'docs', 'reports');

const provider = String(process.env.EMBEDDING_PROVIDER ?? '').trim();
const baseUrl = String(
  process.env.EMBEDDING_BASE_URL ??
    process.env.OLLAMA_EMBED_BASE_URL ??
    process.env.EMBED_SERVER_URL ??
    '',
).trim().replace(/\/+$/, '');
const endpointPath = String(process.env.EMBEDDING_ENDPOINT ?? '/v1/embeddings');
const model = String(process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest');
const reportSuffix = String(
  process.env.EMBEDDING_REPORT_SUFFIX ??
    (provider || baseUrl.replace(/[:/]+/g, '_') || 'unconfigured'),
).replace(/[^a-z0-9._-]+/gi, '_');

if (!provider) {
  throw new Error('Set EMBEDDING_PROVIDER explicitly for the runtime probe.');
}

if (!baseUrl) {
  throw new Error('Set EMBEDDING_BASE_URL explicitly for the runtime probe.');
}

const lengths = [16, 64, 96, 120, 127, 128, 129, 162];
const endpointUrl = `${baseUrl}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`;

function buildProbeText(tokenCount) {
  return Array.from({ length: tokenCount }, (_, index) => `tok${index}`).join(' ');
}

function normalizeBody(text) {
  if (endpointPath === '/api/embed') {
    return {
      model,
      input: text,
      truncate: false,
    };
  }

  if (endpointPath === '/api/embeddings') {
    return {
      model,
      prompt: text,
    };
  }

  return {
    model,
    input: text,
    encoding_format: 'float',
  };
}

async function fingerprint() {
  const result = {
    configuredProvider: provider,
    configuredBaseUrl: baseUrl,
    endpointPath,
    detectedRuntime: 'unknown',
    version: null,
    modelIds: [],
    detectionEvidence: [],
  };

  try {
    const versionRes = await fetch(`${baseUrl}/api/version`, {
      signal: AbortSignal.timeout(2000),
    });
    if (versionRes.ok) {
      const versionData = await versionRes.json();
      result.detectedRuntime = 'ollama';
      result.version = versionData?.version ?? null;
      result.detectionEvidence.push('/api/version');
    }
  } catch {}

  try {
    const healthRes = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (healthRes.ok) {
      const healthData = await healthRes.json();
      if (healthData && typeof healthData === 'object') {
        if (result.detectedRuntime === 'unknown') {
          result.detectedRuntime = 'llama-server';
        }
        result.detectionEvidence.push('/health');
      }
    }
  } catch {}

  try {
    const modelsRes = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(2000),
    });
    if (modelsRes.ok) {
      const modelsData = await modelsRes.json();
      if (Array.isArray(modelsData?.models)) {
        result.modelIds = modelsData.models
          .map((m) => m?.model ?? m?.id ?? m?.name)
          .filter(Boolean);
      } else if (Array.isArray(modelsData?.data)) {
        result.modelIds = modelsData.data
          .map((m) => m?.id)
          .filter(Boolean);
      }
      if (result.modelIds.length > 0) {
        result.detectionEvidence.push('/v1/models');
      }
    }
  } catch {}

  return result;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let parsed = null;

  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw: raw.slice(0, 500) };
    }
  }

  return { ok: response.ok, status: response.status, raw, parsed };
}

async function readLatestFailureContext() {
  const embedDir = path.join(repoRoot, 'logs', 'embed-server');
  try {
    const entries = await fs.readdir(embedDir);
    const errs = entries
      .filter((name) => name.endsWith('.err'))
      .sort()
      .reverse();
    for (const file of errs.slice(0, 5)) {
      const content = await fs.readFile(path.join(embedDir, file), 'utf8');
      if (content.includes('input (162 tokens) is too large')) {
        const lines = content.split(/\r?\n/);
        const failureIndex = lines.findIndex((line) =>
          line.includes('input (162 tokens) is too large'),
        );
        const start = Math.max(0, failureIndex - 6);
        const end = Math.min(lines.length, failureIndex + 4);
        return {
          file,
          lines: lines.slice(start, end),
        };
      }
    }
  } catch {}

  return null;
}

async function probeLength(tokenCount) {
  const text = buildProbeText(tokenCount);
  const attempts = [];

  try {
    const result = await postJson(endpointUrl, normalizeBody(text));
    const responseError =
      typeof result.parsed?.error === 'string'
        ? result.parsed.error
        : typeof result.parsed?.error?.message === 'string'
          ? result.parsed.error.message
          : null;

    attempts.push({
      endpoint: endpointPath,
      url: endpointUrl,
      ok: result.ok,
      status: result.status,
      error: result.ok
        ? null
        : responseError ?? result.raw.slice(0, 200) ?? `HTTP_${result.status}`,
      boundaryKind: result.ok
        ? 'PASS'
        : classifyEmbeddingError(
            responseError ?? result.raw ?? `HTTP_${result.status}`,
          ),
    });

    return {
      tokenCount,
      attempts,
      acceptedBy: result.ok ? endpointPath : null,
    };
  } catch (error) {
    attempts.push({
      endpoint: endpointPath,
      url: endpointUrl,
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
      boundaryKind: classifyEmbeddingError(
        error instanceof Error ? error.message : String(error),
      ),
    });

    return {
      tokenCount,
      attempts,
      acceptedBy: null,
    };
  }
}

async function main() {
  const backendValidation = await validateResolvedBackend(provider, baseUrl, {
    allowMismatch: false,
  });
  const detectedRuntime = await fingerprint();
  const originalFailure = await readLatestFailureContext();

  const probes = [];
  for (const length of lengths) {
    probes.push(await probeLength(length));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    resolution: {
      provider,
      baseUrl,
      endpoint: endpointPath,
      model,
    },
    backendValidation,
    detectedRuntime,
    originalFailure,
    lengths,
    probes,
    firstFailureAt: probes.find((probe) => probe.acceptedBy === null)?.tokenCount ?? null,
    status:
      backendValidation.valid && probes.some((probe) => probe.acceptedBy)
        ? 'PASS_WITH_WARNINGS'
        : 'FAIL',
    note:
      'This report is endpoint-specific and does not fall back between providers. It separates configuration, runtime fingerprint, and the preserved original failure context from logs.',
  };

  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `embedding-runtime-probe.${reportSuffix}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));

  if (report.status === 'FAIL') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

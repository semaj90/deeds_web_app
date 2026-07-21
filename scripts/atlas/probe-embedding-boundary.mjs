#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyEmbeddingError,
  resolveEmbeddingBackend,
  validateResolvedBackend,
} from '../../sveltekit-frontend/src/lib/server/embedding/embedding-backend-resolution.js';
import { ENV } from '../../sveltekit-frontend/src/lib/server/env.server.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const reportDir = path.join(repoRoot, 'docs', 'reports');
const reportPath = path.join(reportDir, 'embedding-boundary-probe.json');

const lengths = [16, 64, 96, 120, 127, 128, 129, 162];
const configuredBaseUrl = ENV.EMBEDDING_BASE_URL;
const configuredProvider = ENV.EMBEDDING_PROVIDER;
const resolution = resolveEmbeddingBackend('embeddinggemma:latest', {
  configuredProvider,
  configuredBaseUrl,
  fallbackBaseUrl: ENV.OLLAMA_BASE_URL,
});
const backendValidation = await validateResolvedBackend(
  resolution.provider,
  resolution.baseUrl,
);

function buildProbeText(tokenCount) {
  return Array.from({ length: tokenCount }, (_, index) => `tok${index}`).join(' ');
}

function buildEndpoints(provider, baseUrl, model, text) {
  if (provider === 'llama-server') {
    return [
      {
        name: '/v1/embeddings',
        url: `${baseUrl}/v1/embeddings`,
        body: {
          model,
          input: text,
          encoding_format: 'float',
        },
      },
      {
        name: '/embedding',
        url: `${baseUrl}/embedding`,
        body: {
          content: text,
          embd_normalize: 2,
        },
      },
    ];
  }

  return [
    {
      name: '/api/embed',
      url: `${baseUrl}/api/embed`,
      body: {
        model,
        input: text,
        truncate: false,
      },
    },
    {
      name: '/api/embeddings',
      url: `${baseUrl}/api/embeddings`,
      body: {
        model,
        prompt: text,
      },
    },
  ];
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

async function probeLength(tokenCount) {
  const text = buildProbeText(tokenCount);
  const endpoints = buildEndpoints(
    resolution.provider,
    resolution.baseUrl,
    resolution.model,
    text,
  );
  const attempts = [];

  for (const endpoint of endpoints) {
    try {
      const result = await postJson(endpoint.url, endpoint.body);
      const responseError =
        typeof result.parsed?.error === 'string'
          ? result.parsed.error
          : typeof result.parsed?.error?.message === 'string'
            ? result.parsed.error.message
            : null;

      attempts.push({
        endpoint: endpoint.name,
        url: endpoint.url,
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

      if (result.ok) {
        return {
          tokenCount,
          attempts,
          acceptedBy: endpoint.name,
        };
      }
    } catch (error) {
      attempts.push({
        endpoint: endpoint.name,
        url: endpoint.url,
        ok: false,
        status: null,
        error: error instanceof Error ? error.message : String(error),
        boundaryKind: classifyEmbeddingError(
          error instanceof Error ? error.message : String(error),
        ),
      });
    }
  }

  return {
    tokenCount,
    attempts,
    acceptedBy: null,
  };
}

async function main() {
  const probes = [];

  for (const length of lengths) {
    probes.push(await probeLength(length));
  }

  const firstFailure = probes.find((probe) => probe.acceptedBy === null);
  const report = {
    generatedAt: new Date().toISOString(),
    resolution,
    backendValidation,
    lengths,
    probes,
    firstFailureAt: firstFailure?.tokenCount ?? null,
    status: backendValidation.valid
      ? probes.length > 0 && probes.some((probe) => probe.acceptedBy)
        ? 'PASS_WITH_WARNINGS'
        : 'FAIL'
      : 'PASS_WITH_WARNINGS',
    note:
      'This probe proves the resolved OpenAI-compatible endpoint accepted the boundary inputs. It does not, by itself, prove the dedicated llama-server.exe lane handled the requests. The exact original failing payload still needs a separate replay against the original endpoint and payload bytes.',
  };

  await fs.mkdir(reportDir, { recursive: true });
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

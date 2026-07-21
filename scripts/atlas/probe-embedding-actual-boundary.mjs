#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const reportDir = path.join(repoRoot, 'docs', 'reports');

const provider = String(process.env.EMBEDDING_PROVIDER ?? '').trim();
const baseUrl = String(process.env.EMBEDDING_BASE_URL ?? '').trim().replace(/\/+$/, '');
const endpointPath = String(process.env.EMBEDDING_ENDPOINT ?? '/v1/embeddings');
const model = String(process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest');
const reportSuffix = String(
  process.env.EMBEDDING_REPORT_SUFFIX ??
    (provider || baseUrl.replace(/[:/]+/g, '_') || 'unconfigured'),
).replace(/[^a-z0-9._-]+/gi, '_');
const counts = (process.env.EMBEDDING_COUNTS ?? '8,16,24,32,48,64,80,96,112,120,124,126,127,128,129,132')
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0);

if (!provider) throw new Error('Set EMBEDDING_PROVIDER explicitly.');
if (!baseUrl) throw new Error('Set EMBEDDING_BASE_URL explicitly.');

const endpointUrl = `${baseUrl}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`;

function buildText(wordCount) {
  return Array.from({ length: wordCount }, () => 'x').join(' ');
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

function parseActualCount(raw) {
  const match = raw.match(/input \((\d+) tokens\) is too large/i);
  return match ? Number(match[1]) : null;
}

async function main() {
  const probes = [];
  for (const count of counts) {
    const text = buildText(count);
    const result = await postJson(endpointUrl, {
      model,
      input: text,
      encoding_format: 'float',
    });

    const promptTokens = result.parsed?.usage?.prompt_tokens ?? null;
    const actualCount = parseActualCount(result.raw);
    probes.push({
      wordCount: count,
      ok: result.ok,
      status: result.status,
      promptTokens,
      actualCount,
      error: result.ok
        ? null
        : result.parsed?.error?.message ??
          result.parsed?.error ??
          result.raw.slice(0, 200),
    });
  }

  const firstFailure = probes.find((probe) => !probe.ok) ?? null;
  const report = {
    generatedAt: new Date().toISOString(),
    resolution: { provider, baseUrl, endpoint: endpointPath, model },
    counts,
    probes,
    firstFailureAtWordCount: firstFailure?.wordCount ?? null,
    firstFailureActualTokenCount: firstFailure?.actualCount ?? null,
    status: probes.some((probe) => probe.ok) ? 'PASS_WITH_WARNINGS' : 'FAIL',
    note:
      'This sweep uses a minimal x-token payload so the service-reported prompt token counts are visible. The probe records the server-reported actual token count on failure.',
  };

  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(
    reportDir,
    `embedding-actual-boundary-probe.${reportSuffix}.json`,
  );
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!probes.some((probe) => probe.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const BIFROST_URL = process.env.BIFROST_URL ?? 'http://127.0.0.1:3040';
const REPORT = process.argv.includes('--report');
const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;
const REPORT_PATH = process.env.BIFROST_PROVIDER_REPORT_PATH ?? 'docs/reports/bifrost-provider-ensure-latest.json';

const desiredProvider = {
  provider: 'ollama',
  base_url: process.env.BIFROST_OLLAMA_BASE_URL ?? 'http://host.docker.internal:11434',
  network_config: {
    default_request_timeout_in_seconds: Number(process.env.BIFROST_OLLAMA_TIMEOUT_SECONDS ?? '120'),
    max_retries: Number(process.env.BIFROST_OLLAMA_MAX_RETRIES ?? '1'),
    retry_backoff_initial: Number(process.env.BIFROST_OLLAMA_RETRY_BACKOFF_INITIAL ?? '5000'),
    retry_backoff_max: Number(process.env.BIFROST_OLLAMA_RETRY_BACKOFF_MAX ?? '10000'),
  },
};

function rel(file) {
  return path.join(ROOT, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(rel(file), 'utf8'));
}

function writeReport(data) {
  if (!REPORT) return;
  const full = rel(REPORT_PATH);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function getProvider() {
  const res = await fetch(`${BIFROST_URL}/api/providers/ollama`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) {
    throw new Error(`Failed to read Bifrost providers: ${res.status} ${await res.text().catch(() => '')}`);
  }
  return await res.json();
}

function providerNeedsUpdate(current) {
  if (!current) return true;
  const currentBase = current?.network_config?.base_url ?? null;
  const currentTimeout = Number(current?.network_config?.default_request_timeout_in_seconds ?? 0);
  const currentRetries = Number(current?.network_config?.max_retries ?? 0);
  return (
    currentBase !== desiredProvider.base_url ||
    currentTimeout < desiredProvider.network_config.default_request_timeout_in_seconds ||
    currentRetries < desiredProvider.network_config.max_retries
  );
}

async function putProvider(current) {
  const body = {
    network_config: {
      ...current?.network_config,
      base_url: desiredProvider.base_url,
      default_request_timeout_in_seconds: desiredProvider.network_config.default_request_timeout_in_seconds,
      max_retries: desiredProvider.network_config.max_retries,
      retry_backoff_initial: desiredProvider.network_config.retry_backoff_initial,
      retry_backoff_max: desiredProvider.network_config.retry_backoff_max,
    },
    concurrency_and_buffer_size: current?.concurrency_and_buffer_size ?? { concurrency: 1000, buffer_size: 5000 },
    proxy_config: current?.proxy_config ?? null,
    send_back_raw_request: current?.send_back_raw_request ?? false,
    send_back_raw_response: current?.send_back_raw_response ?? false,
    store_raw_request_response: current?.store_raw_request_response ?? false,
  };
  const res = await fetch(`${BIFROST_URL}/api/providers/ollama`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`Failed to update Bifrost ollama provider: ${res.status} ${text}`);
  }
  return text ? safeParse(text) : null;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const report = {
    ok: false,
    dryRun: DRY_RUN,
    applied: false,
    current: null,
    desired: desiredProvider,
    reason: null,
    providerUrl: BIFROST_URL,
  };

  try {
    report.current = await getProvider();
    report.reason = providerNeedsUpdate(report.current)
      ? 'Bifrost ollama provider network config needs update'
      : 'Bifrost ollama provider already matches the desired config';

    if (DRY_RUN) {
      report.ok = true;
      writeReport(report);
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (providerNeedsUpdate(report.current)) {
      await putProvider(report.current);
      report.applied = true;
      report.current = await getProvider();
      report.reason = 'Bifrost ollama provider updated successfully';
    }

    const current = report.current;
    const matches =
      !!current &&
      (current?.network_config?.base_url ?? null) === desiredProvider.base_url &&
      Number(current?.network_config?.default_request_timeout_in_seconds ?? 0) >=
        desiredProvider.network_config.default_request_timeout_in_seconds &&
      Number(current?.network_config?.max_retries ?? 0) >= desiredProvider.network_config.max_retries;

    if (!matches) {
      throw new Error(`Bifrost provider update verification failed: ${JSON.stringify(current, null, 2)}`);
    }

    report.ok = true;
    writeReport(report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.reason = error instanceof Error ? error.message : String(error);
    writeReport(report);
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

main();

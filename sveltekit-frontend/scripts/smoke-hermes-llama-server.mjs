#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const hermesHome =
  process.env.HERMES_HOME ??
  path.join(process.env.LOCALAPPDATA ?? `C:\\Users\\${process.env.USERNAME ?? 'james'}`, 'hermes');
const configPath =
  process.env.HERMES_CONFIG_PATH ?? path.join(hermesHome, 'config.yaml');
const hermesExe =
  process.env.HERMES_EXE ??
  path.join(hermesHome, 'hermes-agent', 'venv', 'Scripts', 'hermes.exe');

function parseConfigValue(contents, key) {
  const match = contents.match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm'));
  return match?.[1]?.replace(/^['"]|['"]$/g, '').trim();
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl ?? '').trim();
  if (!trimmed) return 'http://127.0.0.1:8092/v1';
  return trimmed.replace(/\/$/, '');
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${url} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (!existsSync(configPath)) {
    throw new Error(`Hermes config not found: ${configPath}`);
  }

  const config = readFileSync(configPath, 'utf8');
  const baseUrl = normalizeBaseUrl(parseConfigValue(config, 'base_url'));
  const model = parseConfigValue(config, 'default') ?? 'gemma4-legal-iq4xs-direct.gguf';
  const rootUrl = baseUrl.replace(/\/v1$/, '');

  const health = await fetchJson(`${rootUrl}/health`);
  const models = await fetchJson(`${baseUrl}/models`);
  const modelId = models?.data?.[0]?.id ?? models?.models?.[0]?.model ?? models?.models?.[0]?.name;

  if (modelId !== model) {
    throw new Error(`Model mismatch: config=${model} api=${modelId ?? 'missing'}`);
  }

  let hermesReply = '';
  if (existsSync(hermesExe)) {
    const run = spawnSync(
      hermesExe,
      ['-z', 'reply with exactly: ok', '--provider', 'custom', '--model', model],
      {
        encoding: 'utf8',
        timeout: 180_000,
        env: { ...process.env },
      }
    );

    if (run.error) {
      throw run.error;
    }
    if (run.status !== 0) {
      throw new Error(
        `Hermes exited ${run.status}: ${(run.stderr || run.stdout || '').trim().slice(0, 500)}`
      );
    }

    hermesReply = (run.stdout || '').trim();
    if (!/^ok\b/i.test(hermesReply)) {
      throw new Error(`Unexpected Hermes response: ${hermesReply.slice(0, 200)}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        configPath,
        baseUrl,
        model,
        health,
        modelId,
        hermesExe: existsSync(hermesExe) ? hermesExe : null,
        hermesReply,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});

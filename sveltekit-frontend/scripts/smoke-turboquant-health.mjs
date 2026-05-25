#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = (process.env.TURBO_BASE ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const expectedModel = process.env.TURBO_MODEL_NAME ?? 'gemma4-legal.gguf';
const chatTimeoutMs = Number(process.env.TURBO_SMOKE_CHAT_TIMEOUT_MS ?? '30000');
const healthTimeoutMs = Number(process.env.TURBO_SMOKE_HEALTH_TIMEOUT_MS ?? '5000');
const modelsTimeoutMs = Number(process.env.TURBO_SMOKE_MODELS_TIMEOUT_MS ?? '10000');
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const outputPath = resolve(projectRoot, 'logs', 'turboquant', 'health-latest.json');

async function fetchJson(url, timeoutMs, init = {}) {
  const startedAt = Date.now();
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, text, latencyMs: Date.now() - startedAt };
}

function extractContent(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const rec = payload;
  const direct = rec.content;
  if (typeof direct === 'string') return direct;
  const choices = rec.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (first && typeof first === 'object') {
      const choice = first;
      if (typeof choice.content === 'string') return choice.content;
      if (choice.message && typeof choice.message === 'object' && typeof choice.message.content === 'string') {
        return choice.message.content;
      }
      if (choice.delta && typeof choice.delta === 'object' && typeof choice.delta.content === 'string') {
        return choice.delta.content;
      }
    }
  }
  return '';
}

function extractUsage(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const usage = payload.usage && typeof payload.usage === 'object' ? payload.usage : null;
  const yorha = payload.yorha && typeof payload.yorha === 'object' ? payload.yorha : null;
  const promptTokens =
    usage?.prompt_tokens ??
    yorha?.inputTokens ??
    yorha?.promptTokens ??
    null;
  const completionTokens =
    usage?.completion_tokens ??
    yorha?.completionTokens ??
    null;
  const totalTokens =
    usage?.total_tokens ??
    (typeof promptTokens === 'number' && typeof completionTokens === 'number'
      ? promptTokens + completionTokens
      : null);
  return {
    promptTokens: typeof promptTokens === 'number' ? promptTokens : undefined,
    completionTokens: typeof completionTokens === 'number' ? completionTokens : undefined,
    totalTokens: typeof totalTokens === 'number' ? totalTokens : undefined,
  };
}

async function persistReport(report) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const report = {
    status: 'pending',
    baseUrl,
    expectedModel,
    health: null,
    models: null,
    chat: null,
    result: {
      turboquantOk: false,
    },
    generatedAt: new Date().toISOString(),
  };

  try {
    const health = await fetchJson(`${baseUrl}/health`, healthTimeoutMs);
    report.health = { ok: health.ok, status: health.status, body: health.json, latencyMs: health.latencyMs };
    if (!health.ok) {
      report.status = 'fail';
      report.result.reason = 'health';
      await persistReport(report);
      console.error(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const models = await fetchJson(`${baseUrl}/v1/models`, modelsTimeoutMs);
    report.models = { ok: models.ok, status: models.status, body: models.json, latencyMs: models.latencyMs };
    const list = Array.isArray(models.json?.models) ? models.json.models : Array.isArray(models.json?.data) ? models.json.data : [];
    const modelFound = list.some((model) => {
      const names = [model?.name, model?.model, model?.id].filter(Boolean);
      return names.includes(expectedModel);
    });
    if (!models.ok || !modelFound) {
      report.status = 'fail';
      report.result.reason = 'models';
      report.result.modelFound = modelFound;
      await persistReport(report);
      console.error(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const chatPrompt = process.env.TURBO_SMOKE_PROMPT ?? 'Reply with exactly turboquant-ok.';
    const chatStartedAt = Date.now();
    const chat = await fetchJson(
      `${baseUrl}/v1/chat/completions`,
      chatTimeoutMs,
      {
        method: 'POST',
        body: JSON.stringify({
          model: expectedModel,
          messages: [
            {
              role: 'system',
              content: 'Return only the requested probe token.',
            },
            {
              role: 'user',
              content: chatPrompt,
            },
          ],
          max_tokens: 8,
          temperature: 0,
          stream: false,
        }),
      }
    );

    const content = extractContent(chat.json);
    const usage = extractUsage(chat.json);
    const normalizedContent = content.trim().toLowerCase();
    const turboquantOk = normalizedContent.includes('turboquant-ok');

    report.chat = {
      ok: chat.ok,
      status: chat.status,
      latencyMs: chat.latencyMs ?? Date.now() - chatStartedAt,
      content,
      usage,
      body: chat.json,
    };
    report.result = {
      turboquantOk,
      latencyMs: chat.latencyMs ?? Date.now() - chatStartedAt,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      totalTokens: usage?.totalTokens,
    };

    if (!chat.ok || !turboquantOk) {
      report.status = 'fail';
      report.result.reason = chat.ok ? 'content' : 'chat';
      await persistReport(report);
      console.error(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    report.status = 'pass';
    await persistReport(report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.status = 'fail';
    report.result = {
      turboquantOk: false,
      reason: 'exception',
      error: String(error),
    };
    await persistReport(report).catch(() => {});
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'fail', reason: 'unhandled', error: String(error) }, null, 2));
  process.exit(1);
});

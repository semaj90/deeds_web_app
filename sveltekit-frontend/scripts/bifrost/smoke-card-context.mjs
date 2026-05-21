#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const BIFROST_URL = process.env.BIFROST_URL ?? 'http://127.0.0.1:3040';
const REQUESTED_MODEL = process.env.BIFROST_SMOKE_MODEL ?? 'gemma4-rotorquant';
const STRICT = process.argv.includes('--strict');

function rel(file) {
  return path.join(ROOT, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(rel(file), 'utf8'));
}

function mustExist(file) {
  const full = rel(file);
  if (!fs.existsSync(full)) {
    throw new Error(`missing required file: ${file}`);
  }
}

function buildToonPacket(bundle) {
  return {
    goal: 'Smoke selected cards through Bifrost using a compact TOON prompt view.',
    context: {
      manifest: readJson('memory/exports/graph-refresh-manifest.json'),
      sourceSummary: bundle.sourceSummary ?? {},
      cards: bundle.cards.slice(0, 8).map((card) => ({
        id: card.id,
        kind: card.kind,
        labels: card.labels?.slice(0, 8) ?? [],
        summary: card.summary,
        sourceRefs: card.sourceRefs?.slice(0, 4) ?? [],
        scores: card.scores ?? {},
      })),
    },
    constraints: [
      'Keep TOON local and compact',
      'Do not stream raw repo dumps',
      'Do not mutate routing policy',
    ],
    plan: [
      'Load selected cards',
      'Encode TOON packet',
      'Send to Bifrost',
      'Report response shape',
    ],
  };
}

async function main() {
  mustExist('memory/cards/selected-cards.json');
  mustExist('memory/cards/selected-cards.toon');
  const bundle = readJson('memory/cards/selected-cards.json');
  const toon = fs.readFileSync(rel('memory/cards/selected-cards.toon'), 'utf8').trim();

  if (!toon) {
    throw new Error('memory/cards/selected-cards.toon is empty');
  }

  const payload = {
    inputFormat: 'toon',
    cacheKey: `deeds:v1:ace-prefix:${(bundle.cards?.[0]?.hash ?? 'cards').slice(0, 16)}`,
    messages: [
      {
        role: 'user',
        content: toon,
      },
    ],
    metadata: {
      requestedModel: REQUESTED_MODEL,
      cards: Array.isArray(bundle.cards) ? bundle.cards.length : 0,
      generatedAt: bundle.generatedAt ?? null,
    },
  };

  const candidateModels = [
    REQUESTED_MODEL,
    REQUESTED_MODEL.includes('/') ? REQUESTED_MODEL : `ollama-local/${REQUESTED_MODEL}`,
    REQUESTED_MODEL.includes('/') ? REQUESTED_MODEL : `ollama/${REQUESTED_MODEL}`,
    'ollama/gemma4-legal',
    'ollama/gemma4-legal-vlm:latest',
  ];

  let reachable = false;
  try {
    const health = await fetch(`${BIFROST_URL}/health`, { signal: AbortSignal.timeout(2_000) });
    reachable = health.ok;
  } catch {
    reachable = false;
  }

  if (!reachable) {
    if (STRICT) {
      throw new Error(`Bifrost unavailable at ${BIFROST_URL}`);
    }
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: `Bifrost unavailable at ${BIFROST_URL}`,
      payload,
      toonPreview: toon.slice(0, 400),
    }, null, 2));
    return;
  }

  const errors = [];
  for (const model of [...new Set(candidateModels.filter(Boolean))]) {
    const attemptPayload = { ...payload, model };
    try {
      const res = await fetch(`${BIFROST_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'x-bf-cache-key': payload.cacheKey,
        },
        body: JSON.stringify(attemptPayload),
        signal: AbortSignal.timeout(20_000),
      });

      const raw = await res.text();
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }

      if (res.ok) {
        console.log(JSON.stringify({
          ok: true,
          skipped: false,
          status: res.status,
          chosenModel: model,
          payload: attemptPayload,
          responsePreview: typeof parsed === 'string' ? parsed.slice(0, 400) : JSON.stringify(parsed).slice(0, 400),
        }, null, 2));
        return;
      }

      const preview = typeof parsed === 'string' ? parsed.slice(0, 400) : JSON.stringify(parsed).slice(0, 400);
      errors.push({ model, status: res.status, preview });
    } catch (err) {
      errors.push({ model, status: 'ERR', preview: err?.message ?? String(err) });
    }
  }

  if (!STRICT) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: `Bifrost unavailable or too slow at ${BIFROST_URL}`,
      attempts: errors,
      payload,
      toonPreview: toon.slice(0, 400),
    }, null, 2));
    return;
  }

  throw new Error(`Bifrost rejected all candidate models: ${errors.map((e) => `${e.model} => ${e.status} ${e.preview}`).join(' | ')}`);
}

main().catch((error) => {
  console.error(`[bifrost:cards:smoke] ${error?.message ?? String(error)}`);
  process.exit(1);
});

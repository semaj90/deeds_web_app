#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const BIFROST_URL = process.env.BIFROST_URL ?? 'http://127.0.0.1:3040';
const REQUESTED_MODEL = process.env.BIFROST_SMOKE_MODEL ?? 'ollama/gemma4-rotorquant:latest';
const STRICT = process.argv.includes('--strict');
const REPORT = process.argv.includes('--report');
const FAIL_OPEN = process.argv.includes('--fail-open');
const REPORT_PATH =
  process.env.BIFROST_SMOKE_REPORT_PATH ?? 'docs/reports/bifrost-cards-smoke-latest.json';
const MODEL_LOAD_RETRIES = Math.max(1, Number(process.env.BIFROST_SMOKE_MODEL_RETRIES ?? '3'));
const MODEL_LOAD_BACKOFF_MS = Math.max(
  500,
  Number(process.env.BIFROST_SMOKE_MODEL_BACKOFF_MS ?? '5000')
);
const CHAT_TIMEOUT_MS = Math.max(
  10_000,
  Number(process.env.BIFROST_SMOKE_CHAT_TIMEOUT_MS ?? '60000')
);
const CONFIGURED_PROVIDER_TIMEOUT_SECONDS = Number.isFinite(
  Number(process.env.BIFROST_PROVIDER_TIMEOUT_SECONDS)
)
  ? Number(process.env.BIFROST_PROVIDER_TIMEOUT_SECONDS)
  : null;
const WARMUP_ENABLED = STRICT && process.env.BIFROST_SMOKE_WARMUP !== '0';
const WARMUP_TIMEOUT_MS = Math.max(
  5_000,
  Number(process.env.BIFROST_SMOKE_WARMUP_TIMEOUT_MS ?? '90000')
);
const MAX_TOTAL_ATTEMPTS = Math.max(
  1,
  Number(process.env.BIFROST_SMOKE_MAX_TOTAL_ATTEMPTS ?? (STRICT ? '12' : '3'))
);
const MAX_MODELS_NON_STRICT = Math.max(
  1,
  Number(process.env.BIFROST_SMOKE_MAX_MODELS ?? (STRICT ? '99' : '2'))
);

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

function writeReport(data) {
  if (!REPORT) return;
  const full = rel(REPORT_PATH);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function parseProviderTimeoutSeconds(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/default is\s*(\d+)\s*seconds/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

function createProviderTimeoutDiagnosis() {
  const diagnosis = {
    smokeChatTimeoutMs: CHAT_TIMEOUT_MS,
    configuredProviderTimeoutSeconds: CONFIGURED_PROVIDER_TIMEOUT_SECONDS,
    inferredProviderTimeoutSeconds: null,
    mismatch: false,
    source: null,
    recommendation: null,
  };

  if (
    Number.isFinite(diagnosis.configuredProviderTimeoutSeconds) &&
    diagnosis.configuredProviderTimeoutSeconds * 1000 < CHAT_TIMEOUT_MS
  ) {
    diagnosis.mismatch = true;
    diagnosis.source = 'env';
    diagnosis.recommendation =
      'Increase Bifrost provider default_request_timeout_in_seconds to be >= BIFROST_SMOKE_CHAT_TIMEOUT_MS/1000.';
  }

  return diagnosis;
}

function applyTimeoutInference(diagnosis, preview) {
  if (!diagnosis || diagnosis.inferredProviderTimeoutSeconds !== null) return;
  const inferred = parseProviderTimeoutSeconds(preview);
  if (!Number.isFinite(inferred)) return;
  diagnosis.inferredProviderTimeoutSeconds = inferred;
  if (inferred * 1000 < diagnosis.smokeChatTimeoutMs) {
    diagnosis.mismatch = true;
    if (!diagnosis.source) diagnosis.source = 'error_preview';
    if (!diagnosis.recommendation) {
      diagnosis.recommendation =
        'Increase Bifrost provider default_request_timeout_in_seconds to be >= BIFROST_SMOKE_CHAT_TIMEOUT_MS/1000.';
    }
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
  const providerTimeoutDiagnosis = createProviderTimeoutDiagnosis();

  const preferredModelOrder = [
    REQUESTED_MODEL,
    REQUESTED_MODEL.includes('/') ? REQUESTED_MODEL : `ollama/${REQUESTED_MODEL}`,
    'ollama/gemma4-rotorquant:latest',
    'ollama/gemma4-rotorquant:latest',
    'ollama/gemma4-rotorquant:latest',
    'ollama/gemma4-rotorquant:latest',
    'ollama/ssfdre38/gemma4-turbo:e4b',
  ];

  const candidateModels = new Set([...preferredModelOrder, 'ollama/gemma4-rotorquant:latest']);

  try {
    const modelList = await fetch(`${BIFROST_URL}/v1/models`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (modelList.ok) {
      const json = await modelList.json();
      const liveModels = Array.isArray(json?.data)
        ? json.data.map((item) => item?.id).filter(Boolean)
        : [];
      for (const model of preferredModelOrder) {
        if (liveModels.includes(model)) candidateModels.add(model);
      }
    }
  } catch {
    // Best effort only; fall back to the static model list below.
  }

  let reachable = false;
  try {
    const health = await fetch(`${BIFROST_URL}/health`, { signal: AbortSignal.timeout(2_000) });
    reachable = health.ok;
  } catch {
    reachable = false;
  }

  if (!reachable) {
    const unavailableResult = {
      ok: !STRICT || FAIL_OPEN,
      skipped: true,
      reason: `Bifrost unavailable at ${BIFROST_URL}`,
      providerTimeoutDiagnosis,
      strict: STRICT,
      failOpen: FAIL_OPEN,
      reportPath: REPORT ? REPORT_PATH : null,
      payload,
      toonPreview: toon.slice(0, 400),
    };
    writeReport(unavailableResult);

    if (STRICT) {
      if (FAIL_OPEN) {
        console.log(JSON.stringify(unavailableResult, null, 2));
        return;
      }
      throw new Error(`Bifrost unavailable at ${BIFROST_URL}`);
    }
    console.log(JSON.stringify(unavailableResult, null, 2));
    return;
  }

  if (STRICT && FAIL_OPEN) {
    const failOpenProbe = {
      ok: true,
      skipped: true,
      reason: `Strict fail-open probe mode enabled at ${BIFROST_URL}`,
      providerTimeoutDiagnosis,
      strict: STRICT,
      failOpen: FAIL_OPEN,
      reportPath: REPORT ? REPORT_PATH : null,
      candidateModels: [...candidateModels].filter(Boolean),
      payload,
      toonPreview: toon.slice(0, 400),
    };
    writeReport(failOpenProbe);
    console.log(JSON.stringify(failOpenProbe, null, 2));
    return;
  }

  let warmup = {
    attempted: false,
    ok: null,
    status: null,
    preview: null,
    model: REQUESTED_MODEL,
  };

  if (WARMUP_ENABLED) {
    warmup.attempted = true;
    try {
      const warmupBody = {
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'warmup: respond READY' }],
        max_tokens: 4,
        temperature: 0,
      };
      const res = await fetch(`${BIFROST_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(warmupBody),
        signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
      });
      const raw = await Promise.race([
        res.text(),
        new Promise((resolve) => setTimeout(() => resolve('__BODY_READ_TIMEOUT__'), 3_000)),
      ]);
      warmup.ok = res.ok;
      warmup.status = res.status;
      warmup.preview =
        typeof raw === 'string' ? raw.slice(0, 240) : JSON.stringify(raw).slice(0, 240);
    } catch (err) {
      warmup.ok = false;
      warmup.status = 'ERR';
      warmup.preview = err?.message ?? String(err);
    }
  }

  const errors = [];
  const orderedCandidates = [...candidateModels].filter(Boolean);
  const activeCandidates = STRICT
    ? orderedCandidates
    : orderedCandidates.slice(0, Math.min(MAX_MODELS_NON_STRICT, orderedCandidates.length));
  const activeRetries = STRICT ? MODEL_LOAD_RETRIES : 1;
  const activeChatTimeoutMs = STRICT ? CHAT_TIMEOUT_MS : Math.min(CHAT_TIMEOUT_MS, 20_000);
  let totalAttempts = 0;

  for (const model of activeCandidates) {
    if (!/gemma4|gemma3|ssfdre38\/gemma4-turbo/i.test(String(model))) continue;
    const attemptPayload = { ...payload, model };
    for (let attempt = 1; attempt <= activeRetries; attempt += 1) {
      if (totalAttempts >= MAX_TOTAL_ATTEMPTS) break;
      totalAttempts += 1;
      try {
        const res = await fetch(`${BIFROST_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-bf-cache-key': payload.cacheKey,
          },
          body: JSON.stringify(attemptPayload),
          signal: AbortSignal.timeout(activeChatTimeoutMs),
        });

        const raw = await Promise.race([
          res.text(),
          new Promise((resolve) => setTimeout(() => resolve('__BODY_READ_TIMEOUT__'), 3_000)),
        ]);
        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }

        if (res.ok) {
          const successResult = {
            ok: true,
            skipped: false,
            status: res.status,
            chosenModel: model,
            modelAttempt: attempt,
            warmup,
            strict: STRICT,
            failOpen: FAIL_OPEN,
            reportPath: REPORT ? REPORT_PATH : null,
            payload: attemptPayload,
            responsePreview:
              typeof parsed === 'string'
                ? parsed.slice(0, 400)
                : JSON.stringify(parsed).slice(0, 400),
          };
          writeReport(successResult);
          console.log(JSON.stringify(successResult, null, 2));
          return;
        }

        const preview =
          typeof parsed === 'string' ? parsed.slice(0, 400) : JSON.stringify(parsed).slice(0, 400);
        applyTimeoutInference(providerTimeoutDiagnosis, preview);
        const loadingModel =
          typeof preview === 'string' && preview.includes('llm server loading model');

        if (loadingModel && attempt < activeRetries) {
          errors.push({
            model,
            attempt,
            status: res.status,
            preview: `${preview} (retrying in ${MODEL_LOAD_BACKOFF_MS}ms)`,
          });
          await new Promise((resolve) => setTimeout(resolve, MODEL_LOAD_BACKOFF_MS));
          continue;
        }

        errors.push({ model, attempt, status: res.status, preview });
        break;
      } catch (err) {
        const preview = err?.message ?? String(err);
        applyTimeoutInference(providerTimeoutDiagnosis, preview);
        errors.push({ model, attempt, status: 'ERR', preview });
        break;
      }
    }

    if (totalAttempts >= MAX_TOTAL_ATTEMPTS) break;
  }

  if (!STRICT) {
    const skippedResult = {
      ok: true,
      skipped: true,
      reason: `Bifrost unavailable or too slow at ${BIFROST_URL}`,
      providerTimeoutDiagnosis,
      strict: STRICT,
      failOpen: FAIL_OPEN,
      reportPath: REPORT ? REPORT_PATH : null,
      attempts: errors,
      payload,
      toonPreview: toon.slice(0, 400),
    };
    writeReport(skippedResult);
    console.log(JSON.stringify(skippedResult, null, 2));
    return;
  }

  const strictFailure = {
    ok: false,
    skipped: false,
    reason: `Bifrost rejected all candidate models at ${BIFROST_URL}`,
    providerTimeoutDiagnosis,
    warmup,
    strict: STRICT,
    failOpen: FAIL_OPEN,
    reportPath: REPORT ? REPORT_PATH : null,
    attempts: errors,
    payload,
    toonPreview: toon.slice(0, 400),
  };
  writeReport(strictFailure);

  if (FAIL_OPEN) {
    strictFailure.ok = true;
    strictFailure.skipped = true;
    strictFailure.reason = `${strictFailure.reason} (fail-open enabled)`;
    writeReport(strictFailure);
    console.log(JSON.stringify(strictFailure, null, 2));
    return;
  }

  throw new Error(`Bifrost rejected all candidate models: ${errors.map((e) => `${e.model} => ${e.status} ${e.preview}`).join(' | ')}`);
}

main().catch((error) => {
  console.error(`[bifrost:cards:smoke] ${error?.message ?? String(error)}`);
  process.exit(1);
});

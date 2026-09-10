#!/usr/bin/env node
/**
 * ORNITH-VLM-RUNTIME-02
 *
 * Read-only authority proof for the active Ornith 1.5 VLM boundary.
 *
 * This script:
 *   1. proves llama.cpp :8090 health and Ornith identity
 *   2. requires /props.modalities.vision === true
 *   3. sends a deterministic PNG through /v1/chat/completions as image_url
 *   4. sends the same PNG through Docling /ocr/vlm
 *   5. monitors the Docling container network namespace for any :11434 TCP use
 *   6. records a derived JSON receipt only (no canonical datastore writes)
 *
 * It intentionally does NOT launch/restart/stop/rebuild any container or model.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = path.join(ROOT, 'docs/reports/ornith-vlm-runtime-02.json');

const LLAMA_BASE = (process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');
const DOCLING_BASE = (process.env.DOCLING_VLM_URL || 'http://127.0.0.1:8085').replace(/\/+$/, '');
const DOCLING_CONTAINER = process.env.DOCLING_VLM_CONTAINER || 'legal-ai-docling-vlm';
const EXPECTED_MODEL_RE = /^ornith-1\.5(?:-|$)/i;
const EXPECTED_MMPROJ_SHA256 =
  '626f9f90627402a6bf4a999111d0fbd69b5fcca7aa8ba089d69e5f10e8858e1d';

// Deterministic 384x160 PNG containing large black text "ORNITH 42".
const FIXTURE_B64 =
  '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';

const FIXTURE = Buffer.from(FIXTURE_B64, 'base64');
const FIXTURE_SHA256 = crypto.createHash('sha256').update(FIXTURE).digest('hex');
const TIMEOUT_MS = Number(process.env.ORNITH_VLM_PROOF_TIMEOUT_MS || 180_000);
const noReport = process.argv.includes('--no-report');

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function now() {
  return new Date().toISOString();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const signal = AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...options, signal });
}

async function getJson(url, timeoutMs = 10_000) {
  const response = await fetchWithTimeout(url, {}, timeoutMs);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`NON_JSON_RESPONSE ${url} status=${response.status} body=${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP_${response.status} ${url}: ${text.slice(0, 500)}`);
  }
  return { response, data };
}

function modelIds(models) {
  const rows = Array.isArray(models?.data) ? models.data : [];
  return rows.map((row) => String(row?.id || '')).filter(Boolean);
}

function extractMessageText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : String(part?.text || '')))
      .join('')
      .trim();
  }
  return '';
}

function fixtureEvidence(text) {
  const normalized = String(text || '').toUpperCase().replace(/\s+/g, ' ');
  return {
    nonEmpty: normalized.length > 0,
    sawOrnith: normalized.includes('ORNITH'),
    saw42: /\b42\b/.test(normalized),
    normalizedPreview: normalized.slice(0, 300),
  };
}

function readIfExists(rel) {
  const full = path.join(ROOT, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

function activeDoclingStaticAudit() {
  const dockerfile = readIfExists('docker/docling-vlm/Dockerfile');
  const compose = readIfExists('docker-compose.yml');

  const wrapperActive = /app_ornith:app/.test(dockerfile);
  const directActive = /(?:^|["'])app:app(?:["']|$)/m.test(dockerfile) && !wrapperActive;
  const activeSource = wrapperActive
    ? [
        readIfExists('docker/docling-vlm/app_ornith.py'),
        readIfExists('docker/docling-vlm/ornith_vlm_client.py'),
      ].join('\n')
    : readIfExists('docker/docling-vlm/app.py');

  const composeMatch = compose.match(
    /^\s{2}docling-vlm:\s*$([\s\S]*?)(?=^\s{2}[A-Za-z0-9_.-]+:\s*$|^volumes:\s*$|^networks:\s*$|\z)/m
  );
  const composeSection = composeMatch?.[0] || '';

  const forbidden = [
    ['ollama_vlm_model', /OLLAMA_VLM_MODEL/i],
    ['ollama_api_chat', /\/api\/chat/i],
    ['gemma4_model', /gemma4[:_-]/i],
  ];

  const sourceFindings = forbidden
    .filter(([, re]) => re.test(activeSource))
    .map(([name]) => name);
  const composeFindings = [
    /OLLAMA_BASE_URL/i.test(composeSection) ? 'compose_ollama_base_url' : null,
    /OLLAMA_URL/i.test(composeSection) ? 'compose_ollama_url' : null,
    /gemma4[:_-]/i.test(composeSection) ? 'compose_gemma4_model' : null,
  ].filter(Boolean);

  return {
    wrapperActive,
    directActive,
    activeEntrypointKnown: wrapperActive || directActive,
    sourceFindings,
    composeFindings,
    pass:
      (wrapperActive || directActive) &&
      sourceFindings.length === 0 &&
      composeFindings.length === 0,
  };
}

function startOllamaPortMonitor() {
  const portHex = (11434).toString(16).toUpperCase();
  const shell = [
    'while true; do',
    `  if { cat /proc/net/tcp /proc/net/tcp6 2>/dev/null || true; } | grep -qi ':${portHex}'; then`,
    '    echo OLLAMA_PORT_HIT',
    '    exit 9',
    '  fi',
    '  sleep 0.05',
    'done',
  ].join('\n');

  const child = spawn('docker', ['exec', DOCLING_CONTAINER, 'sh', '-c', shell], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';
  let exited = false;
  let exitCode = null;

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  return {
    child,
    async settle() {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { exited, exitCode, stdout, stderr };
    },
    async stop() {
      if (!exited) child.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => child.once('close', resolve)),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      return {
        exited,
        exitCode,
        stdout,
        stderr,
        observed11434: /OLLAMA_PORT_HIT/.test(stdout) || exitCode === 9,
        monitorUsable: !/No such container|not found|executable file/i.test(stderr),
      };
    },
  };
}

function previousMmprojProof() {
  const rel = 'docs/reports/ornith-vlm-mmproj-01-proof-v1.json';
  const text = readIfExists(rel);
  if (!text) return { present: false };
  try {
    const parsed = JSON.parse(text);
    return {
      present: true,
      gateStatus: parsed.gateStatus ?? null,
      artifactSha256: parsed.projector?.artifactSha256 ?? null,
      artifactSizeBytes: parsed.projector?.artifactSizeBytes ?? null,
      modelIdentityStableAcrossAllCalls:
        parsed.liveProof?.modelIdentityStableAcrossAllCalls ?? null,
      checksumMatchesExpected:
        parsed.projector?.artifactSha256 === EXPECTED_MMPROJ_SHA256,
    };
  } catch (error) {
    return { present: true, parseError: String(error?.message || error) };
  }
}

function writeAtomicJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch (error) {
    if (error?.code !== 'EEXIST' && error?.code !== 'EPERM') throw error;
    fs.rmSync(filePath, { force: true });
    fs.renameSync(tmp, filePath);
  }
}

const checks = {};
const blockers = [];
const observed = {
  runAt: now(),
  llamaBase: LLAMA_BASE,
  doclingBase: DOCLING_BASE,
  doclingContainer: DOCLING_CONTAINER,
  fixture: {
    description: '384x160 PNG with visible text ORNITH 42',
    sha256: FIXTURE_SHA256,
    bytes: FIXTURE.length,
  },
  upstreamProjector: {
    expectedFile: 'mmproj-Ornith-1.5-9B-BF16.gguf',
    expectedSha256: EXPECTED_MMPROJ_SHA256,
  },
  priorMmprojProof: previousMmprojProof(),
};

function pass(name, detail = true) {
  checks[name] = { pass: true, detail };
}

function fail(name, detail) {
  checks[name] = { pass: false, detail };
  blockers.push(name);
}

async function main() {
  const staticAudit = activeDoclingStaticAudit();
  observed.staticAudit = staticAudit;
  if (staticAudit.pass) pass('STATIC_ACTIVE_DOCLING_NO_OLLAMA_GEMMA', staticAudit);
  else fail('STATIC_ACTIVE_DOCLING_NO_OLLAMA_GEMMA', staticAudit);

  try {
    const { data } = await getJson(`${LLAMA_BASE}/health`, 5_000);
    observed.llamaHealth = data;
    pass('LLAMA_HEALTH_HTTP_200', data);
  } catch (error) {
    fail('LLAMA_HEALTH_HTTP_200', String(error?.message || error));
  }

  let models = null;
  try {
    const result = await getJson(`${LLAMA_BASE}/v1/models`, 5_000);
    models = result.data;
    const ids = modelIds(models);
    observed.models = ids;
    const ornithIds = ids.filter((id) => EXPECTED_MODEL_RE.test(id));
    if (ornithIds.length >= 1) pass('LLAMA_MODELS_ORNITH_15_IDENTITY', ornithIds);
    else fail('LLAMA_MODELS_ORNITH_15_IDENTITY', ids);
  } catch (error) {
    fail('LLAMA_MODELS_ORNITH_15_IDENTITY', String(error?.message || error));
  }

  let props = null;
  let liveAlias = null;
  try {
    const result = await getJson(`${LLAMA_BASE}/props`, 5_000);
    props = result.data;
    liveAlias = String(props?.model_alias || '').trim() || modelIds(models)[0] || '';
    observed.props = {
      model_alias: props?.model_alias ?? null,
      model_path: props?.model_path ?? null,
      build_info: props?.build_info ?? null,
      modalities: props?.modalities ?? null,
      chatTemplateSha256: props?.chat_template ? sha256Text(props.chat_template) : null,
      chatTemplateCaps: props?.chat_template_caps ?? null,
    };

    if (EXPECTED_MODEL_RE.test(liveAlias)) pass('PROPS_MODEL_ALIAS_ORNITH_15', liveAlias);
    else fail('PROPS_MODEL_ALIAS_ORNITH_15', liveAlias || null);

    if (props?.modalities?.vision === true) pass('PROPS_VISION_TRUE', props.modalities);
    else fail('PROPS_VISION_TRUE', props?.modalities ?? null);

    if (props?.build_info) pass('LLAMA_BUILD_IDENTITY_CAPTURED', props.build_info);
    else fail('LLAMA_BUILD_IDENTITY_CAPTURED', 'build_info missing from /props');
  } catch (error) {
    fail('PROPS_MODEL_ALIAS_ORNITH_15', String(error?.message || error));
    fail('PROPS_VISION_TRUE', String(error?.message || error));
    fail('LLAMA_BUILD_IDENTITY_CAPTURED', String(error?.message || error));
  }

  if (
    observed.priorMmprojProof.present &&
    observed.priorMmprojProof.gateStatus === 'LIVE_GET_PROVEN' &&
    observed.priorMmprojProof.checksumMatchesExpected
  ) {
    pass('MMPROJ_ARTIFACT_IDENTITY_CARRIED_FORWARD', observed.priorMmprojProof);
  } else {
    fail('MMPROJ_ARTIFACT_IDENTITY_CARRIED_FORWARD', observed.priorMmprojProof);
  }

  if (liveAlias && props?.modalities?.vision === true) {
    try {
      const response = await fetchWithTimeout(`${LLAMA_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: liveAlias,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Read the exact text visible in this image. Reply only with the visible text.',
                },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${FIXTURE_B64}` },
                },
              ],
            },
          ],
          temperature: 0,
          max_tokens: 32,
          stream: false,
        }),
      });

      const raw = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error(`direct VLM returned non-JSON status=${response.status}: ${raw.slice(0, 500)}`);
      }
      if (!response.ok) throw new Error(`direct VLM HTTP ${response.status}: ${raw.slice(0, 500)}`);

      const text = extractMessageText(payload);
      const evidence = fixtureEvidence(text);
      observed.directMultimodal = {
        httpStatus: response.status,
        model: payload?.model ?? null,
        systemFingerprint: payload?.system_fingerprint ?? null,
        text,
        evidence,
      };

      if (evidence.nonEmpty) pass('DIRECT_VLM_NONEMPTY', evidence);
      else fail('DIRECT_VLM_NONEMPTY', evidence);

      if (evidence.sawOrnith && evidence.saw42) pass('DIRECT_VLM_FIXTURE_GROUNDED', evidence);
      else fail('DIRECT_VLM_FIXTURE_GROUNDED', evidence);

      const returnedModel = String(payload?.model || liveAlias);
      if (EXPECTED_MODEL_RE.test(returnedModel) || returnedModel === liveAlias) {
        pass('DIRECT_VLM_MODEL_IDENTITY_STABLE', returnedModel);
      } else {
        fail('DIRECT_VLM_MODEL_IDENTITY_STABLE', returnedModel);
      }
    } catch (error) {
      fail('DIRECT_VLM_NONEMPTY', String(error?.message || error));
      fail('DIRECT_VLM_FIXTURE_GROUNDED', String(error?.message || error));
      fail('DIRECT_VLM_MODEL_IDENTITY_STABLE', String(error?.message || error));
    }
  } else {
    fail('DIRECT_VLM_NONEMPTY', 'skipped: identity/capability gate not ready');
    fail('DIRECT_VLM_FIXTURE_GROUNDED', 'skipped: identity/capability gate not ready');
    fail('DIRECT_VLM_MODEL_IDENTITY_STABLE', 'skipped: identity/capability gate not ready');
  }

  try {
    const { data } = await getJson(`${DOCLING_BASE}/health`, 15_000);
    observed.doclingHealth = data;

    const config = data?.config || {};
    const provider = String(config.vlm_provider || '').toLowerCase();
    const model = String(config.vlm_model || '');
    const url = String(config.vlm_url || config.llama_server_url || '');
    const configText = JSON.stringify(config);

    if (data?.services?.vlm_ocr === true) pass('DOCLING_VLM_HEALTH_TRUE', data.services);
    else fail('DOCLING_VLM_HEALTH_TRUE', data?.services ?? data);

    if (provider === 'llama.cpp' && EXPECTED_MODEL_RE.test(model)) {
      pass('DOCLING_HEALTH_ORNITH_LLAMA_OWNER', { provider, model, url });
    } else {
      fail('DOCLING_HEALTH_ORNITH_LLAMA_OWNER', { provider, model, url });
    }

    if (!/11434|ollama|gemma4/i.test(configText)) pass('DOCLING_HEALTH_NO_OLLAMA_GEMMA_CONFIG', config);
    else fail('DOCLING_HEALTH_NO_OLLAMA_GEMMA_CONFIG', config);
  } catch (error) {
    fail('DOCLING_VLM_HEALTH_TRUE', String(error?.message || error));
    fail('DOCLING_HEALTH_ORNITH_LLAMA_OWNER', String(error?.message || error));
    fail('DOCLING_HEALTH_NO_OLLAMA_GEMMA_CONFIG', String(error?.message || error));
  }

  let monitor = null;
  try {
    monitor = startOllamaPortMonitor();
    const initial = await monitor.settle();
    observed.ollamaPortMonitorInitial = initial;
    if (initial.exited && initial.exitCode !== 9) {
      fail('OLLAMA_11434_RUNTIME_NEGATIVE_PROOF', {
        reason: 'network monitor exited before Docling request',
        ...initial,
      });
    }
  } catch (error) {
    fail('OLLAMA_11434_RUNTIME_NEGATIVE_PROOF', String(error?.message || error));
  }

  try {
    const form = new FormData();
    form.append('file', new Blob([FIXTURE], { type: 'image/png' }), 'ornith-vlm-runtime-02.png');
    form.append('doc_type', 'general');

    const response = await fetchWithTimeout(`${DOCLING_BASE}/ocr/vlm`, {
      method: 'POST',
      body: form,
    });
    const raw = await response.text();

    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(`Docling VLM returned non-JSON status=${response.status}: ${raw.slice(0, 500)}`);
    }
    if (!response.ok) throw new Error(`Docling VLM HTTP ${response.status}: ${raw.slice(0, 500)}`);

    const text = String(payload?.text || '').trim();
    const evidence = fixtureEvidence(text);
    observed.doclingMultimodal = {
      httpStatus: response.status,
      model: payload?.model ?? null,
      docType: payload?.doc_type ?? null,
      tokens: payload?.tokens ?? null,
      text,
      evidence,
    };

    if (evidence.nonEmpty) pass('DOCLING_VLM_NONEMPTY', evidence);
    else fail('DOCLING_VLM_NONEMPTY', evidence);

    if (evidence.sawOrnith && evidence.saw42) pass('DOCLING_VLM_FIXTURE_GROUNDED', evidence);
    else fail('DOCLING_VLM_FIXTURE_GROUNDED', evidence);

    const doclingModel = String(payload?.model || '');
    if (EXPECTED_MODEL_RE.test(doclingModel) || doclingModel === liveAlias) {
      pass('DOCLING_VLM_MODEL_IS_ORNITH', doclingModel);
    } else {
      fail('DOCLING_VLM_MODEL_IS_ORNITH', doclingModel || null);
    }
  } catch (error) {
    fail('DOCLING_VLM_NONEMPTY', String(error?.message || error));
    fail('DOCLING_VLM_FIXTURE_GROUNDED', String(error?.message || error));
    fail('DOCLING_VLM_MODEL_IS_ORNITH', String(error?.message || error));
  } finally {
    if (monitor) {
      const monitorResult = await monitor.stop();
      observed.ollamaPortMonitor = monitorResult;
      if (monitorResult.monitorUsable && !monitorResult.observed11434) {
        const hitWasAlreadyRecorded =
          checks.OLLAMA_11434_RUNTIME_NEGATIVE_PROOF?.detail?.observed11434 === true;
        if (!hitWasAlreadyRecorded) {
          const blockerIndex = blockers.indexOf('OLLAMA_11434_RUNTIME_NEGATIVE_PROOF');
          if (blockerIndex >= 0) blockers.splice(blockerIndex, 1);
          pass('OLLAMA_11434_RUNTIME_NEGATIVE_PROOF', monitorResult);
        }
      } else if (monitorResult.observed11434) {
        fail('OLLAMA_11434_RUNTIME_NEGATIVE_PROOF', monitorResult);
      } else if (!checks.OLLAMA_11434_RUNTIME_NEGATIVE_PROOF) {
        fail('OLLAMA_11434_RUNTIME_NEGATIVE_PROOF', monitorResult);
      }
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  const required = [
    'STATIC_ACTIVE_DOCLING_NO_OLLAMA_GEMMA',
    'LLAMA_HEALTH_HTTP_200',
    'LLAMA_MODELS_ORNITH_15_IDENTITY',
    'PROPS_MODEL_ALIAS_ORNITH_15',
    'PROPS_VISION_TRUE',
    'LLAMA_BUILD_IDENTITY_CAPTURED',
    'MMPROJ_ARTIFACT_IDENTITY_CARRIED_FORWARD',
    'DIRECT_VLM_NONEMPTY',
    'DIRECT_VLM_FIXTURE_GROUNDED',
    'DIRECT_VLM_MODEL_IDENTITY_STABLE',
    'DOCLING_VLM_HEALTH_TRUE',
    'DOCLING_HEALTH_ORNITH_LLAMA_OWNER',
    'DOCLING_HEALTH_NO_OLLAMA_GEMMA_CONFIG',
    'DOCLING_VLM_NONEMPTY',
    'DOCLING_VLM_FIXTURE_GROUNDED',
    'DOCLING_VLM_MODEL_IS_ORNITH',
    'OLLAMA_11434_RUNTIME_NEGATIVE_PROOF',
  ];

  const allRequiredPass = required.every((name) => checks[name]?.pass === true);
  const result = {
    schema: 'ornith.vlm.runtime-proof.v2',
    gate: 'ORNITH-VLM-RUNTIME-02',
    status: allRequiredPass ? 'ORNITH_VLM_OWNER_PROVEN' : 'ORNITH_VLM_RUNTIME_BLOCKED',
    readOnlyRuntimeProbe: true,
    canonicalWrites: false,
    derivedReceiptWrite: !noReport,
    modelFamily: 'ornith-1.5',
    transport: 'openai-chat-completions',
    imageEncoding: 'data-uri-image-url',
    expectedProjectorSha256: EXPECTED_MMPROJ_SHA256,
    observed,
    requiredChecks: required,
    checks,
    blockers: uniqueBlockers,
    completedAt: now(),
  };

  if (!noReport) writeAtomicJson(REPORT_PATH, result);
  console.log(JSON.stringify(result, null, 2));
  if (!allRequiredPass) process.exitCode = 1;
}

main().catch((error) => {
  const fatal = {
    schema: 'ornith.vlm.runtime-proof.v2',
    gate: 'ORNITH-VLM-RUNTIME-02',
    status: 'ORNITH_VLM_RUNTIME_BLOCKED',
    readOnlyRuntimeProbe: true,
    canonicalWrites: false,
    fatalError: String(error?.stack || error),
    completedAt: now(),
  };
  if (!noReport) {
    try {
      writeAtomicJson(REPORT_PATH, fatal);
    } catch {
      // Never mask the original proof failure with a report-write failure.
    }
  }
  console.error(JSON.stringify(fatal, null, 2));
  process.exitCode = 1;
});

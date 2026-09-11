#!/usr/bin/env node

/**
 * PROVIDER-AWARE-SEMANTIC-HEALTH-01
 *
 * Read-only proof that semantic_768 health is evaluated against the configured
 * embedding provider rather than Ollama unconditionally.
 *
 * This intentionally does not start/stop models, mutate env files, write DBs,
 * or alter Qdrant/Valkey. It reports current runtime/provider reachability.
 */

const timeoutMs = Number.parseInt(process.env.SEMANTIC_HEALTH_TIMEOUT_MS ?? '2500', 10);

function clean(value) {
  return String(value ?? '').trim();
}

function bool(value) {
  return ['1', 'true', 'yes', 'on'].includes(clean(value).toLowerCase());
}

async function fetchJson(url, init = {}) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function inferProvider() {
  const explicit = clean(process.env.EMBEDDING_PROVIDER).toLowerCase();
  const backend = clean(process.env.EMBEDDING_BACKEND).toLowerCase();
  if (explicit === 'onnx_directml' || backend === 'onnx_directml') return 'onnx_directml';
  if (explicit === 'llama_cpp_gguf' || backend === 'llama_cpp_gguf') return 'llama_cpp_gguf';
  if (explicit === 'ollama') return 'ollama';

  const url = clean(process.env.EMBEDDING_BASE_URL)
    || clean(process.env.OLLAMA_EMBED_BASE_URL)
    || clean(process.env.EMBED_SERVER_URL);
  if (url) return 'llama_cpp_gguf';

  if (process.platform === 'win32' && bool(process.env.GPU_ENABLED) && explicit !== 'ollama') {
    return 'onnx_directml';
  }
  return 'ollama';
}

async function prove() {
  const provider = inferProvider();
  const checks = [];
  let healthy = false;

  if (provider === 'onnx_directml') {
    // In-process ONNX has no HTTP service of its own. The public SvelteKit
    // embedding route is the correct observable boundary if the dev server is up.
    const appBase = clean(process.env.SVELTEKIT_BASE_URL) || 'http://127.0.0.1:5173';
    const route = await fetchJson(`${appBase}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'provider aware semantic health probe' }),
    });
    const vector = Array.isArray(route?.body?.embedding) ? route.body.embedding : null;
    const providerName = clean(route?.body?.provider ?? route?.body?.backend ?? '');
    const shapeOk = vector?.length === 768 && vector.every(Number.isFinite);
    const directMlObserved = /directml|onnx/i.test(providerName) || route?.body?.representationId === 'semantic_768';
    checks.push({ id: 'SVELTEKIT_EMBED_ROUTE_REACHABLE', pass: route.ok, status: route.status });
    checks.push({ id: 'SEMANTIC_768_VECTOR_SHAPE', pass: Boolean(shapeOk), dimensions: vector?.length ?? null });
    checks.push({ id: 'DIRECTML_OR_SEMANTIC_IDENTITY_OBSERVED', pass: Boolean(directMlObserved), providerName: providerName || null });
    healthy = Boolean(route.ok && shapeOk && directMlObserved);
  } else if (provider === 'llama_cpp_gguf') {
    const base = (clean(process.env.EMBEDDING_BASE_URL)
      || clean(process.env.OLLAMA_EMBED_BASE_URL)
      || clean(process.env.EMBED_SERVER_URL)
      || 'http://127.0.0.1:8081').replace(/\/+$/, '');
    const health = await fetchJson(`${base}/health`);
    checks.push({ id: 'LLAMA_CPP_EMBED_HEALTH', pass: health.ok, status: health.status, base });
    healthy = health.ok;
  } else {
    const base = (clean(process.env.OLLAMA_BASE_URL) || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const tags = await fetchJson(`${base}/api/tags`);
    checks.push({ id: 'OLLAMA_TAGS_REACHABLE', pass: tags.ok, status: tags.status, base });
    healthy = tags.ok;
  }

  return {
    schema: 'parent-atlas.provider-aware-semantic-health.v1',
    status: healthy ? 'SEMANTIC_HEALTH_PROVEN' : 'SEMANTIC_HEALTH_BLOCKED',
    provider,
    representationId: 'semantic_768',
    dimensions: 768,
    checks,
    writesPerformed: false,
    observedAt: new Date().toISOString(),
  };
}

const result = await prove();
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'SEMANTIC_HEALTH_PROVEN' ? 0 : 1;

/**
 * LangExtract Sidecar Client — server-only.
 *
 * Proxies document extraction to miniforge-nlp-sidecar (Python FastAPI + spaCy + NER).
 * Container: miniforge-nlp-sidecar on port 8095
 *
 * Available endpoints (from OpenAPI):
 *   POST /extract      — text structure + entity extraction (JSON body)
 *   POST /extract/file — file upload extraction (multipart/form-data)
 *   GET  /health       — health check (spaCy, transformers_ner, gpu status)
 *
 * URL resolution (priority order):
 *   1. ENV.LANGEXTRACT_URL (explicit env var)
 *   2. Docker service discovery (container: miniforge-nlp-sidecar, port range 8090-8099)
 *   3. Fallback: ENV default / container service URL
 *
 * NOTE: The legacy MinIO SIMD Go service (bytedance/sonic AVX2) that used to occupy
 * this port is archived in deeds_labs/. The /api/evidence, /api/chunks, /api/manifest
 * endpoints no longer exist. Evidence fetching uses direct MinIO client via minio-js.
 */

import { ENV } from '$lib/server/env.server.js';
import { getServiceDiscovery } from '$lib/server/helpers/service-discovery.js';
import type { ServiceConfig } from '$lib/server/helpers/service-discovery.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface LangExtractRequest {
	content: string;
	document_type?: string;
	extract_entities?: boolean;
	extract_structure?: boolean;
	language?: string;
}

export interface LangExtractEntity {
	text: string;
	label: string;
	start: number;
	end: number;
	confidence?: number;
	[key: string]: unknown;
}

export interface LangExtractResponse {
	document_id: string;
	structure: Record<string, unknown>;
	entities: LangExtractEntity[];
	metadata: Record<string, unknown>;
	processing_time: number;
}

/**
 * NLP Sidecar Capabilities — matches live Miniforge service /health endpoint
 * Supports both native TS route + sidecar route
 */
export interface NlpSidecarCapabilities {
  spacy: boolean;
  langextract: boolean;
  tree_sitter: boolean;
  ast_grep: boolean;
  torch: boolean;
  gpu?: boolean;
}

export interface LangExtractHealthStatus {
  enabled: boolean;
  healthy: boolean;
  services: NlpSidecarCapabilities;
  version: string;
  latencyMs: number;
  source?: 'env' | 'discovery' | 'fallback' | 'native-ts';
  resolvedUrl?: string;
  runtime?: 'native-ts' | 'miniforge-nlp-sidecar';
}

/** @deprecated Use LangExtractHealthStatus */
export type SIMDHealthStatus = LangExtractHealthStatus;

// ── Service Discovery Config ──────────────────────────────────────────────

const LANGEXTRACT_SERVICE_CONFIG: ServiceConfig = {
  envVar: 'NLP_SIDECAR_URL',
  containerName: 'miniforge-nlp-sidecar',
  port: 8095,
  fallback: ENV.NLP_SIDECAR_URL || ENV.MINIFORGE_SIDECAR_URL || ENV.LANGEXTRACT_URL || 'http://127.0.0.1:8095',
  verify: true,
  verifyTimeout: 3000,
};

// ── URL Resolution ────────────────────────────────────────────────────────

let resolvedUrl: string | null = null;
let resolvedSource: 'env' | 'discovery' | 'fallback' | 'loopback' = 'fallback';
let lastResolution = 0;
const RESOLUTION_TTL = 5 * 60_000; // 5 min cache

async function getBaseUrl(): Promise<string> {
  const now = Date.now();
  if (resolvedUrl && now - lastResolution < RESOLUTION_TTL) {
    return resolvedUrl;
  }

  // Priority 1: Canonical NLP_SIDECAR_URL env var
  const explicit = ENV.NLP_SIDECAR_URL?.trim() || ENV.MINIFORGE_SIDECAR_URL?.trim() || ENV.LANGEXTRACT_URL?.trim();
  if (explicit) {
    resolvedUrl = explicit;
    resolvedSource = 'env';
    lastResolution = now;
    return resolvedUrl;
  }

  // Priority 2: Loopback health probe (127.0.0.1:8095)
  const loopbackUrl = 'http://127.0.0.1:8095';
  try {
    const healthRes = await fetch(`${loopbackUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (healthRes.ok) {
      resolvedUrl = loopbackUrl;
      resolvedSource = 'loopback';
      lastResolution = now;
      return resolvedUrl;
    }
  } catch {
    // Loopback not available, fall through to discovery
  }

  // Priority 3: Docker service discovery with port range scan
  try {
    const discovery = getServiceDiscovery();
    const result = await discovery.getServiceUrl('langextract', LANGEXTRACT_SERVICE_CONFIG);
    if (result.source === 'discovery' || result.source === 'env') {
      resolvedUrl = result.url;
      resolvedSource = result.source;
      lastResolution = now;
      return resolvedUrl;
    }
  } catch {
    // Discovery unavailable
  }

  // Priority 3: Default
  resolvedUrl = LANGEXTRACT_SERVICE_CONFIG.fallback;
  resolvedSource = 'fallback';
  lastResolution = now;
  return resolvedUrl;
}

// ── Health ─────────────────────────────────────────────────────────────────

let serviceHealthy: boolean | null = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30_000;

async function checkHealth(): Promise<boolean> {
  const now = Date.now();
  if (serviceHealthy !== null && now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return serviceHealthy;
  }

  try {
    const baseUrl = await getBaseUrl();
    const resp = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    serviceHealthy = resp.ok;
  } catch {
    serviceHealthy = false;
  }
  lastHealthCheck = now;
  return serviceHealthy;
}

/** Force re-resolution (e.g., after container restart) */
export function invalidateLangExtractResolution(): void {
  resolvedUrl = null;
  lastResolution = 0;
  serviceHealthy = null;
  lastHealthCheck = 0;
}

// ── Low-level fetch (shared by all callers) ──────────────────────────────

/**
 * Low-level fetch through the langextract adapter.
 *
 * Native-TS short-circuit (default): when LANGEXTRACT_NATIVE='true' (now the
 * default in env.server.ts), this returns a synthetic Response with the
 * pure-TS extractor output, bypassing the Python service entirely. All five
 * existing callers that POST to `/extract` auto-migrate transparently.
 *
 * Fall-through to the Python FastAPI service only when:
 *   - LANGEXTRACT_NATIVE='false' (explicit opt-out)
 *   - AND LANGEXTRACT_ENABLED=true
 *   - AND the service responds to /health
 */
export async function langextractFetch(path: string, init?: RequestInit): Promise<Response | null> {
  // Native-TS path — covers /extract POST and /health GET.
  // Routing witness: 'x-langextract-source' header proves which implementation was used.
  if (ENV.LANGEXTRACT_NATIVE === 'true') {
    if (path === '/extract' && init?.method === 'POST') {
      try {
        const body = init.body ? JSON.parse(String(init.body)) : {};
        const text = body.text ?? body.content ?? '';
        const docId = body.doc_id ?? body.document_id ?? `inline-${Date.now()}`;
        const docType = (body.document_type ?? 'case') as 'statute' | 'case';
        const { extractDocumentNative } = await import('$lib/server/langextract/native.js');
        const out = extractDocumentNative(text, docId, docType);
        return new Response(JSON.stringify(out), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-langextract-source': 'native-ts',
            'x-nlp-runtime': 'native-ts',
          },
        });
      } catch (err) {
        console.warn(
          '[langextract-native] short-circuit failed, falling through to Python:',
          (err as Error).message
        );
        // Continue to network fallback below
      }
    }

    if (path === '/health') {
      return new Response(
        JSON.stringify({
          enabled: true,
          healthy: true,
          services: { native: true },
          version: 'native-ts',
          latencyMs: 0,
          source: 'native-ts',
          runtime: 'native-ts',
          resolvedUrl: 'native-ts',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-langextract-source': 'native-ts',
            'x-nlp-runtime': 'native-ts',
          },
        }
      );
    }
  }

  // Python FastAPI fallback (now opt-in)
  if (!ENV.LANGEXTRACT_ENABLED) return null;
  const healthy = await checkHealth();
  if (!healthy) return null;
  const baseUrl = await getBaseUrl();

  // Fetch from Miniforge sidecar and inject routing witness header
  const response = await fetch(`${baseUrl}${path}`, init);

  // Clone response to add routing witness header (responses are immutable)
  const clonedResponse = response.clone();
  const headers = new Headers(clonedResponse.headers);
  headers.set('x-nlp-runtime', 'miniforge-nlp-sidecar');

  return new Response(clonedResponse.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ── Extraction API ────────────────────────────────────────────────────────

/**
 * Extract structure + entities from text content.
 * Returns null if service unavailable.
 */
export async function extractDocument(
  content: string,
  options?: {
    documentType?: string;
    extractEntities?: boolean;
    extractStructure?: boolean;
    language?: string;
  }
): Promise<LangExtractResponse | null> {
  if (ENV.LANGEXTRACT_NATIVE === 'true') {
    try {
      const { extractDocumentNative } = await import('$lib/server/langextract/native.js');
      const out = extractDocumentNative(
        content,
        `inline-${Date.now()}`,
        (options?.documentType as 'statute' | 'case') ?? 'case'
      );
      return {
        document_id: out.doc_id,
        structure: { sections: out.sections },
        entities: out.entities.map((e) => ({
          text: e.text,
          label: e.type.toUpperCase(),
          start: e.start,
          end: e.end,
          confidence: e.confidence,
          metadata: e.metadata,
        })),
        metadata: (out.metadata ?? {}) as unknown as Record<string, unknown>,
        processing_time: 0,
      };
    } catch (err) {
      console.warn(
        '[langextract-native] extractDocument native fallback failed:',
        (err as Error).message
      );
      // Fall through to the Python service if configured.
    }
  }

  if (!ENV.LANGEXTRACT_ENABLED) return null;

  const healthy = await checkHealth();
  if (!healthy) return null;

  try {
    const baseUrl = await getBaseUrl();
    const body: LangExtractRequest = {
      content,
      document_type: options?.documentType ?? 'legal',
      extract_entities: options?.extractEntities ?? true,
      extract_structure: options?.extractStructure ?? true,
      language: options?.language ?? 'en',
    };

    const resp = await fetch(`${baseUrl}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      console.warn(`[langextract] Extract failed: ${resp.status}`);
      return null;
    }

    return await resp.json();
  } catch (err) {
    console.warn('[langextract] Extract error:', (err as Error).message);
    serviceHealthy = false;
    return null;
  }
}

/**
 * Extract structure from uploaded file (multipart).
 * Returns null if service unavailable.
 */
export async function extractFile(
  file: File | Blob,
  options?: { documentType?: string; extractEntities?: boolean }
): Promise<LangExtractResponse | null> {
  if (!ENV.LANGEXTRACT_ENABLED) return null;

  const healthy = await checkHealth();
  if (!healthy) return null;

  try {
    const baseUrl = await getBaseUrl();
    const formData = new FormData();
    formData.append('file', file);

    const params = new URLSearchParams();
    if (options?.documentType) params.set('document_type', options.documentType);
    if (options?.extractEntities !== undefined)
      params.set('extract_entities', String(options.extractEntities));

    const url = `${baseUrl}/extract/file${params.toString() ? `?${params}` : ''}`;

    const resp = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(60_000), // files can be large
    });

    if (!resp.ok) {
      console.warn(`[langextract] File extract failed: ${resp.status}`);
      return null;
    }

    return await resp.json();
  } catch (err) {
    console.warn('[langextract] File extract error:', (err as Error).message);
    serviceHealthy = false;
    return null;
  }
}

// ── Legacy Aliases (backwards compat for infrastructure/status consumers) ──

/** @deprecated Use extractDocument() */
export async function getEvidenceViaSIMD(): Promise<null> {
  return null; // MinIO SIMD proxy no longer exists — use minio-js directly
}

/** @deprecated Use extractDocument() */
export async function getChunksViaSIMD(): Promise<null> {
  return null;
}

/** @deprecated Use extractDocument() */
export async function getManifestViaSIMD(): Promise<null> {
  return null;
}

/**
 * Health status for monitoring dashboard.
 * Returns routing witness (runtime field) indicating whether the request
 * used the native TS implementation or the Miniforge NLP sidecar.
 */
export async function getLangExtractStatus(): Promise<LangExtractHealthStatus> {
  const start = Date.now();
  const enabled = ENV.LANGEXTRACT_ENABLED;

  // Native-TS path takes precedence (if enabled, it wins)
  if (ENV.LANGEXTRACT_NATIVE === 'true') {
    return {
      enabled,
      healthy: true,
      services: { native: true },
      version: 'native-ts',
      latencyMs: Date.now() - start,
      source: 'native-ts',
      runtime: 'native-ts',
      resolvedUrl: 'native-ts',
    };
  }

  // Miniforge sidecar path
  if (!enabled) {
    return {
      enabled,
      healthy: false,
      services: {},
      version: '',
      latencyMs: Date.now() - start,
      source: resolvedSource,
      runtime: undefined,
      resolvedUrl: resolvedUrl ?? undefined,
    };
  }

  try {
    const baseUrl = await getBaseUrl();
    const resp = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      return {
        enabled,
        healthy: false,
        services: {},
        version: '',
        latencyMs,
        source: resolvedSource,
        runtime: 'miniforge-nlp-sidecar',
        resolvedUrl: resolvedUrl ?? undefined,
      };
    }

    const data = await resp.json();
    return {
      enabled,
      healthy: data.status === 'healthy' || data.status === 'degraded',
      services: data.services ?? {},
      version: data.version ?? '',
      latencyMs,
      source: resolvedSource,
      runtime: 'miniforge-nlp-sidecar',
      resolvedUrl: resolvedUrl ?? undefined,
    };
  } catch {
    return {
      enabled,
      healthy: false,
      services: {},
      version: '',
      latencyMs: Date.now() - start,
      source: resolvedSource,
      runtime: 'miniforge-nlp-sidecar',
      resolvedUrl: resolvedUrl ?? undefined,
    };
  }
}

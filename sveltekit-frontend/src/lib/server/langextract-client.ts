/**
 * LangExtract Sidecar Client — server-only.
 *
 * Proxies document extraction to phase66-langextract (Python FastAPI + spaCy + NER).
 * Container: phase66-langextract on port 8095
 *
 * Available endpoints (from OpenAPI):
 *   POST /extract      — text structure + entity extraction (JSON body)
 *   POST /extract/file — file upload extraction (multipart/form-data)
 *   GET  /health       — health check (spaCy, transformers_ner, gpu status)
 *
 * URL resolution (priority order):
 *   1. ENV.LANGEXTRACT_URL (explicit env var)
 *   2. Docker service discovery (container: phase66-langextract, port range 8090-8099)
 *   3. Fallback: http://127.0.0.1:8095
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

export interface LangExtractHealthStatus {
  enabled: boolean;
  healthy: boolean;
  services: { spacy?: boolean; transformers_ner?: boolean; gpu?: boolean };
  version: string;
  latencyMs: number;
  source?: 'env' | 'discovery' | 'fallback';
  resolvedUrl?: string;
}

/** @deprecated Use LangExtractHealthStatus */
export type SIMDHealthStatus = LangExtractHealthStatus;

// ── Service Discovery Config ──────────────────────────────────────────────

const LANGEXTRACT_SERVICE_CONFIG: ServiceConfig = {
  envVar: 'LANGEXTRACT_URL',
  fallback: 'http://127.0.0.1:8095',
  containerName: 'phase66-langextract',
  port: 8095,
  verify: true,
  verifyTimeout: 3000,
};

/** Port range for dynamic discovery (Docker compose overrides or QUIC/Caddy proxy) */
const PORT_RANGE = { min: 8090, max: 8099 };

// ── URL Resolution ────────────────────────────────────────────────────────

let resolvedUrl: string | null = null;
let resolvedSource: 'env' | 'discovery' | 'fallback' = 'fallback';
let lastResolution = 0;
const RESOLUTION_TTL = 5 * 60_000; // 5 min cache

async function getBaseUrl(): Promise<string> {
  const now = Date.now();
  if (resolvedUrl && now - lastResolution < RESOLUTION_TTL) {
    return resolvedUrl;
  }

  // Priority 1: Explicit env var
  const explicit = ENV.LANGEXTRACT_URL?.trim();
  if (explicit && explicit !== 'http://127.0.0.1:8095') {
    resolvedUrl = explicit;
    resolvedSource = 'env';
    lastResolution = now;
    return resolvedUrl;
  }

  // Priority 2: Docker service discovery with port range scan
  try {
    const discovery = getServiceDiscovery();
    const result = await discovery.getServiceUrl('langextract', LANGEXTRACT_SERVICE_CONFIG);
    if (result.source === 'discovery' || result.source === 'env') {
      resolvedUrl = result.url;
      resolvedSource = result.source;
      lastResolution = now;
      return resolvedUrl;
    }

    // Scan port range (Docker compose may assign dynamic ports via Caddy/QUIC proxy)
    for (let port = PORT_RANGE.min; port <= PORT_RANGE.max; port++) {
      if (port === 8095) continue; // Already tried via default
      try {
        const probe = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (probe.ok) {
          const data = await probe.json().catch(() => null);
          // Verify it's the LangExtract service (has spaCy/NER services)
          if (data?.services?.spacy !== undefined || data?.version) {
            resolvedUrl = `http://127.0.0.1:${port}`;
            resolvedSource = 'discovery';
            lastResolution = now;
            return resolvedUrl;
          }
        }
      } catch {
        // Port not listening
      }
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
  // Native-TS path — covers /extract POST. Other paths (e.g. /health) fall
  // through to legacy network fetch since the native module doesn't expose them.
  if (ENV.LANGEXTRACT_NATIVE === 'true' && path === '/extract' && init?.method === 'POST') {
    try {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      const text   = body.text ?? body.content ?? '';
      const docId  = body.doc_id ?? body.document_id ?? `inline-${Date.now()}`;
      const docType = (body.document_type ?? 'case') as 'statute' | 'case';
      const { extractDocumentNative } = await import('$lib/server/langextract/native.js');
      const out = extractDocumentNative(text, docId, docType);
      // Return an OK Response shaped like the Python /extract output so callers
      // that JSON.parse the body get the same fields they always did.
      return new Response(JSON.stringify(out), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-langextract-source': 'native-ts' },
      });
    } catch (err) {
      console.warn('[langextract-native] short-circuit failed, falling through to Python:', (err as Error).message);
      // Continue to network fallback below
    }
  }

  // Python FastAPI fallback (now opt-in)
  if (!ENV.LANGEXTRACT_ENABLED) return null;
  const healthy = await checkHealth();
  if (!healthy) return null;
  const baseUrl = await getBaseUrl();
  return fetch(`${baseUrl}${path}`, init);
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
 */
export async function getLangExtractStatus(): Promise<LangExtractHealthStatus> {
  const start = Date.now();
  const enabled = ENV.LANGEXTRACT_ENABLED;

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
      resolvedUrl: resolvedUrl ?? undefined,
    };
  }
}
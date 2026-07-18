import { ENV } from '$lib/server/env.server.js';

export interface LangExtractRequest {
  text: string;
  sourceRef?: string;
  packetKey?: string;
  extractionMode: 'entities' | 'relationships' | 'concepts' | 'full';
}

export interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
  span?: [number, number];
}

export interface ExtractedRelationship {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

export interface LangExtractResponse {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  concepts: string[];
  provenance: {
    model: string;
    durationMs: number;
    sourceRef?: string;
  };
}

export interface LangExtractClient {
  health(): Promise<{ ready: boolean; model?: string }>;
  extract(req: LangExtractRequest): Promise<LangExtractResponse>;
}

const HEALTH_CACHE_TTL = 30_000;

let _cachedHealthy: boolean | null = null;
let _healthCacheTs = 0;

function getBaseUrl(baseUrl?: string): string {
  // Explicit arg wins; then ENV; then hard default matching LANGEXTRACT_URL default port
  return baseUrl ?? (ENV.LANGEXTRACT_URL || 'http://127.0.0.1:8094');
}

export function createLangExtractClient(baseUrl?: string): LangExtractClient {
  const url = getBaseUrl(baseUrl);

  return {
    async health(): Promise<{ ready: boolean; model?: string }> {
      const now = Date.now();
      if (_cachedHealthy !== null && now - _healthCacheTs < HEALTH_CACHE_TTL) {
        return { ready: _cachedHealthy };
      }

      try {
        const res = await fetch(`${url}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) {
          _cachedHealthy = false;
          _healthCacheTs = now;
          return { ready: false };
        }
        const data = (await res.json()) as { status?: string; model?: string };
        _cachedHealthy = data.status === 'ok' || data.status === 'healthy';
        _healthCacheTs = now;
        return { ready: _cachedHealthy, model: data.model };
      } catch {
        _cachedHealthy = false;
        _healthCacheTs = now;
        return { ready: false };
      }
    },

    async extract(req: LangExtractRequest): Promise<LangExtractResponse> {
      const start = Date.now();
      const res = await fetch(`${url}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        // Extraction can be slow for large documents; 30s matches typical NLP latency
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        // Mark unhealthy so callers can skip subsequent calls in the same request lifecycle
        _cachedHealthy = false;
        _healthCacheTs = Date.now();
        throw new Error(`[langextract-client] extract failed: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as Omit<LangExtractResponse, 'provenance'> & {
        provenance?: Partial<LangExtractResponse['provenance']>;
      };

      return {
        entities: data.entities ?? [],
        relationships: data.relationships ?? [],
        concepts: data.concepts ?? [],
        provenance: {
          model: data.provenance?.model ?? 'unknown',
          durationMs: data.provenance?.durationMs ?? (Date.now() - start),
          sourceRef: req.sourceRef,
        },
      };
    },
  };
}

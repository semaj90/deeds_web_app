import {
  requestLangExtractAnalyze,
  requestLangExtractHealth,
  type LangExtractAnalyzeRequest,
  type LangExtractAnalyzeResponse,
  type LangExtractHealthResponse,
  type LangExtractSidecarRequestOptions,
} from './langextract-transport.js';

export interface LangExtractHealthStatus extends LangExtractHealthResponse {
  ready: boolean;
}

export interface LangExtractClient {
  health(): Promise<LangExtractHealthStatus>;
  analyze(req: LangExtractAnalyzeRequest, options?: LangExtractSidecarRequestOptions): Promise<LangExtractAnalyzeResponse>;
  extract(req: LangExtractAnalyzeRequest, options?: LangExtractSidecarRequestOptions): Promise<LangExtractAnalyzeResponse>;
}

const HEALTH_CACHE_TTL = 30_000;

function toHealthStatus(payload: LangExtractHealthResponse): LangExtractHealthStatus {
  const ready = payload.status === 'ok' || payload.status === 'healthy';
  return { ...payload, ready };
}

export function createLangExtractClient(baseUrl?: string): LangExtractClient {
  let cachedHealth: LangExtractHealthStatus | null = null;
  let cachedHealthTs = 0;

  return {
    async health(): Promise<LangExtractHealthStatus> {
      const now = Date.now();
      if (cachedHealth && now - cachedHealthTs < HEALTH_CACHE_TTL) {
        return cachedHealth;
      }

      try {
        const payload = await requestLangExtractHealth({ baseUrl, timeoutMs: 3_000 });
        cachedHealth = toHealthStatus(payload);
        cachedHealthTs = now;
        return cachedHealth;
      } catch {
        cachedHealth = { ready: false };
        cachedHealthTs = now;
        return cachedHealth;
      }
    },

    async analyze(
      req: LangExtractAnalyzeRequest,
      options: LangExtractSidecarRequestOptions = {}
    ): Promise<LangExtractAnalyzeResponse> {
      return requestLangExtractAnalyze(req, { baseUrl: options.baseUrl ?? baseUrl, timeoutMs: options.timeoutMs ?? 30_000 });
    },

    async extract(
      req: LangExtractAnalyzeRequest,
      options: LangExtractSidecarRequestOptions = {}
    ): Promise<LangExtractAnalyzeResponse> {
      return requestLangExtractAnalyze(req, { baseUrl: options.baseUrl ?? baseUrl, timeoutMs: options.timeoutMs ?? 30_000 });
    },
  };
}

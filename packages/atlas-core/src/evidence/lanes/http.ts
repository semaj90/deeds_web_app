import type { RuntimeRequestEvidence } from '../trace-dynamic-context.types.js';

export interface HttpProbeInput {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  traceId?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpProbeResult {
  request: HttpProbeInput;
  status: number;
  ok: boolean;
  responseText?: string;
}

export function httpProbeToRuntimeEvidence(result: HttpProbeResult): RuntimeRequestEvidence {
  return {
    method: result.request.method,
    url: result.request.url,
    status: result.status,
    traceId: result.request.traceId,
    notes: result.ok ? 'ok' : 'failed',
  };
}

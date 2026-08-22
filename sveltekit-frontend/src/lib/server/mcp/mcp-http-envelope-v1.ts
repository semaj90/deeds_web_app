export const MCP_PROTOCOL_2026_07_28 = '2026-07-28' as const;

export type McpHttpProtocolMode = 'LEGACY' | 'STATELESS_2026_07_28';

export interface McpCacheHintV1 {
  ttlMs: number;
  cacheScope: 'public' | 'private' | null;
}

export function resolveMcpHttpProtocolMode(protocolVersion?: string | null): McpHttpProtocolMode {
  return protocolVersion === MCP_PROTOCOL_2026_07_28 ? 'STATELESS_2026_07_28' : 'LEGACY';
}

export function buildMcpHttpHeaders(input: {
  mode: McpHttpProtocolMode;
  method: string;
  name?: string | null;
  acceptEventStream?: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: input.acceptEventStream === false ? 'application/json' : 'application/json, text/event-stream',
  };
  if (input.mode === 'STATELESS_2026_07_28') {
    headers['MCP-Protocol-Version'] = MCP_PROTOCOL_2026_07_28;
    headers['Mcp-Method'] = input.method;
    if (input.name?.trim()) headers['Mcp-Name'] = input.name.trim();
  }
  return headers;
}

export function buildMcpRequestParams(input: {
  mode: McpHttpProtocolMode;
  params?: Record<string, unknown>;
  clientName?: string;
  clientVersion?: string;
}): Record<string, unknown> {
  const params = { ...(input.params ?? {}) };
  if (input.mode !== 'STATELESS_2026_07_28') return params;
  return {
    ...params,
    _meta: {
      'io.modelcontextprotocol/clientInfo': {
        name: input.clientName ?? 'deeds-web-app',
        version: input.clientVersion ?? '1.0.0',
      },
    },
  };
}

export function parseMcpCacheHint(result: unknown): McpCacheHintV1 {
  if (!result || typeof result !== 'object') return { ttlMs: 0, cacheScope: null };
  const record = result as Record<string, unknown>;
  const rawTtl = record.ttlMs;
  const ttlMs = typeof rawTtl === 'number' && Number.isFinite(rawTtl) && rawTtl >= 0
    ? Math.floor(rawTtl)
    : 0;
  const rawScope = record.cacheScope;
  const cacheScope = rawScope === 'public' || rawScope === 'private' ? rawScope : null;
  return { ttlMs, cacheScope };
}

export function isMcpCacheFresh(input: {
  receivedAtMs: number;
  ttlMs: number;
  nowMs?: number;
}): boolean {
  if (!Number.isFinite(input.receivedAtMs) || !Number.isFinite(input.ttlMs) || input.ttlMs <= 0) return false;
  const nowMs = input.nowMs ?? Date.now();
  return nowMs < input.receivedAtMs + input.ttlMs;
}

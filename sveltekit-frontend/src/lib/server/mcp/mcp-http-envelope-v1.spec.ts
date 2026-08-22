import { describe, expect, it } from 'vitest';

import {
  MCP_PROTOCOL_2026_07_28,
  buildMcpHttpHeaders,
  buildMcpRequestParams,
  isMcpCacheFresh,
  parseMcpCacheHint,
  resolveMcpHttpProtocolMode,
} from './mcp-http-envelope-v1.js';

describe('MCP HTTP envelope v1', () => {
  it('keeps legacy requests free of modern routing headers unless explicitly opted in', () => {
    const mode = resolveMcpHttpProtocolMode(undefined);
    const headers = buildMcpHttpHeaders({ mode, method: 'tools/call', name: 'atlas.packet_search' });
    expect(mode).toBe('LEGACY');
    expect(headers['MCP-Protocol-Version']).toBeUndefined();
    expect(headers['Mcp-Method']).toBeUndefined();
    expect(headers['Mcp-Name']).toBeUndefined();
  });

  it('adds required modern routing headers to a tool call', () => {
    const mode = resolveMcpHttpProtocolMode(MCP_PROTOCOL_2026_07_28);
    const headers = buildMcpHttpHeaders({ mode, method: 'tools/call', name: 'atlas.packet_search' });
    expect(headers['MCP-Protocol-Version']).toBe('2026-07-28');
    expect(headers['Mcp-Method']).toBe('tools/call');
    expect(headers['Mcp-Name']).toBe('atlas.packet_search');
  });

  it('does not invent Mcp-Name for methods without a named primitive', () => {
    const mode = resolveMcpHttpProtocolMode(MCP_PROTOCOL_2026_07_28);
    const headers = buildMcpHttpHeaders({ mode, method: 'tools/list' });
    expect(headers['Mcp-Method']).toBe('tools/list');
    expect(headers['Mcp-Name']).toBeUndefined();
  });

  it('adds explicit client identity metadata only for stateless 2026 requests', () => {
    const modern = buildMcpRequestParams({
      mode: 'STATELESS_2026_07_28',
      params: { name: 'atlas.packet_search', arguments: { q: 'owner' } },
      clientName: 'parent-atlas',
      clientVersion: '1.0.0',
    });
    expect(modern._meta).toEqual({
      'io.modelcontextprotocol/clientInfo': { name: 'parent-atlas', version: '1.0.0' },
    });

    const legacy = buildMcpRequestParams({ mode: 'LEGACY', params: { cursor: null } });
    expect(legacy._meta).toBeUndefined();
  });

  it('treats absent/invalid TTL as stale instead of caching forever', () => {
    expect(parseMcpCacheHint({ tools: [] })).toEqual({ ttlMs: 0, cacheScope: null });
    expect(parseMcpCacheHint({ tools: [], ttlMs: -1, cacheScope: 'public' })).toEqual({ ttlMs: 0, cacheScope: 'public' });
    expect(isMcpCacheFresh({ receivedAtMs: 1000, ttlMs: 0, nowMs: 1001 })).toBe(false);
  });

  it('honors positive TTL freshness and cache scope', () => {
    const hint = parseMcpCacheHint({ tools: [], ttlMs: 5000, cacheScope: 'private' });
    expect(hint).toEqual({ ttlMs: 5000, cacheScope: 'private' });
    expect(isMcpCacheFresh({ receivedAtMs: 1000, ttlMs: hint.ttlMs, nowMs: 5999 })).toBe(true);
    expect(isMcpCacheFresh({ receivedAtMs: 1000, ttlMs: hint.ttlMs, nowMs: 6000 })).toBe(false);
  });
});

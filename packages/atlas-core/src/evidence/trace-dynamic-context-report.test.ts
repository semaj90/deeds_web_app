import { describe, expect, it } from 'vitest';
import { buildTraceDynamicContextReport, formatTraceDynamicContextReport, inferTraceQuestionFamily } from './trace-dynamic-context-report.js';
import type { TraceDynamicContextResult } from './trace-dynamic-context.types.js';

const baseResult: TraceDynamicContextResult = {
  traceId: 'trace-1',
  workspaceRevision: 'git:abc123',
  targetResolution: { kind: 'unknown' },
  confidence: 0.7,
  methods: ['lexical', 'runtime'],
  evidence: [
    { kind: 'route_match', lane: 'lexical', status: 'PROVEN', source: 'rg', path: 'src/routes/api/health/+server.ts', line: 12, message: 'GET /health' },
    { kind: 'symbol_match', lane: 'semantic', status: 'PARTIAL_PROVEN', source: 'qdrant', symbol: 'symbol:auth', message: 'join-back candidate' },
    { kind: 'packet_join', lane: 'semantic', status: 'PROVEN', source: 'postgres', message: 'packet:123' },
    { kind: 'http_probe', lane: 'runtime', status: 'PROVEN', source: 'playwright', message: '200 OK' },
  ],
  retrieval: {
    lexicalHits: [],
    semanticHits: [],
    graphHits: [],
    runtimeHits: [],
  },
  runtime: {
    httpRequests: [{ method: 'GET', url: 'http://127.0.0.1:5173/api/health', status: 200 }],
    consoleErrors: [],
    networkFailures: [],
  },
  validation: {
    status: 'PARTIAL_PROVEN',
    passedGates: ['route_match'],
    failedGates: [],
    unresolvedClaims: ['symbol_version'],
  },
  provenance: {
    generatedAt: '2026-08-02T00:00:00.000Z',
    toolVersions: { 'atlas-core': 'workspace' },
    queryDigest: 'query-digest',
    evidenceDigest: 'evidence-digest',
  },
};

describe('trace-dynamic-context report formatter', () => {
  it('classifies route, symbol, packet, and runtime questions', () => {
    expect(inferTraceQuestionFamily({ question: 'which route handles auth?', target: { route: '/api/auth/login' } })).toBe('route');
    expect(inferTraceQuestionFamily({ question: 'which symbol owns this function?', target: { symbolId: 'symbol-1' } })).toBe('symbol');
    expect(inferTraceQuestionFamily({ question: 'what packet joins back?', target: { packetKey: 'packet-1' } })).toBe('packet');
    expect(inferTraceQuestionFamily({ question: 'is the runtime health probe live?', target: undefined })).toBe('runtime');
  });

  it('renders a bounded report for symbol questions', () => {
    const report = buildTraceDynamicContextReport(baseResult, { family: 'symbol', maxItems: 2 });
    expect(report.title).toContain('Symbol');
    expect(report.sections[1]?.lines.length).toBeLessThanOrEqual(2);
    expect(formatTraceDynamicContextReport(baseResult, { family: 'route', maxItems: 2 })).toContain('Route evidence');
  });
});

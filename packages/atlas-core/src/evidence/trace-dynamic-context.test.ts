import { describe, expect, it, vi } from 'vitest';
import { createTraceDynamicContext, traceDynamicContext } from './trace-dynamic-context.js';
import type { TraceEvidenceLane } from './trace-dynamic-context.types.js';

describe('traceDynamicContext', () => {
  it('assembles bounded evidence from selected lanes', async () => {
    const collectLexical = vi.fn(async () => [
      { kind: 'lexical_match', lane: 'lexical', status: 'PROVEN' as const, source: 'rg', path: 'src/a.ts', line: 1, message: 'match' },
    ]);
    const collectRuntime = vi.fn(async () => [
      { kind: 'http_probe', lane: 'runtime', status: 'PROVEN' as const, source: 'playwright', message: '200 OK' },
    ]);

    const lanes: TraceEvidenceLane[] = [
      { lane: 'lexical', collect: collectLexical },
      { lane: 'runtime', collect: collectRuntime },
    ];

    const result = await traceDynamicContext(
      {
        workspaceId: 'workspace-1',
        question: 'find the auth route',
        workspaceRevision: 'git:abc123',
        lanes: ['lexical', 'runtime'],
        limits: {
          topK: 10,
          maxFiles: 10,
          maxSymbols: 10,
          maxTokens: 1000,
          graphDepth: 2,
          timeoutMs: 1000,
          runtimeMode: 'read_only',
        },
      },
      { lanes }
    );

    expect(collectLexical).toHaveBeenCalledOnce();
    expect(collectRuntime).toHaveBeenCalledOnce();
    expect(result.evidence).toHaveLength(2);
    expect(result.retrieval.lexicalHits).toHaveLength(1);
    expect(result.retrieval.runtimeHits).toHaveLength(1);
    expect(result.validation.status).toBe('PROVEN');
    expect(result.provenance.queryDigest).toHaveLength(64);
  });

  it('invokes the validation writer when provided', async () => {
    const record = vi.fn(async () => {});
    const ctx = createTraceDynamicContext({
      validationWriter: { record },
      lanes: [],
    });

    const result = await ctx.run({
      workspaceId: 'workspace-2',
      question: 'what is the packet key?',
      workspaceRevision: 'git:def456',
      lanes: ['lexical'],
      limits: {
        topK: 5,
        maxFiles: 5,
        maxSymbols: 5,
        maxTokens: 500,
        graphDepth: 1,
        timeoutMs: 1000,
        runtimeMode: 'read_only',
      },
    });

    expect(record).toHaveBeenCalledOnce();
    expect(result.validation.status).toBe('NOT_PROVEN');
    expect(result.evidence).toHaveLength(0);
  });

  it('runs the first slice static discovery and canonical join-back adapters', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          packet_key: 'packet-123',
          source_ref: 'src/routes/api/health/+server.ts',
          source_revision: 'git:abc123',
          feature_id: 'feature-1',
          canonical_source_ref: 'src/routes/api/health/+server.ts',
        },
      ],
    }));

    const result = await traceDynamicContext(
      {
        workspaceId: 'workspace-3',
        question: 'which route is this packet from?',
        target: {
          filePath: 'src/routes/api/health/+server.ts',
          packetKey: 'packet-123',
        },
        workspaceRevision: 'git:abc123',
        lanes: ['lexical', 'semantic'],
        limits: {
          topK: 5,
          maxFiles: 5,
          maxSymbols: 5,
          maxTokens: 500,
          graphDepth: 1,
          timeoutMs: 1000,
          runtimeMode: 'read_only',
        },
      },
      {
        firstSlice: {
          staticDiscovery: {
            filePath: 'src/routes/api/health/+server.ts',
            sourceText: 'export function GET() {\n  return new Response("ok");\n}\n',
            sourceRevision: 'git:abc123',
          },
          postgresJoinBack: {
            query,
            packetKeys: ['packet-123'],
            tableName: 'atlas_packets',
            limit: 5,
          },
        },
      }
    );

    expect(query).toHaveBeenCalledOnce();
    expect(result.sourceId).toBe('src/routes/api/health/+server.ts');
    expect(result.packetKey).toBe('packet-123');
    expect(result.evidence.some((item) => item.kind === 'lexical_match')).toBe(true);
    expect(result.evidence.some((item) => item.kind === 'postgres_join_back')).toBe(true);
    expect(result.retrieval.lexicalHits.length).toBeGreaterThan(0);
    expect(result.retrieval.semanticHits.length).toBeGreaterThan(0);
  });

  it('emits a workflow trace through the validation path bridge', async () => {
    const workflowTraceWriter = vi.fn(async () => {});

    const result = await traceDynamicContext(
      {
        workspaceId: 'workspace-4',
        question: 'which packet is canonical?',
        workspaceRevision: 'git:xyz789',
        lanes: ['lexical'],
        limits: {
          topK: 2,
          maxFiles: 2,
          maxSymbols: 2,
          maxTokens: 200,
          graphDepth: 1,
          timeoutMs: 1000,
          runtimeMode: 'read_only',
        },
      },
      {
        workflowTraceWriter,
      }
    );

    expect(workflowTraceWriter).toHaveBeenCalledOnce();
    const workflowTrace = workflowTraceWriter.mock.calls[0]?.[0];
    expect(workflowTrace.trace_id).toBe(result.traceId);
    expect(workflowTrace.route).toContain('trace_dynamic_context');
  });
});

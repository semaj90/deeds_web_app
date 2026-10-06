import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { buildGraphifyStructuralProjectionPipelineV1 } from './graphify-structural-projection-pipeline-v1.js';
import type { StructuralMaterializationResult } from './graphify-structural-materializer.js';

const source = 'export function PATCH() { return authorizeCase(); }';
const sourceRef = 'src/routes/api/cases/[id]/+server.ts';
const sourceRevision = `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}`;
const workspaceRevision = `sha256:${createHash('sha256').update('workspace snapshot', 'utf8').digest('hex')}`;
const revisions = {
  chunker: 'chunker-test',
  astGrep: 'ast-grep-test',
  langExtract: 'langextract-test',
  adapter: 'adapter-test',
  fabric: 'fabric-test',
};

function materialization(): StructuralMaterializationResult {
  return {
    sourceRef,
    sourceRevision,
    sourceVersionAnchor: 'source-anchor-r1',
    sourceRevisionAuthority: 'PROVEN',
    parserSourceRevisionToken: sourceRevision,
    provider: 'treesitter-chunker-8095',
    status: 'PROVEN',
    evidence: {
      schema: 'atlas.ast.evidence.v1',
      engine: 'treesitter-chunker',
      engine_version: 'test',
      language: 'typescript',
      file_path: sourceRef,
      source_revision: sourceRevision,
      chunks: [{
        upstream_node_id: 'node-patch',
        upstream_file_id: 'file-route',
        upstream_symbol_id: 'symbol-patch',
        upstream_chunk_id: 'chunk-patch',
        node_type: 'function_declaration',
        kind: 'function',
        name: 'PATCH',
        parent_route: ['export_statement', 'function_declaration'],
        parent_context: 'module',
        start_byte: 0,
        end_byte: Buffer.byteLength(source, 'utf8'),
        start_line: 1,
        start_column: 0,
        end_line: 1,
        end_column: source.length,
        calls: ['authorizeCase'],
        imports: [],
        exports: ['PATCH'],
      }],
      edges: [],
      diagnostics: [],
      syntax_status: 'CLEAN',
    },
    normalized: null,
    provenanceReadiness: {
      status: 'NATIVE_READY',
      nativeNodeIds: 1,
      nativeFileIds: 1,
      nativeSymbolIds: 1,
      upstreamChunkIds: 1,
      symbolCount: 1,
      sourceRevisionAuthority: 'PROVEN',
      sourceRevisionAuthorityReady: true,
      canonicalPromotionAllowed: false,
      reason: 'fixture has native parser identifiers and exact source revision',
    },
    diagnostics: [],
    persistence: 'NOT_ATTEMPTED',
    fallback: 'NONE',
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    source,
    sourceRef,
    sourceRevision,
    workspaceRevision,
    sourceBinding: {
      fileId: '22345678-1234-4234-8234-123456789012',
      workspaceId: '12345678-1234-4234-8234-123456789012',
      workspaceRevision,
      sourceRef,
      sourceRevision,
      contentDigest: createHash('sha256').update(source, 'utf8').digest('hex'),
      byteLength: Buffer.byteLength(source, 'utf8'),
      readbackVerified: true as const,
    },
    materialization: materialization(),
    revisions,
    ...overrides,
  };
}

describe('Graphify structural projection pipeline v1', () => {
  it('composes exact source-bound materialization, compilation and candidate mapping without writes', () => {
    const result = buildGraphifyStructuralProjectionPipelineV1(input());

    expect(result.status).toBe('MAPPED');
    expect(result.batch?.symbols).toHaveLength(1);
    expect(result.batch?.edges).toHaveLength(0);
    expect(result.batch?.writesAllowed).toBe(false);
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks a source binding whose content digest does not match the supplied bytes', () => {
    const result = buildGraphifyStructuralProjectionPipelineV1(input({
      sourceBinding: {
        ...input().sourceBinding,
        contentDigest: '0'.repeat(64),
      },
    }));

    expect(result.status).toBe('BLOCKED_SOURCE_BINDING');
    expect(result.batch).toBeNull();
    expect(result.diagnostics).toContain('SOURCE_BINDING_MISMATCH');
    expect(result.writesPerformed).toBe(false);
  });

  it('produces a deterministic checksum for the same frozen inputs', () => {
    const first = buildGraphifyStructuralProjectionPipelineV1(input());
    const second = buildGraphifyStructuralProjectionPipelineV1(input());

    expect(second.checksum).toBe(first.checksum);
  });
});

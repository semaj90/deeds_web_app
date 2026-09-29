import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildGraphifyStructuralStageReceiptsV1,
  compileGraphifyStructuralIntelligence,
} from './graphify-structural-intelligence-adapter.js';
import type { StructuralMaterializationResult } from './graphify-structural-materializer.js';

const source = 'export function PATCH() { return authorizeCase(); }';

function materialization(status: 'PROVEN' | 'RECOVERED_WITH_ERRORS'): StructuralMaterializationResult {
  const nativeReady = status === 'PROVEN';
  return {
    sourceRef: 'src/routes/api/cases/[id]/+server.ts',
    sourceRevision: 'src-r1',
    sourceRevisionAuthority: nativeReady ? 'PROVEN' : 'UNPROVEN',
    provider: 'treesitter-chunker-8095',
    status,
    evidence: {
      schema: 'atlas.ast.evidence.v1',
      engine: 'treesitter-chunker',
      engine_version: 'test',
      language: 'typescript',
      file_path: 'src/routes/api/cases/[id]/+server.ts',
      source_revision: 'src-r1',
      chunks: [{
        upstream_node_id: 'node-patch',
        upstream_file_id: 'file-route',
        upstream_symbol_id: 'symbol-patch',
        upstream_chunk_id: 'chunk-patch',
        node_type: 'function_declaration',
        kind: 'function',
        name: 'PATCH',
        parent_route: ['module'],
        parent_context: 'module',
        start_byte: 0,
        end_byte: source.length,
        start_line: 1,
        start_column: 0,
        end_line: 1,
        end_column: source.length,
        calls: ['authorizeCase'],
        imports: [],
        exports: ['PATCH'],
      }],
      edges: [],
      diagnostics: status === 'PROVEN' ? [] : ['Tree-sitter ERROR at line 1'],
      syntax_status: status === 'PROVEN' ? 'CLEAN' : 'RECOVERED_WITH_ERRORS',
    },
    normalized: null,
    provenanceReadiness: {
      status: nativeReady ? 'NATIVE_READY' : 'NATIVE_RECOVERED',
      nativeNodeIds: 1,
      nativeFileIds: 1,
      nativeSymbolIds: 1,
      upstreamChunkIds: 1,
      symbolCount: 1,
      canonicalPromotionAllowed: nativeReady,
      reason: nativeReady ? 'native proven fixture' : 'recovered fixture',
    },
    diagnostics: status === 'PROVEN' ? [] : ['STRUCTURAL_PROVENANCE_RECOVERED_NOT_PROMOTABLE'],
    persistence: 'NOT_ATTEMPTED',
    fallback: 'NONE',
  };
}

const revisions = {
  chunker: 'chunker-test',
  astGrep: 'ast-grep-test',
  langExtract: 'langextract-test',
  adapter: 'adapter-test',
  fabric: 'fabric-test',
};

describe('Graphify structural intelligence adapter', () => {
  it('fails closed when structural evidence is absent', () => {
    const noEvidence = { ...materialization('PROVEN'), evidence: null, normalized: null };
    const result = compileGraphifyStructuralIntelligence({
      source,
      workspaceRevision: 'ws-742',
      materialization: noEvidence,
      revisions,
    });

    expect(result.receipt.status).toBe('SKIPPED_NO_EVIDENCE');
    expect(result.receipt.langExtractParserBufferPresent).toBe(false);
    expect(result.receipt.langExtractParserBufferMatchesSource).toBe(false);
    expect(result.receipt.canonicalPromotionMayBeAttempted).toBe(false);
  });

  it('compiles native evidence + ast-grep + grounded LangExtract without creating canonical identity', () => {
    const result = compileGraphifyStructuralIntelligence({
      parserBuffer: Buffer.from(source, 'utf8'),
      source,
      workspaceRevision: 'ws-742',
      materialization: materialization('PROVEN'),
      astGrepFeatures: [{
        type: 'ast_function',
        name: 'PATCH',
        description: 'function',
        source: 'ast-grep',
        rawText: source,
        lineNumber: 1,
        byteStart: 0,
        byteEnd: source.length,
        ruleId: 'function_declaration',
        captures: { name: 'PATCH' },
        confidence: 1,
      }],
      langExtractMetadata: {
        grounded_extractions: [{
          class: 'authorization_behavior',
          text: 'authorizeCase',
          char_interval: { start_pos: source.indexOf('authorizeCase'), end_pos: source.indexOf('authorizeCase') + 'authorizeCase'.length },
          alignment_status: 'match_exact',
          attributes: { role: 'authorization' },
        }],
      },
      revisions,
      groundedDomainMapping: {
        extractionClassToDomain: new Map([['authorization_behavior', 'software.security']]),
        taxonomyRevision: 'atlas-taxonomy-test',
        evidenceRefPrefix: 'evidence:test',
      },
    });

    expect(result.receipt.status).toBe('COMPILED_NATIVE');
    expect(result.receipt.canonicalPromotionMayBeAttempted).toBe(true);
    expect(result.receipt.compatibilityNodeIdCount).toBe(0);
    expect(result.receipt.compatibilityFileIdCount).toBe(0);
    expect(result.receipt.compatibilityChunkIdCount).toBe(0);
    expect(result.receipt.astGrepObservationCount).toBe(1);
    expect(result.receipt.langExtractObservationCount).toBe(1);
    expect(result.receipt.langExtractParserBufferPresent).toBe(true);
    expect(result.receipt.langExtractParserBufferChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.receipt.langExtractFallbackUsed).toBe(false);
    expect(result.receipt.langExtractUtf8SpanCount).toBe(1);
    expect(result.receipt.langExtractUtf8RejectionCount).toBe(0);
    expect(result.receipt.langExtractUtf8MismatchCount).toBe(0);
    expect(result.receipt.groundedDomainCandidateCount).toBe(1);
    expect(result.groundedDomainCandidates[0]?.domainId).toBe('software.security');
    expect(result.groundedDomainCandidates[0]?.canonicalAuthority).toBe(false);
    expect(result.receipt.canonicalIdentityCreated).toBe(false);
    expect(result.fabric?.symbol_nominations[0]?.upstream_symbol_id).toBe('symbol-patch');
    expect(result.fabric?.ast_grep_observations[0]?.upstream_node_id).toBe('node-patch');
  });

  it('compiles recovered evidence for search but blocks canonical promotion', () => {
    const result = compileGraphifyStructuralIntelligence({
      source,
      workspaceRevision: 'ws-742',
      materialization: materialization('RECOVERED_WITH_ERRORS'),
      revisions,
    });

    expect(result.receipt.status).toBe('COMPILED_NONPROMOTABLE');
    expect(result.groundedDomainCandidates).toEqual([]);
    expect(result.receipt.canonicalPromotionMayBeAttempted).toBe(false);
    expect(result.receipt.provenanceStatus).toBe('NATIVE_RECOVERED');
    expect(result.fabric).not.toBeNull();
  });

  it('marks source-text reconstruction as non-promotable fallback', () => {
    const result = compileGraphifyStructuralIntelligence({
      source,
      workspaceRevision: 'ws-742',
      materialization: materialization('PROVEN'),
      revisions,
    });

    expect(result.receipt.langExtractParserBufferPresent).toBe(false);
    expect(result.receipt.langExtractFallbackUsed).toBe(true);
    expect(result.receipt.langExtractFallbackReason).toBe('PARSER_BUFFER_DERIVED_FROM_SOURCE_TEXT');
    expect(result.receipt.canonicalPromotionMayBeAttempted).toBe(false);
  });

  it('admits Python code-point spans only when exact UTF-8 parser bytes match', () => {
    const unicodeSource = `🙂 ${source}`;
    const codePoints = Array.from(unicodeSource);
    const extractionText = 'authorizeCase';
    const start = Array.from(unicodeSource.slice(0, unicodeSource.indexOf(extractionText))).length;
    const unicodeMaterialization = materialization('PROVEN');
    unicodeMaterialization.evidence.chunks[0]!.end_byte = Buffer.byteLength(unicodeSource, 'utf8');
    unicodeMaterialization.evidence.chunks[0]!.end_column = Buffer.byteLength(unicodeSource, 'utf8');
    const result = compileGraphifyStructuralIntelligence({
      parserBuffer: Buffer.from(unicodeSource, 'utf8'),
      source: unicodeSource,
      workspaceRevision: 'ws-742',
      materialization: unicodeMaterialization,
      langExtractMetadata: {
        grounded_extractions: [{
          class: 'authorization_behavior',
          text: extractionText,
          char_interval: { start_pos: start, end_pos: start + Array.from(extractionText).length },
          alignment_status: 'match_exact',
          attributes: { role: 'authorization' },
        }],
      },
      revisions,
    });

    const observation = result.fabric?.langextract_observations[0];
    const utf8Start = Buffer.byteLength(codePoints.slice(0, start).join(''), 'utf8');
    const utf8End = utf8Start + Buffer.byteLength(extractionText, 'utf8');
    expect(result.receipt.langExtractParserBufferMatchesSource).toBe(true);
    expect(result.receipt.langExtractUtf8SpanCount).toBe(1);
    expect(result.receipt.langExtractObservationCount).toBe(1);
    expect(observation?.attributes).toMatchObject({
      grounded_text_hash: createHash('sha256').update(extractionText, 'utf8').digest('hex'),
      atlas_source_text_encoding_revision: 'UTF8_PARSER_BUFFER_V1',
      atlas_utf8_start_byte: String(utf8Start),
      atlas_utf8_end_byte: String(utf8End),
    });
  });

  it('rejects mismatching extraction text and parser-buffer/source divergence from structural evidence', () => {
    const raw = {
      class: 'authorization_behavior',
      text: 'not-the-source-span',
      char_interval: { start_pos: 0, end_pos: 4 },
      alignment_status: 'match_exact',
      attributes: {},
    };
    const mismatchedSpan = compileGraphifyStructuralIntelligence({
      parserBuffer: Buffer.from(source, 'utf8'),
      source,
      workspaceRevision: 'ws-742',
      materialization: materialization('PROVEN'),
      langExtractMetadata: { grounded_extractions: [raw] },
      revisions,
    });
    expect(mismatchedSpan.receipt.langExtractUtf8MismatchCount).toBe(1);
    expect(mismatchedSpan.receipt.langExtractObservationCount).toBe(0);
    expect(mismatchedSpan.fabric?.langextract_observations).toEqual([]);

    const parserDivergence = compileGraphifyStructuralIntelligence({
      parserBuffer: Buffer.from(`different ${source}`, 'utf8'),
      source,
      workspaceRevision: 'ws-742',
      materialization: materialization('PROVEN'),
      langExtractMetadata: { grounded_extractions: [{ ...raw, text: 'd', char_interval: { start_pos: 0, end_pos: 1 } }] },
      revisions,
    });
    expect(parserDivergence.receipt.langExtractParserBufferMatchesSource).toBe(false);
    expect(parserDivergence.receipt.canonicalPromotionMayBeAttempted).toBe(false);
    expect(parserDivergence.receipt.diagnostics).toContain('LANGEXTRACT_PARSER_BUFFER_SOURCE_TEXT_MISMATCH');
    expect(parserDivergence.fabric?.langextract_observations).toEqual([]);
  });

  it('builds chained AST and structural stage receipts without persistence', () => {
    const result = compileGraphifyStructuralIntelligence({
      parserBuffer: Buffer.from(source, 'utf8'),
      source,
      workspaceRevision: 'ws-742',
      materialization: materialization('PROVEN'),
      revisions,
    });

    const stages = buildGraphifyStructuralStageReceiptsV1({ result });
    expect(stages.astParse.inputChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(stages.astParse.outputChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(stages.structuralExtract.inputChecksum).toBe(stages.astParse.outputChecksum);
    expect(stages.structuralExtract.outputChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

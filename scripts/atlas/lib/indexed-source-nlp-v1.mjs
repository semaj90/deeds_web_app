import crypto from 'node:crypto';
import path from 'node:path';

const LSP_LANGUAGE_IDS = new Map([
  ['.ts', 'typescript'], ['.tsx', 'typescriptreact'], ['.js', 'javascript'], ['.jsx', 'javascriptreact'],
  ['.mts', 'typescript'], ['.cts', 'typescript'], ['.mjs', 'javascript'], ['.cjs', 'javascript'],
]);
const SHA256 = /^sha256:[0-9a-f]{64}$/;

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function verifyUtf8Span(text, span, startKey, endKey, valueKey) {
  const bytes = Buffer.from(text, 'utf8');
  const start = span?.[startKey];
  const end = span?.[endKey];
  const value = span?.[valueKey];
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > bytes.length ||
      typeof value !== 'string' || bytes.subarray(start, end).toString('utf8') !== value) {
    throw new Error('NLP_SIDECAR_UTF8_SPAN_MISMATCH');
  }
}

async function analyzeSveltePosV1({ sourceText, sourceRef, sourceRevision, workspaceRevision, sidecarUrl }) {
  if (!SHA256.test(sourceRevision ?? '') || !SHA256.test(workspaceRevision ?? '') ||
      sha256(Buffer.from(sourceText, 'utf8')) !== sourceRevision) throw new Error('NLP_SVELTE_SOURCE_BINDING_INVALID');
  const response = await fetch(`${sidecarUrl}/pos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: sourceText }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`NLP_SIDECAR_POS_HTTP_${response.status}`);
  const result = await response.json();
  if (result.coordinate_basis !== 'UTF8_BYTES' || !Array.isArray(result.token_assertions) ||
      !Array.isArray(result.noun_phrase_spans) || !Array.isArray(result.dependency_edges)) {
    throw new Error('NLP_SIDECAR_POS_CONTRACT_INVALID');
  }
  for (const span of result.token_assertions) verifyUtf8Span(sourceText, span, 'start_byte', 'end_byte', 'text');
  for (const span of result.noun_phrase_spans) verifyUtf8Span(sourceText, span, 'start_byte', 'end_byte', 'text');
  for (const edge of result.dependency_edges) {
    verifyUtf8Span(sourceText, edge, 'dependent_start_byte', 'dependent_end_byte', 'dependent_text');
    verifyUtf8Span(sourceText, edge, 'head_start_byte', 'head_end_byte', 'head_text');
  }
  return {
    status: 'ADVISORY_POS_ONLY_PROPOSAL',
    providerMode: 'POS_ONLY',
    sourceRef,
    sourceRevision,
    workspaceRevision,
    coordinateBasis: result.coordinate_basis,
    tokenAssertions: result.token_assertions,
    nounPhraseSpans: result.noun_phrase_spans,
    dependencyEdges: result.dependency_edges,
    dependencyParserAvailable: result.dependency_parser_available === true,
    passCount: 1,
    exactRevisionPassCount: 1,
    verifiedUtf8SpanCount: result.token_assertions.length + result.noun_phrase_spans.length + result.dependency_edges.length * 2,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export async function runIndexedSourceNlpV1({ sourceText, sourceRef, sourceRevision, workspaceRevision, sidecarUrl }) {
  if (Buffer.byteLength(sourceText) > 50_000) return { status: 'SKIPPED_SOURCE_OVER_50000_BYTES' };
  if (path.extname(sourceRef).toLowerCase() === '.svelte') {
    return analyzeSveltePosV1({ sourceText, sourceRef, sourceRevision, workspaceRevision, sidecarUrl });
  }
  const response = await fetch(`${sidecarUrl}/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: sourceText,
      source_type: 'codebase',
      extraction_mode: 'full',
      sourceRef,
      sourceRevision,
      workspaceRevision,
      language: LSP_LANGUAGE_IDS.get(path.extname(sourceRef).toLowerCase()) ?? 'unknown',
      max_chars: 50_000,
      passes: ['structural', 'linguistic', 'classify'],
      grounded_extraction_required: true,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`NLP_SIDECAR_HTTP_${response.status}`);
  const result = await response.json();
  const passResults = Array.isArray(result.pass_results) ? result.pass_results : [];
  const exactRevisionPasses = passResults.filter((pass) => pass.source_ref === sourceRef && pass.source_revision === sourceRevision).length;
  return {
    status: 'ADVISORY_PROPOSAL',
    passCount: passResults.length,
    exactRevisionPassCount: exactRevisionPasses,
    classificationProposalPresent: Boolean(result.classification_proposal),
    classificationProposalRevisionBound: exactRevisionPasses > 0,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

import path from 'node:path';

const LSP_LANGUAGE_IDS = new Map([
  ['.ts', 'typescript'], ['.tsx', 'typescriptreact'], ['.js', 'javascript'], ['.jsx', 'javascriptreact'],
  ['.mts', 'typescript'], ['.cts', 'typescript'], ['.mjs', 'javascript'], ['.cjs', 'javascript'],
]);

export async function runIndexedSourceNlpV1({ sourceText, sourceRef, sourceRevision, workspaceRevision, sidecarUrl }) {
  if (Buffer.byteLength(sourceText) > 50_000) return { status: 'SKIPPED_SOURCE_OVER_50000_BYTES' };
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

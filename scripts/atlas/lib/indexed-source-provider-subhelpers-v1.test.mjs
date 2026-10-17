import assert from 'node:assert/strict';
import test from 'node:test';
import { runIndexedSourceAstGrepV1 } from './indexed-source-ast-grep-v1.mjs';
import { runIndexedSourceLspV1 } from './indexed-source-lsp-v1.mjs';
import { runIndexedSourceNlpV1 } from './indexed-source-nlp-v1.mjs';

test('AST-grep refuses working-tree bytes that do not match the indexed revision', () => {
  const result = runIndexedSourceAstGrepV1({
    repoRoot: process.cwd(),
    sourceRef: 'scripts/api-cleanup/recovery.ts',
    expectedRevision: 'sha256:' + '0'.repeat(64),
    sidecarUrl: 'http://127.0.0.1:8095',
  });

  assert.equal(result.status, 'SKIPPED_WORKING_TREE_REVISION_MISMATCH');
});

test('LSP subhelper skips unknown languages without starting a server', async () => {
  const result = await runIndexedSourceLspV1({
    repoRoot: process.cwd(),
    sourceRef: 'source.unknown',
    absolutePath: 'C:/not-read/source.unknown',
    sourceText: 'diagnostic only',
  });

  assert.deepEqual(result, { status: 'SKIPPED_UNSUPPORTED_LANGUAGE', symbolCount: 0 });
});

test('NLP subhelper returns revision-bound proposals as non-authoritative', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        pass_results: [{ source_ref: 'src/file.ts', source_revision: `sha256:${'a'.repeat(64)}` }],
        classification_proposal: { domain: 'test' },
      }),
    };
  };

  try {
    const result = await runIndexedSourceNlpV1({
      sourceText: 'const value = 1;',
      sourceRef: 'src/file.ts',
      sourceRevision: `sha256:${'a'.repeat(64)}`,
      workspaceRevision: `sha256:${'b'.repeat(64)}`,
      sidecarUrl: 'http://127.0.0.1:8095',
    });

    assert.equal(request.url, 'http://127.0.0.1:8095/analyze');
    assert.equal(request.body.grounded_extraction_required, true);
    assert.equal(result.exactRevisionPassCount, 1);
    assert.equal(result.classificationProposalRevisionBound, true);
    assert.equal(result.canonicalAuthority, false);
    assert.equal(result.writesPerformed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('NLP subhelper bounds input before making a network request', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('FETCH_MUST_NOT_RUN');
  };

  try {
    const result = await runIndexedSourceNlpV1({
      sourceText: 'x'.repeat(50_001),
      sourceRef: 'src/file.ts',
      sourceRevision: `sha256:${'a'.repeat(64)}`,
      workspaceRevision: `sha256:${'b'.repeat(64)}`,
      sidecarUrl: 'http://127.0.0.1:8095',
    });
    assert.deepEqual(result, { status: 'SKIPPED_SOURCE_OVER_50000_BYTES' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

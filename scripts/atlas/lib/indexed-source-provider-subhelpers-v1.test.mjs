import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

  assert.equal(result.status, 'SKIPPED_BOUND_SOURCE_REVISION_MISMATCH');
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

test('Svelte NLP subhelper uses POS-only UTF-8 byte evidence and binds it to the exact source revision', async () => {
  const originalFetch = globalThis.fetch;
  const sourceText = '<script lang="ts">\nconst heading = "🧭";\n</script>';
  const sourceBytes = Buffer.from(sourceText, 'utf8');
  const startByte = sourceBytes.indexOf(Buffer.from('🧭', 'utf8'));
  const sourceRevision = `sha256:${crypto.createHash('sha256').update(sourceBytes).digest('hex')}`;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        coordinate_basis: 'UTF8_BYTES',
        token_assertions: [{ text: '🧭', start_byte: startByte, end_byte: startByte + 4 }],
        noun_phrase_spans: [],
        dependency_edges: [],
        dependency_parser_available: true,
      }),
    };
  };

  try {
    const result = await runIndexedSourceNlpV1({
      sourceText,
      sourceRef: 'src/component.svelte',
      sourceRevision,
      workspaceRevision: `sha256:${'b'.repeat(64)}`,
      sidecarUrl: 'http://127.0.0.1:8095',
    });

    assert.equal(request.url, 'http://127.0.0.1:8095/pos');
    assert.deepEqual(request.body, { text: sourceText });
    assert.equal(result.status, 'ADVISORY_POS_ONLY_PROPOSAL');
    assert.equal(result.providerMode, 'POS_ONLY');
    assert.equal(result.sourceRevision, sourceRevision);
    assert.equal(result.coordinateBasis, 'UTF8_BYTES');
    assert.equal(result.verifiedUtf8SpanCount, 1);
    assert.equal(result.canonicalAuthority, false);
    assert.equal(result.writesPerformed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Svelte NLP subhelper rejects POS spans that do not match source bytes', async () => {
  const originalFetch = globalThis.fetch;
  const sourceText = '<script lang="ts">const value = "🧭";</script>';
  const sourceRevision = `sha256:${crypto.createHash('sha256').update(Buffer.from(sourceText, 'utf8')).digest('hex')}`;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      coordinate_basis: 'UTF8_BYTES',
      token_assertions: [{ text: '🧭', start_byte: 0, end_byte: 4 }],
      noun_phrase_spans: [],
      dependency_edges: [],
    }),
  });

  try {
    await assert.rejects(runIndexedSourceNlpV1({
      sourceText,
      sourceRef: 'src/component.svelte',
      sourceRevision,
      workspaceRevision: `sha256:${'b'.repeat(64)}`,
      sidecarUrl: 'http://127.0.0.1:8095',
    }), /NLP_SIDECAR_UTF8_SPAN_MISMATCH/);
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

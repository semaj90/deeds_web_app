import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSidecarLanguageAuthority, mapSidecarUtf8ByteOffset, resolveSourceParserRouteV1,
  validateSidecarAstReceipt, validateSidecarLanguageBindings } from './source-parser-route-v1.mjs';

const bindings = validateSidecarLanguageBindings([
  { fromNamespace: 'FILE_EXTENSION', fromLabel: '.svelte', toNamespace: 'SIDECAR_LANGUAGE', toLabel: 'svelte', authorityRevision: 'sha256:authority', authorityOwner: 'python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS', evidenceRefs: ['python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS'] },
  { fromNamespace: 'FILE_EXTENSION', fromLabel: '.py', toNamespace: 'SIDECAR_LANGUAGE', toLabel: 'python', authorityRevision: 'sha256:authority', authorityOwner: 'python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS', evidenceRefs: ['python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS'] },
  { fromNamespace: 'FILE_EXTENSION', fromLabel: '.java', toNamespace: 'SIDECAR_LANGUAGE', toLabel: 'java', authorityRevision: 'sha256:authority', authorityOwner: 'python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS', evidenceRefs: ['python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS'] },
]);

test('sidecar-routed code requires live extension authority and remains candidate-only', () => {
  assert.equal(resolveSourceParserRouteV1('src/App.svelte').reason, 'SIDECAR_CAPABILITIES_UNAVAILABLE');
  const route = resolveSourceParserRouteV1('src/App.svelte', bindings);
  assert.equal(route.status, 'ROUTED');
  assert.equal(route.language, 'svelte');
  assert.equal(route.symbolPolicy, 'CANDIDATE_ONLY_REQUIRES_CANONICAL_RESOLUTION');
});

test('JSONC, Markdown and plaintext use existing local routes with no code symbols', () => {
  for (const file of ['settings.jsonc', 'README.md', 'notes.txt']) {
    const route = resolveSourceParserRouteV1(file);
    assert.equal(route.status, 'ROUTED');
    assert.equal(route.symbolPolicy, 'NO_CODE_SYMBOLS');
  }
});

test('unmapped and unknown extensions abstain explicitly', () => {
  assert.equal(resolveSourceParserRouteV1('x.py').reason, 'SIDECAR_CAPABILITIES_UNAVAILABLE');
  assert.equal(resolveSourceParserRouteV1('x.yaml', bindings).status, 'NO_PARSER_RULE');
  assert.equal(resolveSourceParserRouteV1('x.yaml', bindings).reason, 'UNSUPPORTED_EXTENSION');
});

test('live sidecar bindings, not a duplicate extension allowlist, control routing', () => {
  const futureAlias = validateSidecarLanguageBindings([
    { fromNamespace: 'FILE_EXTENSION', fromLabel: '.componentx', toNamespace: 'SIDECAR_LANGUAGE',
      toLabel: 'typescript', authorityRevision: 'owner-r8',
      authorityOwner: 'python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS',
      evidenceRefs: ['python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS'] },
  ]);
  assert.equal(resolveSourceParserRouteV1('src/widget.componentx', futureAlias).status, 'ROUTED');
  assert.equal(resolveSourceParserRouteV1('src/widget.componentx', futureAlias).authorityRevision, 'owner-r8');
});

test('newly catalogued sidecar grammars remain candidate-only routes', () => {
  const grammarBindings = validateSidecarLanguageBindings([
    ['.sql', 'sql'], ['.ps1', 'powershell'], ['.proto', 'proto'], ['.sh', 'bash'],
    ['.yaml', 'yaml'], ['.c', 'c'], ['.cpp', 'cpp'], ['.toml', 'toml'],
  ].map(([fromLabel, toLabel]) => ({
    fromNamespace: 'FILE_EXTENSION', fromLabel, toNamespace: 'SIDECAR_LANGUAGE', toLabel,
    authorityRevision: 'owner-r9', authorityOwner: 'python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS',
    evidenceRefs: ['python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS'],
  })));
  for (const [extension, language] of [['.sql', 'sql'], ['.ps1', 'powershell'], ['.proto', 'proto'],
    ['.sh', 'bash'], ['.yaml', 'yaml'], ['.c', 'c'], ['.cpp', 'cpp'], ['.toml', 'toml']]) {
    const route = resolveSourceParserRouteV1(`fixture${extension}`, grammarBindings);
    assert.equal(route.status, 'ROUTED');
    assert.equal(route.language, language);
    assert.equal(route.symbolPolicy, 'CANDIDATE_ONLY_REQUIRES_CANONICAL_RESOLUTION');
  }
  assert.equal(resolveSourceParserRouteV1('fixture.h', grammarBindings).reason, 'UNSUPPORTED_EXTENSION');
  assert.deepEqual(resolveSourceParserRouteV1('fixture.jsonl', grammarBindings), {
    status: 'ROUTED', extension: '.jsonl', parser: 'stream-jsonl-batches-v1', documentKind: 'jsonl',
    symbolPolicy: 'NO_CODE_SYMBOLS',
  });
  assert.equal(resolveSourceParserRouteV1('fixture.ndjson', grammarBindings).parser, 'stream-jsonl-batches-v1');
});

test('sidecar authority rejects duplicate and revisionless bindings and routes owner-defined languages', () => {
  const binding = { fromNamespace: 'FILE_EXTENSION', fromLabel: '.py', toNamespace: 'SIDECAR_LANGUAGE', toLabel: 'python', authorityRevision: 'r1', authorityOwner: 'python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS', evidenceRefs: ['python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS'] };
  assert.throws(() => validateSidecarLanguageBindings([binding, binding]), /DUPLICATE/);
  const futureLanguage = validateSidecarLanguageBindings([{ ...binding, toLabel: 'future_lang' }]);
  const futureRoute = resolveSourceParserRouteV1('x.py', futureLanguage);
  assert.equal(futureRoute.status, 'ROUTED');
  assert.equal(futureRoute.language, 'future_lang');
  assert.equal(futureRoute.symbolPolicy, 'CANDIDATE_ONLY_REQUIRES_CANONICAL_RESOLUTION');
  assert.throws(() => validateSidecarLanguageBindings([{ ...binding, authorityRevision: '' }]), /REVISION_MISSING/);
});

test('live capability loader consumes the sidecar-owned extension map', async () => {
  const health = { status: 'ok', contract: 'provenance-v2', processId: 123, processStartedMonotonicNs: '1000', runtimeSourceBindings: { modules: {
    miniforge_nlp_sidecar_v2: `sha256:${'a'.repeat(64)}`, miniforge_nlp_sidecar: `sha256:${'b'.repeat(64)}`,
  } } };
  const authority = await loadSidecarLanguageAuthority('http://sidecar.test/', async (url) => {
    if (url.endsWith('/health')) return { ok: true, json: async () => health };
    assert.equal(url, 'http://sidecar.test/capabilities');
    return { ok: true, json: async () => ({ ast: { available: true, languageBindings: [
      { fromNamespace: 'FILE_EXTENSION', fromLabel: '.svelte', toNamespace: 'SIDECAR_LANGUAGE', toLabel: 'svelte', authorityRevision: 'owner-r7', authorityOwner: 'python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS', evidenceRefs: ['python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS'] },
    ] } }) };
  });
  assert.equal(resolveSourceParserRouteV1('Component.svelte', authority).authorityRevision, 'owner-r7');
  assert.equal(authority.runtimeSourceBindings.miniforge_nlp_sidecar_v2, `sha256:${'a'.repeat(64)}`);
  assert.equal(authority.runtimeProcessId, 123);
  assert.equal(authority.runtimeProcessStartedMonotonicNs, '1000');
  assert.equal(authority.sidecarContract, 'provenance-v2');
  await assert.rejects(loadSidecarLanguageAuthority('http://sidecar.test', async () => ({ ok: false, status: 503 })), /HTTP_503/);
});

test('capability loading bypasses caches and observes a changed live revision', async () => {
  const revisions = ['owner-r7', 'owner-r8'];
  let capabilityCount = 0;
  const fetchImpl = async (url, init) => {
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers['cache-control'], 'no-cache');
    if (url.endsWith('/health')) return { ok: true, json: async () => ({ status: 'ok', contract: 'provenance-v2', processId: 456, processStartedMonotonicNs: '2000', runtimeSourceBindings: { modules: {
      miniforge_nlp_sidecar_v2: `sha256:${'a'.repeat(64)}`, miniforge_nlp_sidecar: `sha256:${'b'.repeat(64)}`,
    } } }) };
    const revision = revisions[capabilityCount++];
    return { ok: true, json: async () => ({ ast: { available: true, languageBindings: [
      { fromNamespace: 'FILE_EXTENSION', fromLabel: '.svelte', toNamespace: 'SIDECAR_LANGUAGE',
        toLabel: 'svelte', authorityRevision: revision,
        authorityOwner: 'python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS',
        evidenceRefs: ['python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS'] },
    ] } }) };
  };
  const first = await loadSidecarLanguageAuthority('http://sidecar.test', fetchImpl);
  const second = await loadSidecarLanguageAuthority('http://sidecar.test', fetchImpl);
  assert.equal(capabilityCount, 2);
  assert.equal(first.get('.svelte').authorityRevision, 'owner-r7');
  assert.equal(second.get('.svelte').authorityRevision, 'owner-r8');
});

test('runtime identity loader rejects incomplete health and process changes during capability reads', async () => {
  await assert.rejects(loadSidecarLanguageAuthority('http://sidecar.test', async () => ({
    ok: true, json: async () => ({ status: 'ok', contract: 'provenance-v2' }),
  })), /RUNTIME_BINDING_INVALID/);
  let healthCount = 0;
  await assert.rejects(loadSidecarLanguageAuthority('http://sidecar.test', async (url) => {
    if (url.endsWith('/capabilities')) return { ok: true, json: async () => ({ ast: { available: true, languageBindings: [
      { fromNamespace: 'FILE_EXTENSION', fromLabel: '.py', toNamespace: 'SIDECAR_LANGUAGE', toLabel: 'python', authorityRevision: 'r1', authorityOwner: 'python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS', evidenceRefs: ['python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS'] },
    ] } }) };
    const digest = 'a';
    const processId = healthCount++ === 0 ? 100 : 200;
    const started = healthCount === 1 ? '1000' : '2000';
    return { ok: true, json: async () => ({ status: 'ok', contract: 'provenance-v2', processId, processStartedMonotonicNs: started, runtimeSourceBindings: { modules: {
      miniforge_nlp_sidecar_v2: `sha256:${digest.repeat(64)}`, miniforge_nlp_sidecar: `sha256:${'b'.repeat(64)}`,
    } } }) };
  }), /RUNTIME_CHANGED_DURING_CAPABILITY_READ/);
});

test('AST receipt requires complete, clean, matching evidence and producer version', () => {
  const valid = { schema: 'atlas.ast.evidence.v1', file_path: 'x.py', source_revision: 'sha256:1',
    language: 'python', scan_completeness: 'COMPLETE', syntax_status: 'CLEAN', chunks: [],
    engine: 'treesitter-chunker', engine_version: '1.2' };
  assert.equal(validateSidecarAstReceipt(valid, { filePath: 'x.py', sourceRevision: 'sha256:1', language: 'python' }), valid);
  assert.throws(() => validateSidecarAstReceipt({ ...valid, scan_completeness: undefined },
    { filePath: 'x.py', sourceRevision: 'sha256:1', language: 'python' }), /MISSING_RECEIPT/);
  assert.throws(() => validateSidecarAstReceipt({ ...valid, source_revision: 'stale' },
    { filePath: 'x.py', sourceRevision: 'sha256:1', language: 'python' }), /LINEAGE_MISMATCH/);
  assert.throws(() => validateSidecarAstReceipt({ ...valid, syntax_status: 'RECOVERED_WITH_ERRORS' },
    { filePath: 'x.py', sourceRevision: 'sha256:1', language: 'python' }), /NOT_CLEAN/);
});

test('sidecar UTF-8 byte offsets reject codepoint splits before LSP/raw-byte conversion', () => {
  const text = 'a😀b';
  assert.equal(mapSidecarUtf8ByteOffset(text, 5), 3);
  assert.throws(() => mapSidecarUtf8ByteOffset(text, 2), /SPLITS_UTF8_SEQUENCE/);
  assert.throws(() => mapSidecarUtf8ByteOffset(text, 99), /OUT_OF_BOUNDS/);
});

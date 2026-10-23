import path from 'node:path';

export function validateSidecarLanguageBindings(bindings) {
  if (!Array.isArray(bindings)) throw new TypeError('SIDECAR_CAPABILITIES_INVALID');
  const result = new Map();
  const authorityRevisions = new Set();
  for (const binding of bindings) {
    if (binding?.fromNamespace !== 'FILE_EXTENSION' || binding?.toNamespace !== 'SIDECAR_LANGUAGE') continue;
    const extension = binding.fromLabel;
    const language = binding.toLabel;
    if (typeof extension !== 'string' || !/^\.[a-z0-9]{1,12}$/.test(extension)
      || typeof language !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(language)) {
      throw new TypeError(`SIDECAR_BINDING_UNRECOGNIZED:${String(extension)}:${String(language)}`);
    }
    if (result.has(extension)) throw new TypeError(`SIDECAR_BINDING_DUPLICATE:${extension}`);
    if (typeof binding.authorityRevision !== 'string' || !binding.authorityRevision) {
      throw new TypeError(`SIDECAR_BINDING_REVISION_MISSING:${extension}`);
    }
    if (binding.authorityOwner !== 'python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS'
      || !Array.isArray(binding.evidenceRefs)
      || !binding.evidenceRefs.includes('python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS')) {
      throw new TypeError(`SIDECAR_BINDING_OWNER_UNPROVEN:${extension}`);
    }
    authorityRevisions.add(binding.authorityRevision);
    result.set(extension, Object.freeze({ language, authorityRevision: binding.authorityRevision }));
  }
  if (result.size === 0) throw new TypeError('SIDECAR_BINDINGS_EMPTY');
  if (authorityRevisions.size !== 1) throw new TypeError('SIDECAR_BINDING_REVISION_INCONSISTENT');
  return result;
}

export function resolveSourceParserRouteV1(sourceRef, sidecarBindings) {
  const extension = path.extname(sourceRef).toLowerCase();
  const localRoutes = {
    '.json': { parser: 'typescript-json', documentKind: 'json' },
    '.jsonc': { parser: 'typescript-jsonc', documentKind: 'json' },
    '.jsonl': { parser: 'stream-jsonl-batches-v1', documentKind: 'jsonl' },
    '.ndjson': { parser: 'stream-jsonl-batches-v1', documentKind: 'jsonl' },
    '.md': { parser: 'markdown', documentKind: 'markdown' },
    '.markdown': { parser: 'markdown', documentKind: 'markdown' },
    '.txt': { parser: 'plaintext', documentKind: 'plaintext' },
  };
  if (localRoutes[extension]) {
    return Object.freeze({ status: 'ROUTED', extension, ...localRoutes[extension], symbolPolicy: 'NO_CODE_SYMBOLS' });
  }
  if (!(sidecarBindings instanceof Map)) {
    return Object.freeze({ status: 'BLOCKED', reason: 'SIDECAR_CAPABILITIES_UNAVAILABLE', extension });
  }
  const binding = sidecarBindings.get(extension);
  if (binding) {
    return Object.freeze({
      status: 'ROUTED', extension, parser: 'sidecar-ast-chunk', documentKind: 'code',
      language: binding.language, authorityRevision: binding.authorityRevision,
      symbolPolicy: 'CANDIDATE_ONLY_REQUIRES_CANONICAL_RESOLUTION',
    });
  }
  return Object.freeze({ status: 'NO_PARSER_RULE', reason: 'UNSUPPORTED_EXTENSION', extension });
}

export async function loadSidecarLanguageAuthority(baseUrl, fetchImpl = fetch) {
  if (typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) {
    throw new TypeError('SIDECAR_URL_INVALID');
  }
  const base = baseUrl.replace(/\/$/, '');
  const get = async (endpoint) => {
    const response = await fetchImpl(`${base}${endpoint}`, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`SIDECAR_${endpoint.slice(1).toUpperCase()}_HTTP_${response.status}`);
    return response.json();
  };
  const validateHealth = (health) => {
    const modules = health?.runtimeSourceBindings?.modules;
    if (health?.status !== 'ok' || health?.contract !== 'provenance-v2'
      || !Number.isSafeInteger(health.processId) || health.processId <= 0
      || !/^[1-9][0-9]*$/.test(health.processStartedMonotonicNs ?? '')
      || !modules || !/^sha256:[a-f0-9]{64}$/.test(modules.miniforge_nlp_sidecar_v2 ?? '')
      || !/^sha256:[a-f0-9]{64}$/.test(modules.miniforge_nlp_sidecar ?? '')) {
      throw new TypeError('SIDECAR_RUNTIME_BINDING_INVALID');
    }
    return Object.freeze({
      processId: health.processId,
      processStartedMonotonicNs: health.processStartedMonotonicNs,
      miniforge_nlp_sidecar_v2: modules.miniforge_nlp_sidecar_v2,
      miniforge_nlp_sidecar: modules.miniforge_nlp_sidecar,
    });
  };
  const before = validateHealth(await get('/health'));
  const body = await get('/capabilities');
  const after = validateHealth(await get('/health'));
  if (before.processId !== after.processId
    || before.processStartedMonotonicNs !== after.processStartedMonotonicNs
    || before.miniforge_nlp_sidecar_v2 !== after.miniforge_nlp_sidecar_v2
    || before.miniforge_nlp_sidecar !== after.miniforge_nlp_sidecar) {
    throw new Error('SIDECAR_RUNTIME_CHANGED_DURING_CAPABILITY_READ');
  }
  const bindings = body?.ast?.languageBindings;
  if (!Array.isArray(bindings)) throw new TypeError('SIDECAR_CAPABILITIES_INVALID');
  const authority = validateSidecarLanguageBindings(bindings);
  if (body?.ast?.available !== true) throw new Error('SIDECAR_AST_UNAVAILABLE');
  authority.runtimeSourceBindings = after;
  authority.runtimeProcessId = after.processId;
  authority.runtimeProcessStartedMonotonicNs = after.processStartedMonotonicNs;
  authority.sidecarContract = 'provenance-v2';
  return authority;
}

export function validateSidecarAstReceipt(body, expected) {
  if (body?.schema !== 'atlas.ast.evidence.v1' || body.file_path !== expected.filePath
    || body.source_revision !== expected.sourceRevision || body.language !== expected.language) {
    throw new Error('SIDECAR_AST_RESPONSE_LINEAGE_MISMATCH');
  }
  if (body.scan_completeness !== 'COMPLETE') throw new Error(`AST_SCAN_INCOMPLETE:${body.scan_completeness ?? 'MISSING_RECEIPT'}`);
  if (body.syntax_status !== 'CLEAN' || body.error_tag || !Array.isArray(body.chunks)) {
    throw new Error('SIDECAR_AST_PARSE_NOT_CLEAN');
  }
  if (typeof body.engine !== 'string' || !body.engine || typeof body.engine_version !== 'string' || !body.engine_version) {
    throw new Error('SIDECAR_AST_PRODUCER_VERSION_MISSING');
  }
  return body;
}

export function mapSidecarUtf8ByteOffset(text, offset) {
  const bytes = Buffer.from(text, 'utf8');
  if (!Number.isInteger(offset) || offset < 0 || offset > bytes.length) throw new Error('SIDECAR_AST_SPAN_OUT_OF_BOUNDS');
  const prefix = bytes.subarray(0, offset);
  const decodedPrefix = prefix.toString('utf8');
  if (!Buffer.from(decodedPrefix, 'utf8').equals(prefix)) throw new Error('SIDECAR_AST_SPAN_SPLITS_UTF8_SEQUENCE');
  return decodedPrefix.length;
}

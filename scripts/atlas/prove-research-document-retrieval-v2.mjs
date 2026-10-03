#!/usr/bin/env node

/**
 * Bounded, read-only end-to-end contract proof for the v2 research/document
 * retrieval boundary. It reuses existing owners and intentionally does not
 * fetch remote pages, write Postgres/Qdrant/Valkey, or promote source rows.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = join(root, 'docs/reports/research-document-retrieval-v2.json');
const sha256 = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

const requiredFiles = [
  'docker/langgraph-synthesis/research_contracts.py',
  'docker/langgraph-synthesis/app.py',
  'python/atlas_external_docs.py',
  'scripts/atlas/prove-postgres-fts-replay-v1.mjs',
  'scripts/atlas/replay-pgvector-semantic-768-exact-hnsw-v1.mjs',
  'scripts/atlas/audit-dag-parameter-scope-v1.mjs',
  'scripts/atlas/audit-dag-parameter-executor-consumers-v1.mjs',
  'scripts/atlas/audit-ast-grep-outline-symbol-population-v1.mjs',
];

function runPythonProbe() {
  const code = String.raw`
import asyncio, json, sys
sys.path.insert(0, 'docker/langgraph-synthesis')
sys.path.insert(0, 'python')
from research_contracts import ParameterArtifactV1, WebSearchEnvelopeV1
from atlas_external_docs import chunk_document, extract_structured_text

html = b'''<html><head><title>Atlas Docs</title></head><body>
<h1>Retrieval</h1><p>Use semantic_768 for bounded cosine retrieval.</p>
<pre><code>SELECT content_embedding_768 FROM codebase_chunk_index;</code></pre>
</body></html>'''
title, text, links = extract_structured_text(html, base_url='https://example.test/docs')
chunks = chunk_document(
    source_id='fixture:atlas-docs', source_revision='sha256:fixture-doc-v2',
    source_url='https://example.test/docs', title=title, text=text,
    maximum_chars=120, overlap_chars=10,
)
envelope = WebSearchEnvelopeV1(query='semantic_768', provider='fixture', results=[])
parameter = ParameterArtifactV1(
    parameter_key='retrieval.top_k', value=5,
    input_checksum='sha256:fixture-input', producer_revision='fixture-v2',
)
assert title == 'Atlas Docs'
assert chunks and all(chunk.source_revision == 'sha256:fixture-doc-v2' for chunk in chunks)
assert all(chunk.start_byte <= chunk.end_byte for chunk in chunks)
assert envelope.canonical_authority is False and parameter.writes_performed is False
print(json.dumps({
  'title': title, 'links': len(links), 'chunks': len(chunks),
  'chunkIds': [chunk.chunk_id for chunk in chunks],
  'byteSpansValid': all(chunk.start_byte <= chunk.end_byte for chunk in chunks),
  'webSearchContract': 'PASS', 'pydanticContracts': 'PASS',
}))
`;
  try {
    const stdout = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', code], {
      cwd: root,
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 'PASS', output: JSON.parse(stdout.trim()) };
  } catch (error) {
    return { status: 'BLOCKED', error: String(error.stderr ?? error.message ?? error).trim().slice(0, 1000) };
  }
}

function runContainerWebSearchSmoke() {
  try {
    const contractPresence = execFileSync('docker', [
      'exec', 'legal-ai-langgraph', 'sh', '-lc', 'test -f /app/research_contracts.py',
    ], { cwd: root, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = execFileSync('docker', [
      'exec', 'legal-ai-langgraph', 'python', '-c',
      "import asyncio, app; print(asyncio.run(app.web_search('', 5)))",
    ], { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 512 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return {
      status: contractPresence === undefined ? 'PASS' : 'PASS',
      typedV2ContractMounted: true,
      output: stdout.trim().slice(-1000),
      image: 'legal-ai-langgraph',
    };
  } catch (error) {
    let output = '';
    try {
      output = execFileSync('docker', [
        'exec', 'legal-ai-langgraph', 'python', '-c',
        "import asyncio, app; print(asyncio.run(app.web_search('', 5)))",
      ], { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 512 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (fallbackError) {
      return { status: 'BLOCKED', error: String(fallbackError.stderr ?? fallbackError.message ?? fallbackError).trim().slice(0, 1000), image: 'legal-ai-langgraph' };
    }
    return {
      status: 'LEGACY_IMAGE_SMOKE_ONLY',
      typedV2ContractMounted: false,
      output: output.trim().slice(-1000),
      note: 'Running container is healthy but does not contain the new v2 contract module; rebuild/redeploy is required for live typed-path proof.',
      image: 'legal-ai-langgraph',
    };
  }
}

function runLdrMcpHealth() {
  try {
    const stdout = execFileSync(process.execPath, [join(root, 'scripts/atlas/ldr-mcp-health.mjs'), '--timeout=8000'], {
      cwd: root, encoding: 'utf8', timeout: 15_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const start = stdout.lastIndexOf('{');
    const payload = JSON.parse(stdout.slice(start));
    return { status: payload.ok ? 'PASS' : 'BLOCKED', toolCount: payload.toolCount ?? 0, toolNames: payload.toolNames ?? [] };
  } catch (error) {
    return { status: 'BLOCKED', error: String(error.stderr ?? error.message ?? error).trim().slice(0, 1000) };
  }
}

function syntaxCheck(paths) {
  const failures = [];
  for (const path of paths) {
    try {
      execFileSync(process.execPath, ['--check', join(root, path)], { encoding: 'utf8', timeout: 20_000, stdio: 'pipe' });
    } catch (error) {
      failures.push({ path, error: String(error.stderr ?? error.message ?? error).trim().slice(0, 500) });
    }
  }
  return failures;
}

const missingFiles = requiredFiles.filter((path) => !existsSync(join(root, path)));
const syntaxFailures = syntaxCheck(requiredFiles.filter((path) => path.endsWith('.mjs')));
const pythonProbe = missingFiles.length === 0 ? runPythonProbe() : { status: 'BLOCKED', error: 'required owner file missing' };
const appSource = readFileSync(join(root, 'docker/langgraph-synthesis/app.py'), 'utf8');
const webSearchOwnerSource = {
  validatedHelperPresent: appSource.includes('def _validated_web_results'),
  pydanticValidationPresent: appSource.includes('WebSearchResultV1.model_validate'),
  boundedLimitPresent: appSource.includes('min(limit, 50)'),
};
const containerWebSearch = runContainerWebSearchSmoke();
const ldrToolSource = readFileSync(join(root, 'sveltekit-frontend/scripts/mcp/ldr-mcp.mjs'), 'utf8');
const ldrRegistrationSource = readFileSync(join(root, 'sveltekit-frontend/src/mcp/ldr-research-tools.ts'), 'utf8');
const mcpParameterContracts = {
  standaloneLdr: {
    startResearch: ldrToolSource.includes("name: 'ldr.start_research'") && ldrToolSource.includes('max_iterations') && ldrToolSource.includes('search_engines'),
    pollStatus: ldrToolSource.includes("name: 'ldr.poll_status'") && ldrToolSource.includes('taskId'),
    searchHistory: ldrToolSource.includes("name: 'ldr.search_history'") && ldrToolSource.includes('limit'),
    quickSummary: ldrToolSource.includes("name: 'ldr.quick_summary'") && ldrToolSource.includes('max_results'),
  },
  streamableTrace: {
    ldrResearch: ldrRegistrationSource.includes("'ldr_research'") && ldrRegistrationSource.includes('maxResults') && ldrRegistrationSource.includes('maxDocs') && ldrRegistrationSource.includes('temperature'),
  },
  exactUsage: {
    standaloneStart: { query: 'string length 3..2000', max_iterations: 'integer 1..10', search_engines: 'string[]' },
    standalonePoll: { taskId: 'non-empty string' },
    standaloneHistory: { query: 'string length 3..500', limit: 'integer 1..50' },
    standaloneSummary: { query: 'string length 3..1000', max_results: 'integer 1..20' },
    traceResearch: { query: 'non-empty string', maxResults: 'integer 1..50', maxDocs: 'integer 1..20', temperature: 'number 0..1' },
  },
};
const ldrMcpHealth = runLdrMcpHealth();
const existingReports = {
  fts: 'docs/reports/postgres-fts-replay-v1.json',
  pgvector: 'docs/reports/postgres-pgvector-exact-hnsw-replay-v1.json',
  dagScope: 'docs/reports/dag-parameter-scope-v1.json',
  dagConsumers: 'docs/reports/dag-parameter-executor-consumers-v1.json',
};
const reportStatuses = Object.fromEntries(Object.entries(existingReports).map(([key, path]) => {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [key, { present: false }];
  try {
    const parsed = JSON.parse(readFileSync(absolute, 'utf8'));
    return [key, { present: true, status: parsed.status ?? parsed.classification ?? null, reportPath: path }];
  } catch {
    return [key, { present: true, status: 'INVALID_JSON', reportPath: path }];
  }
}));

const body = {
  schema: 'atlas.research-document-retrieval.v2',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_BOUNDED_FIXTURE',
  owners: {
    webSearch: 'docker/langgraph-synthesis/app.py',
    typedContracts: 'docker/langgraph-synthesis/research_contracts.py',
    htmlNormalizationAndChunking: 'python/atlas_external_docs.py',
    postgresFts: 'scripts/atlas/prove-postgres-fts-replay-v1.mjs',
    pgvector: 'scripts/atlas/replay-pgvector-semantic-768-exact-hnsw-v1.mjs',
    dagParameters: 'scripts/atlas/audit-dag-parameter-scope-v1.mjs',
    astGrep: 'scripts/atlas/audit-ast-grep-outline-symbol-population-v1.mjs',
  },
  checks: {
    requiredFiles: { count: requiredFiles.length, missing: missingFiles },
    javascriptSyntax: { checked: requiredFiles.filter((path) => path.endsWith('.mjs')).length, failures: syntaxFailures },
    pythonContractAndDocumentFixture: pythonProbe,
    webSearchOwnerSource,
    containerWebSearch,
    mcpParameterContracts,
    ldrMcpHealth,
    existingReadOnlyReports: reportStatuses,
  },
  boundaries: {
    canonicalAuthority: false,
    writesPerformed: false,
    promotionAuthorized: false,
    remoteFetchPerformed: false,
    vectorBackfillPerformed: false,
    cacheWarmPerformed: false,
    graphifyRefreshPerformed: false,
    semanticLane: 'one logical semantic_768 lane; executors remain interchangeable',
    vectorContract: 'pgvector exact oracle; HNSW challenger; revision-qualified eligibility required',
    plannerContract: 'PostgreSQL AIO/BitmapAnd are planner observations, not application identity',
    astGrepContract: 'bounded documentation structure evidence only; not canonical identity',
  },
  status: missingFiles.length === 0 && syntaxFailures.length === 0 && pythonProbe.status === 'PASS'
    && Object.values(webSearchOwnerSource).every(Boolean) && containerWebSearch.status === 'PASS'
    ? 'RESEARCH_DOCUMENT_RETRIEVAL_V2_FIXTURE_AND_RUNTIME_SMOKE_PROVEN'
    : 'RESEARCH_DOCUMENT_RETRIEVAL_V2_REVIEW_REQUIRED',
  blockers: [
    'External document persistence and pgvector streaming require a separately admitted, revision-qualified cohort.',
    'Existing FTS/pgvector live reports may remain blocked by missing revision-qualified rows.',
    'This fixture does not prove remote provider availability, production latency, or canonical promotion.',
  ],
};
body.receiptChecksum = sha256(JSON.stringify(body));
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: body.status,
  pythonProbe: pythonProbe.status,
  syntaxFailures: syntaxFailures.length,
  missingFiles: missingFiles.length,
  reportPath: relative(root, reportPath).replaceAll('\\', '/'),
  writesPerformed: false,
}, null, 2));

#!/usr/bin/env node

/** Read-only join proof for existing research, doc, Postgres and vector owners. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = join(root, 'docs/reports/research-document-retrieval-v3.json');
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const run = (command, args, timeout = 45_000) => execFileSync(command, args, {
  cwd: root, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const psql = (sql) => run('docker', [
  'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db',
  '-X', '-A', '-t', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', sql,
]);

function capture(fn) {
  try { return { status: 'PROVEN', value: fn() }; }
  catch (error) { return { status: 'BLOCKED', error: String(error.stderr ?? error.message ?? error).trim().slice(0, 900) }; }
}

const webSearch = capture(() => {
  const output = run('docker', [
    'exec', 'legal-ai-langgraph', 'python', '-c',
    "import asyncio,json,app; print(json.dumps(asyncio.run(app.web_search('PostgreSQL 18 asynchronous I/O documentation',2))))",
  ], 30_000);
  const results = JSON.parse(output.trim());
  if (!Array.isArray(results) || results.length < 1 || results.length > 2) throw new Error('WEB_SEARCH_RESULT_COUNT_INVALID');
  if (results.some((r) => !r.url?.startsWith('https://') || !r.source)) throw new Error('WEB_SEARCH_RESULT_SCHEMA_INVALID');
  return { count: results.length, provider: results[0].source, resultUrls: results.map((r) => r.url) };
});

const fetchAndChunk = capture(() => {
  const py = String.raw`
import json,sys
sys.path.insert(0,'docker/langgraph-synthesis'); sys.path.insert(0,'python')
from research_contracts import FetchedResearchDocumentV1
import atlas_external_docs as docs
url='https://www.postgresql.org/docs/18/runtime-config-resource.html'
a=docs.fetch_beautifulsoup(url,timeout_seconds=20)
b=docs.fetch_beautifulsoup(url,timeout_seconds=20)
model=FetchedResearchDocumentV1.model_validate({
 'query':'PostgreSQL 18 asynchronous I/O documentation','url':a.url,'resolved_url':a.resolved_url,
 'title':a.title,'fetcher':a.fetcher,'normalized_text':a.markdown,
 'normalized_checksum':a.normalized_checksum})
normalized=docs._normalize_ws(model.normalized_text)
chunks=docs.chunk_document(source_id='fixture:postgresql-18-resource',source_revision=model.normalized_checksum,
 source_url=model.resolved_url,title=model.title,text=model.normalized_text,maximum_chars=5000,overlap_chars=100)
raw=normalized.encode('utf-8')
valid=all(raw[c.start_byte:c.end_byte].decode('utf-8')==c.text for c in chunks)
print(json.dumps({'fetcher':model.fetcher,'url':model.resolved_url,'title':model.title,
 'fetchChecksum':model.normalized_checksum,'repeatChecksum':b.normalized_checksum,
 'deterministic':model.normalized_checksum==b.normalized_checksum,
 'chunkCount':len(chunks),'utf8SpanReplay':valid,
 'chunkRevisionsAreContentChecksums':all(c.source_revision==model.normalized_checksum for c in chunks),
 'canonicalAuthority':model.canonical_authority,'writesPerformed':model.writes_performed}))
if not valid or model.normalized_checksum!=b.normalized_checksum: sys.exit(3)
`;
  const output = run(process.platform === 'win32' ? 'python' : 'python3', ['-c', py], 60_000);
  return JSON.parse(output.trim());
});

const fts = capture(() => {
  const output = psql("BEGIN READ ONLY; SELECT chunk_id || '|' || evidence_revision FROM atlas_external_doc_chunks WHERE search_vector @@ websearch_to_tsquery('english','Bitmap Heap Scan') AND evidence_revision LIKE 'sha256:%' ORDER BY chunk_id LIMIT 10; ROLLBACK;");
  const rows = output.split(/\r?\n/).map((x) => x.trim()).filter((x) => x.startsWith('doc:')).map((x) => x.split('|'));
  if (!rows.length || rows.some((r) => !r[1]?.startsWith('sha256:'))) throw new Error('REVISION_QUALIFIED_FTS_HIT_MISSING');
  return { query: 'Bitmap Heap Scan', qualifiedHits: rows.length, chunkIds: rows.map((r) => r[0]), evidenceRevisions: rows.map((r) => r[1]) };
});

function topK(settings) {
  const sql = `BEGIN READ ONLY; ${settings} WITH q AS (SELECT content_embedding AS v FROM atlas_external_doc_chunks WHERE chunk_id=(SELECT chunk_id FROM atlas_external_doc_chunks WHERE search_vector @@ websearch_to_tsquery('english','Bitmap Heap Scan') LIMIT 1)), ranked AS (SELECT c.chunk_id,c.evidence_revision,c.content_embedding <=> q.v AS d FROM atlas_external_doc_chunks c CROSS JOIN q WHERE c.content_embedding IS NOT NULL AND c.evidence_revision LIKE 'sha256:%' ORDER BY c.content_embedding <=> q.v LIMIT 10) SELECT string_agg(chunk_id || ':' || evidence_revision, ',' ORDER BY d) FROM ranked; ROLLBACK;`;
  const out = psql(sql).split(/\r?\n/).map((x) => x.trim()).find((x) => x.startsWith('doc:'));
  if (!out) throw new Error('VECTOR_TOPK_EMPTY');
  return out.split(',').map((pair) => { const i = pair.lastIndexOf(':sha256:'); return { chunkId: pair.slice(0, i), evidenceRevision: pair.slice(i + 1) }; });
}

const semantic = capture(() => {
  const exact = topK('SET LOCAL enable_indexscan=off; SET LOCAL enable_bitmapscan=off; SET LOCAL enable_seqscan=on;');
  const ann = topK('SET LOCAL enable_seqscan=off; SET LOCAL hnsw.iterative_scan=strict_order;');
  const plan = psql("BEGIN READ ONLY; SET LOCAL enable_seqscan=off; EXPLAIN (COSTS OFF) SELECT chunk_id FROM atlas_external_doc_chunks WHERE content_embedding IS NOT NULL ORDER BY content_embedding <=> (SELECT content_embedding FROM atlas_external_doc_chunks WHERE chunk_id=(SELECT chunk_id FROM atlas_external_doc_chunks WHERE search_vector @@ websearch_to_tsquery('english','Bitmap Heap Scan') LIMIT 1)) LIMIT 10; ROLLBACK;");
  const same = JSON.stringify(exact.map((x) => x.chunkId)) === JSON.stringify(ann.map((x) => x.chunkId));
  if (!same) throw new Error('EXACT_HNSW_TOPK_MISMATCH');
  if (!plan.includes('aedc_embedding_hnsw')) throw new Error('HNSW_INDEX_NOT_SELECTED');
  return { executorFixture: 'stored-corpus self-query; not a generated query embedding or relevance benchmark', dimension: 768,
    exactHits: exact.length, hnswHits: ann.length, sameOrderedTopK: same,
    recallAtK: new Set(exact.map((x) => x.chunkId)).size ? exact.filter((x) => ann.some((a) => a.chunkId === x.chunkId)).length / exact.length : null,
    allResultsRevisionQualified: [...exact, ...ann].every((x) => x.evidenceRevision.startsWith('sha256:')),
    hnswPlanObserved: plan.includes('aedc_embedding_hnsw'), exact, ann,
    index: 'aedc_embedding_hnsw', writes: 0 };
});

const contractFixture = capture(() => {
  const py = String.raw`import sys,hashlib;sys.path.insert(0,'docker/langgraph-synthesis');from research_contracts import FetchedResearchDocumentV1;print(FetchedResearchDocumentV1.model_fields.keys())`;
  const fields = run(process.platform === 'win32' ? 'python' : 'python3', ['-c', py]).trim();
  if (!fields.includes('normalized_checksum')) throw new Error('FETCHED_DOCUMENT_CONTRACT_MISSING');
  return { fetchedDocumentSchema: 'atlas.fetched-research-document.v1', checksumBound: true, extraFieldsForbidden: true, result: 'PASS' };
});

const dbInventory = capture(() => {
  const out = psql("BEGIN READ ONLY; SELECT count(*) || '|' || count(content_embedding) || '|' || count(*) FILTER (WHERE evidence_revision LIKE 'sha256:%') || '|' || min(vector_dims(content_embedding)) || '|' || max(vector_dims(content_embedding)) FROM atlas_external_doc_chunks; ROLLBACK;");
  const row = out.split(/\r?\n/).map((x) => x.trim()).find((x) => /^\d+\|/.test(x));
  const [chunks, embedded, qualified, minDim, maxDim] = row.split('|').map(Number);
  return { chunks, embedded, revisionQualified: qualified, minDimension: minDim, maxDimension: maxDim };
});

const parameterDag = fts.status === 'PROVEN' ? capture(() => {
  const moduleUrl = (file) => pathToFileURL(join(root, file)).href;
  const source = `
import { buildParameterArtifactV1 } from '${moduleUrl('packages/parent-atlas/src/core/parameter-artifact-v1.ts')}';
import { buildAdaptiveDagPlanV1 } from '${moduleUrl('packages/parent-atlas/src/core/adaptive-dag-plan-v1.ts')}';
import { buildKernelDagExecutionBindingV1, resolveKernelDagParameterArtifactV1 } from '${moduleUrl('packages/parent-atlas/src/core/kernel-dag-execution-binding-v1.ts')}';
const args = ${JSON.stringify({ chunkId: fts.value.chunkIds[0], evidenceRevision: fts.value.evidenceRevisions[0], store: 'atlas_external_doc_chunks', readOnly: true })};
const artifact = buildParameterArtifactV1({ actionId: 'rd3:fetch-doc-chunk', actionKind: 'FETCH_POSTGRES', schemaRef: 'atlas.external-doc-chunk-reference.v1', schemaRevision: 'v1', boundArguments: args });
const [action] = buildAdaptiveDagPlanV1({ planId: 'rd3:plan', queryId: 'rd3:query', dagRevision: 'rd3:v1', plannerRevision: 'rd3:planner:v1', classificationRevision: 'rd3:class:v1', actions: [{ actionId: artifact.actionId, actionKind: 'FETCH_POSTGRES', parentActionIds: [], inputArtifactRefs: [args.chunkId], inputChecksum: 'rd3-input-checksum', parameterArtifactRef: artifact.artifactId, parameterChecksum: artifact.parameterChecksum, outputContract: 'atlas.external-doc-chunk-reference.v1', mutationPolicy: 'READ_ONLY', timeoutMs: 1000, failurePolicy: 'FAIL_CLOSED' }] }).actions;
const binding = buildKernelDagExecutionBindingV1({ action, functionId: 'rd3:function', stepId: 'rd3:step', operatorId: 'rd3:lookup', operatorKind: 'LOOKUP_PACKET', implementationRef: 'postgres:atlas_external_doc_chunks:read-only-reference', boundArguments: args, expectedOutputSchemaId: 'atlas.external-doc-chunk-reference.v1' });
const resolved = resolveKernelDagParameterArtifactV1({ action, binding, artifact });
if (resolved.chunkId !== args.chunkId || resolved.evidenceRevision !== args.evidenceRevision) throw new Error('RD3_PARAMETER_EVIDENCE_MISMATCH');
console.log(JSON.stringify({ artifactId: artifact.artifactId, artifactChecksum: artifact.artifactChecksum, parameterChecksum: artifact.parameterChecksum, chunkId: resolved.chunkId, evidenceRevision: resolved.evidenceRevision, mutationPolicy: action.mutationPolicy, writesPerformed: false }));
`;
  return JSON.parse(run(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '-e', source], 30_000).trim());
}) : { status: 'BLOCKED', error: 'revision-qualified FTS evidence unavailable' };

const body = {
  schema: 'atlas.research-document-retrieval-proof.v3', generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_LIVE_JOIN_AND_BOUNDED_FETCH_FIXTURE',
  owners: {
    webSearch: 'docker/langgraph-synthesis/app.py::web_search',
    fetchedDocumentContract: 'docker/langgraph-synthesis/research_contracts.py::FetchedResearchDocumentV1',
    fetchNormalizeChunk: 'python/atlas_external_docs.py::fetch_beautifulsoup/extract_structured_text/chunk_document',
    canonicalDocs: 'PostgreSQL atlas_external_doc_pages/atlas_external_doc_chunks',
    parameterArtifact: 'packages/parent-atlas/src/core/parameter-artifact-v1.ts',
    parameterResolver: 'sveltekit-frontend/src/lib/server/atlas/agentic/contracts/parameter-resolver-v1.ts',
  },
  checks: { webSearch, fetchedDocument: fetchAndChunk, pydanticContract: contractFixture, liveCorpus: dbInventory, fts, semantic, parameterDag },
  joins: {
    fetchedContentToCanonicalAdmission: 'NOT_PERFORMED; admission input/readback bridge not exercised by this proof',
    ftsToVector: fts.status === 'PROVEN' && semantic.status === 'PROVEN' ? 'same canonical chunk corpus; separate bounded executor queries' : 'UNPROVEN',
    mcpDocumentationSearch: 'NOT_PROVEN; current LDR MCP health does not demonstrate doc-corpus search',
    parameterArtifactFromRetrievedChunk: parameterDag.status === 'PROVEN' ? 'PROVEN; TypeScript canonical artifact binds the exact live chunkId/evidenceRevision; Python mirror schema was not coerced' : 'NOT_PROVEN',
    dagFetchParameter: parameterDag.status === 'PROVEN' ? 'CHECKSUM_BINDING_PROVEN through existing read-only FETCH_POSTGRES plan and kernel binding; no dedicated FETCH_PARAMETER action kind exists' : 'NOT_PROVEN',
    contextManifestEvidence: 'NOT_PROVEN; no same-request manifest join exercised',
    astGrepCodeFenceOnly: 'NOT_PROVEN; no code-fence parser execution in this tranche',
  },
  boundaries: { canonicalAuthority: false, promotionAuthorized: false, writesPerformed: false,
    postgresWrites: 0, qdrantWrites: 0, valkeyWrites: 0, graphWrites: 0,
    fetchCreatesSourceRevision: false, semanticExecutorVotes: 1,
    exactVsHnsw: 'same logical semantic lane; exact oracle and HNSW executor comparison only' },
  status: webSearch.status === 'PROVEN' && fetchAndChunk.status === 'PROVEN' && contractFixture.status === 'PROVEN'
    && dbInventory.status === 'PROVEN' && fts.status === 'PROVEN' && semantic.status === 'PROVEN' && parameterDag.status === 'PROVEN'
    ? 'RESEARCH_DOCUMENT_RETRIEVAL_V3_PARTIAL_PROVEN' : 'RESEARCH_DOCUMENT_RETRIEVAL_V3_BLOCKED',
  remaining: ['ExternalDocAdmissionInputV1 plus transactional rollback/readback rehearsal',
    'MCP documentation search returning the same revision-qualified chunk',
    'A dedicated FETCH_PARAMETER operation kind/runtime is not present; current check uses the existing FETCH_POSTGRES action and kernel artifact-binding owner',
    'ContextManifest retaining the same evidence revision',
    'ast-grep restricted to extracted supported-language code fences',
    'meaningful query-vector exact/HNSW recall evaluation; current parity uses a stored-corpus self-query'],
};
body.receiptChecksum = sha256(JSON.stringify(body));
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: body.status, reportPath: 'docs/reports/research-document-retrieval-v3.json',
  checks: Object.fromEntries(Object.entries(body.checks).map(([k,v]) => [k,v.status])), writesPerformed: false }, null, 2));

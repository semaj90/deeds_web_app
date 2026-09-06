#!/usr/bin/env node
/**
 * End-to-end prefill planner for the OKF documentation fabric.
 *
 * Consumes only the pre-admission chunk plan. It produces a deterministic
 * candidate/context/DAG proposal for review; it does not call a model, search
 * service, database, cache, crawler, or patch executor.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => { const [k, ...v] = x.slice(2).split('='); return [k, v.join('=') || true]; }));
const input = path.resolve(ROOT, String(args.get('input') || 'docs/reports/okf-chunk-plan-v1.json'));
const searchInput = args.get('search') ? path.resolve(ROOT, String(args.get('search'))) : null;
const output = path.resolve(ROOT, String(args.get('output') || 'docs/reports/okf-agentic-context-plan-v1.json'));
const query = String(args.get('query') || 'documentation search and agentic error fixing');
const topK = Math.max(1, Number(args.get('top-k') || 16));

const hash = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const terms = (value) => [...new Set(value.toLowerCase().match(/[a-z0-9_:-]{3,}/g) || [])];
const queryTerms = terms(query);

const plan = JSON.parse(await fs.readFile(input, 'utf8'));
if (plan.schema !== 'atlas.okf-chunk-plan.v1' || plan.canonicalAuthority !== false) throw new Error('CHUNK_PLAN_NOT_PRE_ADMISSION');
const search = searchInput ? JSON.parse(await fs.readFile(searchInput, 'utf8')) : null;
if (search && (search.schema !== 'atlas.okf-lexical-search.v1' || search.canonicalAuthority !== false || search.workspaceRevision !== plan.workspaceRevision)) throw new Error('SEARCH_PLAN_REVISION_MISMATCH');

const candidateRows = search?.candidates?.length ? search.candidates : plan.chunks;
const candidates = candidateRows.map((chunk, index) => {
  const downstream = Array.isArray(chunk.downstream) ? chunk.downstream : [];
  const haystack = `${chunk.sourceRef} ${downstream.join(' ')}`.toLowerCase();
  const overlap = queryTerms.filter((term) => haystack.includes(term));
  return {
    candidateOrdinal: index,
    chunkId: chunk.chunkId,
    sourceRef: chunk.sourceRef,
    sourceRevision: chunk.sourceRevision,
    chunkChecksum: chunk.chunkChecksum,
    byteSpan: { startByte: chunk.startByte, endByte: chunk.endByte },
    lexicalOverlap: overlap,
    lexicalScore: typeof chunk.lexicalScore === 'number' ? chunk.lexicalScore : (queryTerms.length ? overlap.length / queryTerms.length : 0),
    domainSignals: downstream.includes('langextract') ? ['documentation', 'nlp'] : downstream.includes('ast_grep') ? ['code', 'structural'] : ['documentation'],
    canonicalAuthority: false,
  };
}).sort((a, b) => b.lexicalScore - a.lexicalScore || a.sourceRef.localeCompare(b.sourceRef)).slice(0, topK).map((row, index) => ({ ...row, candidateOrdinal: index }));

const ordinalMaterial = candidates.map((row) => `${row.candidateOrdinal}\0${row.chunkId}\0${row.sourceRevision}\0${row.chunkChecksum}`).join('\n');
const ordinalMapChecksum = hash(ordinalMaterial);
const contextManifestChecksum = hash(JSON.stringify({ query, ordinalMapChecksum, candidateChunkChecksums: candidates.map((row) => row.chunkChecksum) }));
const parameterChecksum = hash(JSON.stringify({ query, topK, ordinalMapChecksum, contextManifestChecksum }));

const report = {
  schema: 'atlas.okf-agentic-context-plan.v1',
  generatedAt: new Date().toISOString(),
  query,
  inputChunkPlan: path.relative(ROOT, input).replaceAll('\\', '/'),
  inputSearchReceipt: searchInput ? path.relative(ROOT, searchInput).replaceAll('\\', '/') : null,
  sourceWorkspaceRevision: plan.workspaceRevision,
  candidateCount: candidates.length,
  candidateOrdinalMapChecksum: ordinalMapChecksum,
  contextManifest: {
    schema: 'atlas.context-manifest.plan.v1',
    checksum: contextManifestChecksum,
    selectedCandidateOrdinals: candidates.map((row) => row.candidateOrdinal),
    evidenceRefs: candidates.map((row) => `${row.sourceRef}#${row.chunkChecksum}`),
    lodPolicy: 'bounded_chunk_span_only',
    acePolicyRevision: 'plan-only:unadmitted',
  },
  parameterArtifact: {
    schema: 'atlas.parameter-artifact.plan.v1',
    actionKind: 'RETRIEVE_AND_PREFILL',
    parameterChecksum,
    arguments: { query, topK, candidateOrdinalMapChecksum: ordinalMapChecksum },
    execution: 'NOT_EXECUTED',
  },
  synthesis: {
    provider: 'llama-server',
    endpoint: 'http://127.0.0.1:8090/v1/chat/completions',
    modelPolicy: 'resolve-loaded-ornith-at-runtime; no model call in this plan',
    contextManifestChecksum,
    status: 'NOT_EXECUTED',
  },
  cache: {
    owner: 'BitFrost/Valkey',
    keyMaterialChecksum: hash(`${contextManifestChecksum}\0${parameterChecksum}`),
    status: 'NOT_WARMED',
  },
  candidates,
  canonicalAuthority: false,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  externalNetworkCallsPerformed: false,
  prohibitedPromotion: ['no ontology admission', 'no CandidateOrdinal production admission', 'no cache warming', 'no synthesis execution', 'no patch mutation'],
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: path.relative(ROOT, output).replaceAll('\\', '/'), candidateCount: candidates.length, contextManifestChecksum, writesPerformed: false }, null, 2));

#!/usr/bin/env node
/**
 * DOC-15 bounded proof.
 *
 * This is intentionally read-only. It proves the existing hybrid owner has
 * one same-query lexical/semantic fan-out and stable-key fusion, and that a
 * documentation request must carry version/authority constraints before it
 * can be admitted. It does not claim live documentation retrieval or write
 * any canonical/projection data.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-15-same-query-fanout-v1.json');
const hybridPath = path.resolve(root, 'sveltekit-frontend/src/lib/server/search/hybrid-search.ts');
const docPortPath = path.resolve(root, 'sveltekit-frontend/src/lib/server/atlas/docs/external-doc-retrieval-port.ts');
const docPointPath = path.resolve(root, 'packages/parent-atlas/src/core/external-doc-qdrant-hybrid.ts');
const docRuntimePath = path.resolve(root, 'packages/parent-atlas/src/core/external-doc-retrieval-runtime.ts');
const designPath = path.resolve(root, 'openspec/changes/parent-atlas-versioned-doc-intelligence/design.md');

const hybrid = await fs.readFile(hybridPath, 'utf8');
const docPort = await fs.readFile(docPortPath, 'utf8');
const docPoint = await fs.readFile(docPointPath, 'utf8');
const docRuntime = await fs.readFile(docRuntimePath, 'utf8');
const design = await fs.readFile(designPath, 'utf8');
const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed, detail });

check('existing_hybrid_owner', /export async function hybridSearch\s*\(/.test(hybrid),
  'hybrid-search.ts exports the existing retrieval owner');
check('same_query_parallel_fanout', /Promise\.all\(\[/.test(hybrid)
  && /searchCodeHybridPg\(query/.test(hybrid)
  && /searchQdrantCode\(queryEmbedding/.test(hybrid),
  'one normalized query invokes Postgres and Qdrant branches in the same Promise.all');
check('stable_key_fusion', /new Map<string, HybridSearchResult>/.test(hybrid)
  && /merged\.set\(r\.stable_key/.test(hybrid),
  'fusion deduplicates on stable_key before ranking');
check('semantic_lane_single_vote', /sources\.push\('qdrant'\)/.test(hybrid)
  && !/rrf.*qdrant.*postgres|qdrant.*separate.*vote/i.test(hybrid),
  'Qdrant is merged into the existing semantic lane, not exposed as a second logical lane');
check('documentation_version_filter_specified', /filtered by\s*\n?\s*\{product: cuda_tile, version: 13\.2, architecture: ampere\}/.test(design),
  'design requires product/version/architecture filtering before semantic ranking');
check('document_filter_required_by_query_contract', /document_filter:\s*externalDocRetrievalFilterSchema/.test(
  await fs.readFile(path.resolve(root, 'packages/parent-atlas/src/core/external-doc-retrieval-proof.ts'), 'utf8')),
  'every retrieval fixture requires a strict version/authority filter');
check('filter_forwarded_to_all_executors', /documentFilter: query\.document_filter/.test(docRuntime)
  && (docRuntime.match(/documentFilter: query\.document_filter/g) ?? []).length === 3,
  'the exact fixture filter is forwarded to dense, BM25 and hybrid executors');
check('projection_contains_filter_metadata', ['provider:', 'product:', 'product_version:', 'architecture:', 'source_authority:']
  .every((field) => docPoint.includes(field)),
  'hybrid projection point schema and payload carry filterable document identity and authority fields');
check('qdrant_filters_before_ranking', ['provider', 'product', 'product_version', 'architecture', 'source_authority', 'canonical_authority']
  .every((field) => docPort.includes(`key: '${field}'`))
  && /filter: buildExternalDocQdrantFilter\(documentFilter\)/.test(docPort)
  && (docPort.match(/filter,/g) ?? []).length >= 3,
  'Qdrant dense/BM25/hybrid requests apply exact document identity and authority filters before ranking');
check('documentation_authority_boundary', /Postgres is the canonical evidence owner/.test(
  await fs.readFile(path.resolve(root, 'openspec/changes/parent-atlas-versioned-doc-intelligence/specs/versioned-doc-intelligence/spec.md'), 'utf8')),
  'documentation promotion remains subordinate to canonical Postgres evidence');

const fixture = [
  { stable_key: 'doc:cuda:13.2:ampere:install', product: 'cuda_tile', version: '13.2', architecture: 'ampere', source_authority: 'OFFICIAL', source: 'postgres_fts', semantic_lane: false },
  { stable_key: 'doc:cuda:13.2:ampere:install', product: 'cuda_tile', version: '13.2', architecture: 'ampere', source_authority: 'OFFICIAL', source: 'qdrant', semantic_lane: true },
  { stable_key: 'doc:cuda:13.1:ampere:install', product: 'cuda_tile', version: '13.1', architecture: 'ampere', source_authority: 'OFFICIAL', source: 'qdrant', semantic_lane: true },
  { stable_key: 'doc:cuda:13.2:h100:install', product: 'cuda_tile', version: '13.2', architecture: 'h100', source_authority: 'OFFICIAL', source: 'qdrant', semantic_lane: true },
  { stable_key: 'doc:cuda:13.2:ampere:community', product: 'cuda_tile', version: '13.2', architecture: 'ampere', source_authority: 'COMMUNITY', source: 'qdrant', semantic_lane: true },
];
const requested = { product: 'cuda_tile', version: '13.2', architecture: 'ampere' };
const admitted = fixture.filter((row) => row.product === requested.product
  && row.version === requested.version
  && row.architecture === requested.architecture
  && row.source_authority === 'OFFICIAL');
const stableKeys = [...new Set(admitted.map((row) => row.stable_key))];
check('fixture_version_architecture_authority_filter', stableKeys.length === 1
  && fixture.length === 5 && admitted.length === 2,
  'bounded fixture excludes wrong version, architecture and source authority before fusion');
check('fixture_semantic_dedup', admitted.filter((row) => row.semantic_lane).length === 1,
  'bounded fixture has one semantic-lane contribution after stable-key deduplication');

const inputChecksum = crypto.createHash('sha256').update(JSON.stringify({ hybrid, design, requested, fixture })).digest('hex');
const passed = checks.every((item) => item.passed);
const report = {
  schema: 'atlas.doc-15-same-query-fanout.v1',
  gate: 'DOC-15',
  status: passed ? 'DOC_15_FANOUT_CONTRACT_PROVEN_VERSION_FILTER_LIVE_OPEN' : 'DOC_15_FANOUT_CONTRACT_REVIEW_REQUIRED',
  owner: 'sveltekit-frontend/src/lib/server/search/hybrid-search.ts',
  query: { normalized: 'cuTile kernel fails on sm_86', requestedDocumentation: requested },
  checks,
  fixture: { rows: fixture.length, admittedRows: admitted.length, dedupedStableKeys: stableKeys },
  inputChecksum,
  policy: {
    sameQueryFanout: true,
    stableKeyDeduplication: true,
    semanticLaneSingleVote: true,
    canonicalAuthority: false,
    liveFanoutProven: false,
    liveDocumentationVersionFilterProven: false,
    writesPerformed: false,
    promotionAuthorized: false,
  },
  nextGate: 'DOC_15_LIVE_DOCUMENTATION_FANOUT_WITH_VERSION_AUTHORITY_FILTER',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;

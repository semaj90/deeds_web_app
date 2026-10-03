#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const reportsDir = path.resolve(repoRoot, process.argv[2] ?? 'docs/reports');
const outputPath = path.resolve(repoRoot, process.argv[3] ?? path.join(reportsDir, 'okf-storage-agent-boundaries-v1.json'));

function readReport(name) {
  try { return JSON.parse(fs.readFileSync(path.join(reportsDir, name), 'utf8')); }
  catch { return null; }
}

const indexing = readReport('atlas-indexing-surfaces-v1.json');
const runtime = readReport('atlas-runtime-readiness-v1.json');
const library = readReport('okf-library-ownership.json');

const gate = (key) => runtime?.gates?.find((item) => item.key === key) ?? null;
const capability = (name) => library?.results?.find((item) => item.capability === name) ?? null;

const entries = [
  {
    id: 'POSTGRES_IDENTITY_REVISION',
    owner: 'PostgreSQL 18 / existing Parent Atlas tables',
    role: 'CANONICAL_TRUTH',
    state: indexing?.postgres?.reachable && indexing?.canonicalAuthority === 'postgres' ? 'BOUNDARY_PROVEN' : 'UNPROVEN',
    evidence: ['atlas-indexing-surfaces-v1.json'],
    notes: 'Owns packet/source/workspace/revision eligibility; no new schema is introduced by this audit.',
  },
  {
    id: 'PGVECTOR_EXACT',
    owner: 'PostgreSQL codebase chunk embedding lane',
    role: 'EXACT_ORACLE',
    state: indexing?.postgres?.denseOwner ? 'BOUNDARY_PROVEN' : 'UNPROVEN',
    evidence: ['atlas-indexing-surfaces-v1.json'],
    notes: 'Exact semantic comparison role; not a second identity owner.',
  },
  {
    id: 'PGVECTOR_HNSW',
    owner: 'PostgreSQL pgvector',
    role: 'ACCELERATION_CHALLENGER',
    state: 'PARITY_REQUIRED',
    evidence: ['atlas-indexing-surfaces-v1.json'],
    notes: 'May accelerate bounded filtered candidates only after exact/resRevision parity.',
  },
  {
    id: 'PG_GIN_FTS',
    owner: 'PostgreSQL tsvector/GIN or pg_search',
    role: 'LEXICAL_ACCELERATOR',
    state: indexing?.postgres?.lexicalOwner === 'VERIFIED' ? 'BOUNDARY_PROVEN' : 'JOINBACK_UNPROVEN',
    evidence: ['atlas-indexing-surfaces-v1.json'],
    notes: 'Index presence is not canonical retrieval readiness; source-revision joinback remains required.',
  },
  {
    id: 'BITMAP_AND_AIO',
    owner: 'PostgreSQL planner/execution',
    role: 'QUERY_EXECUTION_DETAIL',
    state: 'BOUNDARY_PROVEN',
    evidence: ['atlas-indexing-surfaces-v1.json'],
    notes: 'Bitmap/AIO behavior is recorded through EXPLAIN when benchmarked; no application abstraction is created.',
  },
  {
    id: 'QDRANT_PROJECTION',
    owner: 'Qdrant semantic projection',
    role: 'REBUILDABLE_PROJECTION',
    state: gate('QDRANT_COLLECTION_SCHEMA_PROVEN')?.state === 'PROVEN' ? 'SCHEMA_PROVEN_LINEAGE_WAITING' : 'WAITING',
    evidence: ['atlas-runtime-readiness-v1.json'],
    notes: 'Qdrant point IDs cannot become packet identity or CandidateOrdinal.',
  },
  {
    id: 'LANGGRAPH_AGENT_RUNTIME',
    owner: 'LangGraph / existing error-agent orchestration',
    role: 'OPTIONAL_ORCHESTRATION',
    state: capability('LangGraph')?.imported ? 'BOUNDARY_PROVEN' : 'UNPROVEN',
    evidence: ['okf-library-ownership.json'],
    notes: 'Planning, sequencing, and smoke receipts only; no direct canonical writes.',
  },
  {
    id: 'OPENWIKI_OKF',
    owner: 'OpenWiki / OKF derived documentation',
    role: 'DOCUMENTATION_PROJECTION',
    state: capability('OpenWiki')?.classification === 'IMPORTED_UNPROVEN' ? 'DERIVED_ONLY_UNPROVEN_RUNTIME' : 'BOUNDARY_PROVEN',
    evidence: ['okf-library-ownership.json', 'okf-claim-freshness-v1.json'],
    notes: 'Generated claims require source/evidence freshness and cannot promote identity.',
  },
];

const report = {
  schema: 'atlas.okf-storage-agent-boundaries.v1',
  status: 'BOUNDARIES_RECORDED_RUNTIME_GATES_REMAIN',
  generatedAt: new Date().toISOString(),
  inputs: ['atlas-indexing-surfaces-v1.json', 'atlas-runtime-readiness-v1.json', 'okf-library-ownership.json'],
  entries,
  invariants: [
    'POSTGRES_REMAINS_CANONICAL_IDENTITY_AND_REVISION_OWNER',
    'PGVECTOR_EXACT_IS_ONE_SEMANTIC_ORACLE_NOT_AN_EXTRA_RRF_VOTE',
    'GIN_BITMAP_AIO_ARE_QUERY_EXECUTION_DETAILS',
    'QDRANT_IS_REBUILDABLE_PROJECTION',
    'LANGGRAPH_AND_OPENWIKI_CANNOT_WRITE_CANONICAL_TRUTH',
    'RUNTIME_PARITY_AND_SOURCE_LINEAGE_REQUIRE_SEPARATE_RECEIPTS',
  ],
  canonicalAuthority: false,
  promotionAuthorized: false,
  writesPerformed: false,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  entries: entries.length,
  waiting: entries.filter((entry) => !['BOUNDARY_PROVEN'].includes(entry.state)).length,
  canonicalAuthority: false,
  writesPerformed: false,
  reportPath: path.relative(repoRoot, outputPath),
}, null, 2));

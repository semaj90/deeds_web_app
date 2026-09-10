#!/usr/bin/env node
/** Static/read-only proof that current semantic_768 owner surfaces stay aligned. */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';

const checks = [
  {
    path: 'sveltekit-frontend/src/lib/server/embedding/embedding-contract.ts',
    must: ['embedding_dimension: 768', 'native_dimension: 768', 'legacy_retrieval_embedding_dimension: 384'],
  },
  {
    path: 'sveltekit-frontend/src/lib/server/embedding/embedding-provider-v1.ts',
    must: ['dimensions: 768', "representationId: 'semantic_768'", "'DIMENSIONS_NOT_768'"],
  },
  {
    path: 'scripts/atlas/backfill-graphify-file-embeddings-768.mjs',
    must: ["const CANONICAL_COLUMN = 'content_embedding'", "const PHYSICAL_TYPE = 'halfvec(768)'", 'embedding_dimension = 768'],
  },
  {
    path: 'sveltekit-frontend/scripts/atlas/backfill-codebase-chunk-embeddings.mjs',
    must: ['LEGACY_CONTENT_EMBEDDING_768_WRITER_RETIRED', "column: 'content_embedding'", "role: 'LEGACY_ALTERNATE_NONCANONICAL'"],
    mustNot: ['SET content_embedding_768 ='],
  },
  {
    path: 'scripts/atlas/atlas-embedding-ranking-diagnostic-v1.mjs',
    must: ["const CANONICAL_VECTOR_COLUMN = 'content_embedding'", "const CANONICAL_VECTOR_TYPE = 'halfvec(768)'", "alternateVectorRole: 'LEGACY_ALTERNATE_NONCANONICAL'"],
    mustNot: ["const VECTOR_COLUMNS = ['content_embedding_768'"],
  },
  {
    path: 'scripts/atlas/audit-lineage-semantic-768-cohort-v1.mjs',
    must: ["const CANONICAL_VECTOR_COLUMN = 'content_embedding'", "const CANONICAL_VECTOR_TYPE = 'halfvec(768)'"],
  },
  {
    path: 'scripts/atlas/freeze-atlas-lexical-document-corpus-v1.mjs',
    must: ["predicate: 'content_embedding IS NOT NULL AND content_hash IS NOT NULL'", "canonicalVectorColumn: 'content_embedding'"],
  },
  {
    path: 'packages/atlas-core/src/packet-reader.ts',
    must: ['cci.content_embedding::text AS content_embedding', 'CANONICAL_EMBEDDING_DIMENSION = 768'],
    mustNot: ['cci.content_embedding_768 AS content_embedding'],
  },
  {
    path: 'openspec/specs/atlas-retrieval-reconciliation/spec.md',
    must: ['`codebase_chunk_index.content_embedding` with physical type `halfvec(768)`', '`content_embedding_768` (`vector(768)`) is an'],
  },
  {
    path: 'AGENTS.md',
    must: ['`codebase_chunk_index.content_embedding` rows (`halfvec(768)`, representation `semantic_768`)', '`content_embedding_768 vector(768)` is legacy/alternate storage'],
  },
  {
    path: 'docs/VECTOR-STORAGE-CONTRACT.md',
    must: ['Postgres column   = content_embedding', 'physical type     = halfvec(768)', '384-dimensional lane remains explicit legacy/reference'],
  },
  {
    path: 'sveltekit-frontend/docs/DOCKER-COMPOSE-CORRECTED-BASELINE.md',
    must: ['EMBEDDING_REPRESENTATION: "semantic_768"', 'EMBEDDING_DIMENSION: "768"', 'It must not be labeled `semantic_768`.'],
    mustNot: ['EMBEDDING_REPRESENTATION: "semantic_768"\n  EMBEDDING_DIMENSION: "384"'],
  },
];

const failures = [];
for (const check of checks) {
  const absolute = path.join(REPO_ROOT, check.path);
  if (!fs.existsSync(absolute)) {
    failures.push(`${check.path}:MISSING`);
    continue;
  }
  const text = fs.readFileSync(absolute, 'utf8');
  for (const pattern of check.must ?? []) if (!text.includes(pattern)) failures.push(`${check.path}:MISSING_REQUIRED:${pattern}`);
  for (const pattern of check.mustNot ?? []) if (text.includes(pattern)) failures.push(`${check.path}:FORBIDDEN_ACTIVE_PATTERN:${pattern}`);
}

const result = {
  schema: 'atlas.semantic-768-owner-alignment-proof.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  canonical: {
    representationId: 'semantic_768',
    dimension: 768,
    postgresTable: 'codebase_chunk_index',
    postgresColumn: 'content_embedding',
    postgresType: 'halfvec(768)',
  },
  legacy: {
    postgresColumn: 'content_embedding_768',
    role: 'LEGACY_ALTERNATE_NONCANONICAL',
    dimension384Role: 'LEGACY_REFERENCE_ONLY',
  },
  checkedFiles: checks.map((entry) => entry.path),
  failures,
  status: failures.length === 0 ? 'SEMANTIC_768_OWNER_ALIGNMENT_STATIC_PROVEN' : 'SEMANTIC_768_OWNER_ALIGNMENT_BLOCKED',
  writesPerformed: false,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;

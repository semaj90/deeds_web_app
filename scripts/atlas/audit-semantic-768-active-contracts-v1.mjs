#!/usr/bin/env node
/**
 * Read-only semantic_768 contract drift audit.
 *
 * 384 may appear in explicitly named legacy/migration files, historical docs,
 * or tests that prove rejection. It must not appear as an admitted/default
 * EmbeddingGemma semantic lane in active retrieval/search/ingest contracts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';

const ACTIVE_FILES = [
  'sveltekit-frontend/src/lib/server/embedding/embedding-contract-768.ts',
  'sveltekit-frontend/src/lib/server/embedding/embedding-contract.ts',
  'sveltekit-frontend/src/lib/server/embedding/embedding-provider-v1.ts',
  'sveltekit-frontend/src/lib/server/vector/embeddinggemma-contracts.ts',
  'sveltekit-frontend/src/lib/server/vector/lane-registry.ts',
  'sveltekit-frontend/src/lib/server/vector/retrieval-semantics.ts',
  'sveltekit-frontend/src/lib/server/vector/vector-contracts.ts',
  'sveltekit-frontend/src/lib/server/ingest/ingest-packet-schema.ts',
  'sveltekit-frontend/src/lib/server/atlas/retrieval/qdrant-semantic-projection.ts',
  'sveltekit-frontend/src/lib/server/retrieval/search-lanes.ts',
];

const REQUIRED_768_PATTERNS = [
  ['sveltekit-frontend/src/lib/server/embedding/embedding-contract-768.ts', /SEMANTIC_DIMENSION\s*=\s*768/],
  ['sveltekit-frontend/src/lib/server/embedding/embedding-contract-768.ts', /codebase_chunks_768_v2/],
  ['sveltekit-frontend/src/lib/server/vector/lane-registry.ts', /collection:\s*'codebase_chunks_768_v2'/],
  ['sveltekit-frontend/src/lib/server/vector/lane-registry.ts', /dimension:\s*SEMANTIC_DIMENSION/],
  ['sveltekit-frontend/src/lib/server/ingest/ingest-packet-schema.ts', /768\/512\/256\/128/],
];

const FORBIDDEN_ACTIVE_PATTERNS = [
  { pattern: /\bMRL_384\b/, reason: '384 must not be declared as an EmbeddingGemma MRL width' },
  { pattern: /projectionVersion:\s*['"]mrl-384/i, reason: 'mrl-384 is not an admitted EmbeddingGemma projection' },
  { pattern: /supported_mrl_dimensions\s*:\s*\[[^\]]*384/i, reason: '384 must not appear in supported MRL widths' },
  { pattern: /(?<!legacy_)retrieval_embedding_dimension\s*:\s*384\b/, reason: 'active retrieval dimension must be 768' },
  { pattern: /(?<!legacy_retrieval_)embedding_dimension\s*:\s*384\b/, reason: 'active EmbeddingGemma dimension must be 768' },
];

const LEGACY_ALLOWED_FILES = new Set([
  'sveltekit-frontend/src/lib/server/vector/embeddinggemma-contracts.ts',
  'sveltekit-frontend/src/lib/server/vector/vector-contracts.ts',
]);

const observations = [];
const violations = [];

for (const relative of ACTIVE_FILES) {
  const absolute = path.resolve(REPO_ROOT, relative);
  if (!fs.existsSync(absolute)) {
    violations.push({ file: relative, code: 'ACTIVE_CONTRACT_FILE_MISSING' });
    continue;
  }
  const text = fs.readFileSync(absolute, 'utf8');
  observations.push({ file: relative, bytes: Buffer.byteLength(text, 'utf8') });

  for (const rule of FORBIDDEN_ACTIVE_PATTERNS) {
    if (LEGACY_ALLOWED_FILES.has(relative)) continue;
    if (rule.pattern.test(text)) {
      violations.push({ file: relative, code: 'ACTIVE_384_CONTRACT_REFERENCE', reason: rule.reason, pattern: String(rule.pattern) });
    }
  }
}

for (const [relative, pattern] of REQUIRED_768_PATTERNS) {
  const absolute = path.resolve(REPO_ROOT, relative);
  const text = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
  if (!pattern.test(text)) {
    violations.push({ file: relative, code: 'SEMANTIC_768_REQUIRED_CONTRACT_MISSING', pattern: String(pattern) });
  }
}

const report = {
  schema: 'atlas.semantic-768-active-contract-audit.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  canonical: {
    model: 'embeddinggemma:latest',
    representationId: 'semantic_768',
    dimension: 768,
    qdrantCollection: 'codebase_chunks_768_v2',
    qdrantVectorName: 'content',
    mrlReferenceDimensions: [512, 256, 128],
  },
  legacy384Policy: 'EXPLICIT_MIGRATION_REPLAY_ONLY',
  filesChecked: observations.length,
  violations,
  status: violations.length ? 'SEMANTIC_768_ACTIVE_CONTRACT_DRIFT' : 'SEMANTIC_768_ACTIVE_CONTRACTS_PROVEN',
  writesPerformed: false,
};

console.log(JSON.stringify(report, null, 2));
if (violations.length) process.exit(1);

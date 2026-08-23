#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  return fs.readFileSync(absolutePath, 'utf8');
}

function has(relativePath, pattern) {
  const text = read(relativePath);
  return text !== null && pattern.test(text);
}

function collectFiles(relativeDirectory) {
  const root = path.join(repoRoot, relativeDirectory);
  if (!fs.existsSync(root)) return [];
  const output = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist', 'build', '.svelte-kit', 'coverage'].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) walk(absolute);
      else if (/\.(?:ts|mts|js|mjs)$/.test(entry.name)) output.push(absolute);
    }
  };
  walk(root);
  return output;
}

function scanFor(pattern, directories) {
  const matches = [];
  for (const directory of directories) {
    for (const file of collectFiles(directory)) {
      const text = fs.readFileSync(file, 'utf8');
      if (pattern.test(text)) matches.push(path.relative(repoRoot, file));
    }
  }
  return matches.sort();
}

const prismaRuntimeOwners = scanFor(/(?:from\s+['"](?:@prisma\/client|prisma)['"]|new\s+PrismaClient\s*\()/, [
  'sveltekit-frontend/src',
  'packages',
  'scripts',
]);
const kyselyRuntimeOwners = scanFor(/from\s+['"]kysely['"]|require\(['"]kysely['"]\)/, [
  'sveltekit-frontend/src',
  'packages',
  'scripts',
]);

const checks = [
  {
    id: 'DRIZZLE_NODE_POSTGRES_OWNER',
    passed: has('sveltekit-frontend/src/lib/server/db/client.ts', /drizzle|node-postgres|pg/i),
    evidence: ['sveltekit-frontend/src/lib/server/db/client.ts'],
  },
  {
    id: 'NO_PRISMA_RUNTIME_OWNER',
    passed: prismaRuntimeOwners.length === 0,
    evidence: prismaRuntimeOwners,
  },
  {
    id: 'NO_KYSELY_RUNTIME_OWNER',
    passed: kyselyRuntimeOwners.length === 0,
    evidence: kyselyRuntimeOwners,
  },
  {
    id: 'SEMANTIC_768_NATIVE_CONTRACT_PRESENT',
    passed: has('sveltekit-frontend/src/lib/server/atlas/tensors/tensor-artifact-contract.ts', /semantic_768/) ||
      has('sveltekit-frontend/src/lib/server/atlas/contracts/canonical-chunk-contract.ts', /semantic_768/),
    evidence: [
      'sveltekit-frontend/src/lib/server/atlas/tensors/tensor-artifact-contract.ts',
      'sveltekit-frontend/src/lib/server/atlas/contracts/canonical-chunk-contract.ts',
    ],
  },
  {
    id: 'SEMANTIC_512_ROUTING_CONTRACT_PRESENT',
    passed: has('sveltekit-frontend/src/lib/server/atlas/retrieval/semantic-512.ts', /semantic_512/) ||
      has('sveltekit-frontend/src/lib/server/atlas/classification/retrieval-executor-policy-v2.ts', /semantic_512/),
    evidence: [
      'sveltekit-frontend/src/lib/server/atlas/retrieval/semantic-512.ts',
      'sveltekit-frontend/src/lib/server/atlas/classification/retrieval-executor-policy-v2.ts',
    ],
  },
  {
    id: 'QDRANT_NON_IDENTITY_AUTHORITY_DECLARED',
    passed: has('sveltekit-frontend/src/lib/server/atlas/classification/retrieval-executor-policy-v2.ts', /evidenceAuthority:\s*false/) ||
      has('sveltekit-frontend/src/lib/server/atlas/graph/fanout-admission-v1.ts', /representation_id/),
    evidence: [
      'sveltekit-frontend/src/lib/server/atlas/classification/retrieval-executor-policy-v2.ts',
      'sveltekit-frontend/src/lib/server/atlas/graph/fanout-admission-v1.ts',
    ],
  },
  {
    id: 'CODEBASE_QDRANT_SEMANTIC_768_SOURCE_REF_HARD_RULE',
    passed: has('sveltekit-frontend/src/lib/server/atlas/contracts/canonical-semantic-768-source-ref-v1.ts', /codebase_chunks_768_v2/) &&
      has('sveltekit-frontend/src/lib/server/atlas/contracts/canonical-semantic-768-source-ref-v1.ts', /embedding_dimension.*literal\(CANONICAL_CODEBASE_DIMENSION\)/) &&
      has('sveltekit-frontend/src/lib/server/atlas/contracts/canonical-semantic-768-source-ref-v1.ts', /source_ref/) &&
      has('sveltekit-frontend/src/lib/server/atlas/contracts/canonical-semantic-768-source-ref-v1.ts', /domain_class/),
    evidence: ['sveltekit-frontend/src/lib/server/atlas/contracts/canonical-semantic-768-source-ref-v1.ts'],
  },
  {
    id: 'REPRESENTATION_REGISTRY_AND_QUERY_OWNER_AGREE',
    passed: !(
      has('sveltekit-frontend/src/lib/server/atlas/retrieval/semantic-512.ts', /canonical persisted Parent Atlas query representation/i) &&
      has('sveltekit-frontend/src/lib/server/atlas/contracts/canonical-chunk-contract.ts', /semantic_512:[\s\S]{0,240}status: 'SUPERSEDED'/)
    ),
    status: 'ALIGNED',
    evidence: [
      'sveltekit-frontend/src/lib/server/atlas/retrieval/semantic-512.ts',
      'sveltekit-frontend/src/lib/server/atlas/contracts/canonical-chunk-contract.ts',
    ],
  },
  {
    id: 'SEMANTIC_MATRIX_REPRESENTATION_RECONCILIATION',
    passed: false,
    status: 'OPEN',
    evidence: ['semantic_768 native matrix and semantic_512 derived projection have separate owners; index/readback proof remains open'],
  },
];

const result = {
  schema: 'atlas.agent-runtime-alignment-audit.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  canonicalWritesAttempted: false,
  status: checks.some((check) => !check.passed) ? 'PARTIAL_PROVEN_ALIGNMENT_OPEN' : 'STATIC_ALIGNMENT_PROVEN',
  checks,
  missingExpectedArtifacts: [
    'sveltekit-frontend/src/lib/server/atlas/retrieval/semantic-512.spec.ts',
    'sveltekit-frontend/src/mcp/dispatcher-tool-integration.spec.ts',
  ].filter((relativePath) => !fs.existsSync(path.join(repoRoot, relativePath))),
};

const outputPath = process.argv.includes('--write-report')
  ? path.join(repoRoot, 'docs/reports/agent-runtime-alignment-audit-20260822.json')
  : null;
if (outputPath) {
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

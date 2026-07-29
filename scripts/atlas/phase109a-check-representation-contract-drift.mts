#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type DriftStatus =
  | 'STATICALLY_PROVEN'
  | 'RUNTIME_PROVEN'
  | 'RUNTIME_PROOF_PENDING'
  | 'ACTIVE_DEGRADED'
  | 'BLOCKED'
  | 'SUPERSEDED'
  | 'REFERENCE_ONLY';

type DriftIssueKind =
  | 'duplicate_dimension_constants'
  | 'unknown_representation_literals'
  | 'canonical_384_runtime_refs'
  | 'deployment_mapping_conflicts'
  | 'identity_contract_conflicts';

type DriftIssue = {
  kind: DriftIssueKind;
  status: DriftStatus;
  count: number;
  files: string[];
  details: string[];
};

type DriftReport = {
  schema_version: number;
  repo_root: string;
  scanned_files: number;
  canonical_owner: string;
  issues: DriftIssue[];
  summary: {
    duplicate_dimension_constants: boolean;
    unknown_representation_literals: boolean;
    canonical_384_runtime_refs: boolean;
    deployment_mapping_conflicts: boolean;
    identity_contract_conflicts: boolean;
  };
};

const REPO_ROOT = path.resolve(process.cwd());
const TARGET_DIRS = [
  'sveltekit-frontend/src/lib/server/atlas/contracts',
  'sveltekit-frontend/src/lib/server/vector',
  'sveltekit-frontend/src/lib/server/retrieval',
  'sveltekit-frontend/src/lib/server/search',
  'scripts/atlas',
];

const CANONICAL_REPRESENTATION_LITERALS = new Set([
  'semantic_768',
  'semantic_128',
  'latent_64',
  'lexical_v1',
  'learned_sparse_v1',
  'reranker_features_v1',
]);

const LEGACY_KNOWN_COMPAT = new Set([
  'semantic768',
  'dense_768',
  'dense768',
  'latent64',
  'semantic_384',
  'dense_384',
  'dense_384_custom',
]);

const REPRESENTATION_TOKEN_RE =
  /\b(?:semantic_768|semantic_128|semantic_384|semantic768|dense_768|dense768|dense_384|dense_384_custom|latent_64|latent64|lexical_v1|learned_sparse_v1|reranker_features_v1|embeddinggemma(?:-[a-z0-9_-]+)?)\b/gi;

const runtime384Patterns = [
  /codebase_chunks_384\b/,
  /codebase_chunks_384_hybrid\b/,
  /\bdense_384\b/,
  /\bdense_384_custom\b/,
  /\bsemantic_384\b/,
];

const identityConflictPatterns = [
  /export\s+const\s+CanonicalChunkIdentitySchema\b/,
  /export\s+const\s+CanonicalChunkSchema\b/,
];

async function walk(dir: string, acc: string[] = []): Promise<string[]> {
  const entries = await import('node:fs/promises').then((fs) => fs.readdir(dir, { withFileTypes: true }));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, acc);
    } else if (entry.isFile() && /\.(ts|tsx|mts|js|mjs|json)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  return text.match(global)?.length ?? 0;
}

async function main(): Promise<void> {
  const files = (
    await Promise.all(
      TARGET_DIRS.map(async (rel) => {
        const abs = path.join(REPO_ROOT, rel);
        try {
          return await walk(abs);
        } catch {
          return [];
        }
      }),
    )
  ).flat();

  const issues: DriftIssue[] = [];
  const dimensionFiles = new Map<string, string[]>();
  const unknownLiteralHits: Array<{ file: string; literal: string }> = [];
  const runtime384Hits: Array<{ file: string; literal: string }> = [];
  const deploymentConflicts: Array<{ file: string; detail: string }> = [];
  const identityConflicts: Array<{ file: string; detail: string }> = [];

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');

    for (const literal of [
      'CANONICAL_EMBEDDING_DIMENSION = 768',
      'dimension: 768',
      'DIMENSIONS: 768',
      'expectedDimension = 768',
      'vectorDimension = 768',
    ]) {
      if (text.includes(literal)) {
        const list = dimensionFiles.get(literal) ?? [];
        list.push(rel);
        dimensionFiles.set(literal, list);
      }
    }

    for (const match of text.matchAll(REPRESENTATION_TOKEN_RE)) {
      const literal = match[0];
      if (!CANONICAL_REPRESENTATION_LITERALS.has(literal) && !LEGACY_KNOWN_COMPAT.has(literal)) {
        unknownLiteralHits.push({ file: rel, literal });
      }
    }

    for (const pattern of runtime384Patterns) {
      const count = countMatches(text, pattern);
      if (count > 0) {
        runtime384Hits.push({ file: rel, literal: pattern.source });
      }
    }

    if (rel.includes('vector-config.ts') || rel.includes('vector-index-registry.ts') || rel.includes('collection-aliases.ts')) {
      if (
        text.includes('codebase_chunks_768_v2') &&
        (text.includes('codebase_chunks_384') || text.includes('codebase_chunks_384_hybrid'))
      ) {
        deploymentConflicts.push({ file: rel, detail: 'canonical v2 and 384 fallback both present in deployment registry' });
      }
    }

    if (rel.includes('canonical-chunk-contract.ts')) {
      for (const pattern of identityConflictPatterns) {
        if (pattern.test(text)) {
          identityConflicts.push({ file: rel, detail: `matched ${pattern.source}` });
        }
      }
    }
  }

  const dimensionConstantFamilies = Array.from(dimensionFiles.entries())
    .filter(([, rels]) => rels.length > 1)
    .map(([literal, rels]) => `${literal}: ${rels.join(', ')}`);

  if (dimensionConstantFamilies.length > 0) {
    const dimensionFilesFlattened = Array.from(
      new Set(
        Array.from(dimensionFiles.values()).flat().filter((file) => !file.endsWith('phase109a-check-representation-contract-drift.mts')),
      ),
    );
    issues.push({
      kind: 'duplicate_dimension_constants',
      status: 'ACTIVE_DEGRADED',
      count: dimensionConstantFamilies.length,
      files: dimensionFilesFlattened,
      details: dimensionConstantFamilies,
    });
  }

  if (unknownLiteralHits.length > 0) {
    issues.push({
      kind: 'unknown_representation_literals',
      status: 'BLOCKED',
      count: unknownLiteralHits.length,
      files: Array.from(new Set(unknownLiteralHits.map((hit) => hit.file))),
      details: unknownLiteralHits.map((hit) => `${hit.file}:${hit.literal}`),
    });
  }

  if (runtime384Hits.length > 0) {
    issues.push({
      kind: 'canonical_384_runtime_refs',
      status: 'REFERENCE_ONLY',
      count: runtime384Hits.length,
      files: Array.from(new Set(runtime384Hits.map((hit) => hit.file))),
      details: runtime384Hits.map((hit) => `${hit.file}:${hit.literal}`),
    });
  }

  if (deploymentConflicts.length > 0) {
    issues.push({
      kind: 'deployment_mapping_conflicts',
      status: 'ACTIVE_DEGRADED',
      count: deploymentConflicts.length,
      files: Array.from(new Set(deploymentConflicts.map((hit) => hit.file))),
      details: deploymentConflicts.map((hit) => `${hit.file}:${hit.detail}`),
    });
  }

  if (identityConflicts.length > 0) {
    issues.push({
      kind: 'identity_contract_conflicts',
      status: 'BLOCKED',
      count: identityConflicts.length,
      files: Array.from(new Set(identityConflicts.map((hit) => hit.file))),
      details: identityConflicts.map((hit) => `${hit.file}:${hit.detail}`),
    });
  }

  const report: DriftReport = {
    schema_version: 1,
    repo_root: REPO_ROOT.replace(/\\/g, '/'),
    scanned_files: files.length,
    canonical_owner: 'sveltekit-frontend/src/lib/server/atlas/contracts/canonical-chunk-contract.ts',
    issues,
    summary: {
      duplicate_dimension_constants: issues.some((issue) => issue.kind === 'duplicate_dimension_constants'),
      unknown_representation_literals: issues.some((issue) => issue.kind === 'unknown_representation_literals'),
      canonical_384_runtime_refs: issues.some((issue) => issue.kind === 'canonical_384_runtime_refs'),
      deployment_mapping_conflicts: issues.some((issue) => issue.kind === 'deployment_mapping_conflicts'),
      identity_contract_conflicts: issues.some((issue) => issue.kind === 'identity_contract_conflicts'),
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.summary.unknown_representation_literals || report.summary.identity_contract_conflicts) {
    process.exitCode = 1;
  }
}

await main();

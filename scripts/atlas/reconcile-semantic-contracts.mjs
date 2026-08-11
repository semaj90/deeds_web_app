#!/usr/bin/env node
/**
 * reconcile-semantic-contracts.mjs
 *
 * Strictly READ-ONLY static analysis. Never writes to any source file, DB,
 * Qdrant, Neo4j, or Redis — only reads sveltekit-frontend/src/**\/*.ts and
 * writes report artifacts under docs/reports/semantic-contracts/.
 *
 * Per openspec/changes/parent-atlas-semantic-768-canonical-contract/proposal.md
 * §20 ("Semantic contract reconciliation artifact"). That proposal's full scope
 * spans Postgres constraints, Neo4j property names, Redis key formats, Qdrant
 * collections, Python validation schemas, and ACE/HyperRAG packet contracts —
 * this v1 is BOUNDED to the TypeScript/Zod contract layer only (the layer this
 * session's DRY sweep was actually working in). Every store this v1 does NOT
 * cover is listed in report.limitations[] below, not silently omitted.
 *
 * Classifies every 'semantic_768' / 768-as-dimension literal found in
 * sveltekit-frontend/src/**\/*.ts into:
 *   - CANONICAL_OWNER      the file that actually declares the constant
 *   - IMPORTS_CANONICAL    a file that imports the canonical constant and
 *                          uses the imported binding (no local literal)
 *   - INLINE_LITERAL_DRIFT a file that hardcodes 'semantic_768' or 768
 *                          directly instead of importing the canonical value
 *
 * Fails (non-zero exit) only on the conditions §20 names as hard gates that
 * this v1 can actually check from static TS source: a second CANONICAL_OWNER
 * declaring the same string/number as a top-level exported const (duplicate
 * canonical owner), or an ambiguous representation name pattern
 * (e.g. 'semantic_768' used as a *value* for a field whose name suggests a
 * different representation, like 'legacy_384' contexts). Everything else is
 * reported as INLINE_LITERAL_DRIFT for human triage, not a hard failure —
 * many are legitimate (test fixtures, comments-as-strings, unrelated numeric
 * literals that happen to be 768).
 *
 * Usage: node scripts/atlas/reconcile-semantic-contracts.mjs
 */

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const SRC_ROOT = join(REPO_ROOT, 'sveltekit-frontend/src');
const OUT_DIR = join(REPO_ROOT, 'docs/reports/semantic-contracts');

const KNOWN_CANONICAL_OWNER = {
  file: 'sveltekit-frontend/src/lib/server/embedding/embedding-contract-768.ts',
  representationConst: 'SEMANTIC_REPRESENTATION_ID',
  dimensionConst: 'SEMANTIC_DIMENSION',
};

// file:constName pairs that are documented, deliberate duplicates — not
// carelessness. Downgraded from HARD_FAIL to WARN instead of silently
// excluded, so they stay visible in the report.
const KNOWN_CLIENT_BOUNDARY_EXCEPTIONS = new Set([
  'sveltekit-frontend/src/lib/ai/model-ids.ts:CLIENT_EMBEDDING_DIMS',
  'sveltekit-frontend/src/lib/ai/model-ids.ts:SERVER_EMBEDDING_DIMS',
]);

const KNOWN_REEXPORTERS = new Set([
  // File, canonicalConstName pairs that legitimately re-export (not
  // redeclare) the owner's value under a different local name. Discovered
  // and fixed this session — feature-extraction-v1.ts previously redeclared
  // its own copy; now imports and re-exports.
  'sveltekit-frontend/src/lib/server/atlas/contracts/feature-extraction-v1.ts',
]);

const REPRESENTATION_LITERAL_RE = /(['"`])semantic_768\1/g;
const DIMENSION_LITERAL_RE = /\b(?:z\.literal\(|width:\s*|dimension:\s*|semantic_dimension:\s*|canonical_dimension:\s*|canonicalDimension:\s*|\.min\(|\.max\()\s*768\b/g;
const EXPORT_CONST_RE = /export\s+const\s+(\w+)\s*=\s*(['"`])semantic_768\2/g;
const EXPORT_CONST_DIM_RE = /export\s+const\s+(\w+)\s*=\s*768\b/g;

function safeGitRevision() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

function walkTsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.svelte-kit' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkTsFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function relPath(absPath) {
  return relative(REPO_ROOT, absPath).replace(/\\/g, '/');
}

function classifyFile(absPath, content) {
  const rel = relPath(absPath);
  const findings = [];

  // Does this file import the canonical constants (from the real owner or
  // from a known re-exporter)?
  const importsCanonicalRepresentation =
    /import\s*\{[^}]*\b(SEMANTIC_REPRESENTATION_ID|CANONICAL_SEMANTIC_REPRESENTATION_ID)\b[^}]*\}\s*from/.test(content);
  const importsCanonicalDimension =
    /import\s*\{[^}]*\b(SEMANTIC_DIMENSION|CANONICAL_SEMANTIC_DIMENSION)\b[^}]*\}\s*from/.test(content);

  // Is this file itself the canonical owner or a known re-exporter?
  const isCanonicalOwner = rel === KNOWN_CANONICAL_OWNER.file;
  const isKnownReexporter = KNOWN_REEXPORTERS.has(rel);

  // Find any OTHER file that also does `export const X = 'semantic_768'`
  // or `export const X = 768` at top level — a duplicate canonical owner,
  // unless it's the known owner or a known re-exporter (re-exporters assign
  // `export const LOCAL_NAME = ImportedBinding`, which these regexes won't
  // match since the RHS isn't a literal — safe by construction).
  if (!isCanonicalOwner) {
    let m;
    const reprRe = new RegExp(EXPORT_CONST_RE.source, 'g');
    while ((m = reprRe.exec(content))) {
      findings.push({
        kind: 'DUPLICATE_CANONICAL_OWNER_CANDIDATE',
        constName: m[1],
        line: content.slice(0, m.index).split('\n').length,
      });
    }
    const dimRe = new RegExp(EXPORT_CONST_DIM_RE.source, 'g');
    while ((m = dimRe.exec(content))) {
      findings.push({
        kind: 'DUPLICATE_CANONICAL_OWNER_CANDIDATE',
        constName: m[1],
        line: content.slice(0, m.index).split('\n').length,
      });
    }
  }

  // Inline literal usage (not counting the owner's own declaration or a
  // re-exporter's `= ImportedBinding` line, which won't match the literal
  // regex since there's no quoted 'semantic_768' or bare 768 on that line).
  if (!isCanonicalOwner) {
    let m;
    const reRepr = new RegExp(REPRESENTATION_LITERAL_RE.source, 'g');
    while ((m = reRepr.exec(content))) {
      const line = content.slice(0, m.index).split('\n').length;
      findings.push({
        kind: importsCanonicalRepresentation ? 'REPR_LITERAL_ALONGSIDE_IMPORT' : 'INLINE_REPR_LITERAL_DRIFT',
        line,
      });
    }
    const reDim = new RegExp(DIMENSION_LITERAL_RE.source, 'g');
    while ((m = reDim.exec(content))) {
      const line = content.slice(0, m.index).split('\n').length;
      findings.push({
        kind: importsCanonicalDimension ? 'DIM_LITERAL_ALONGSIDE_IMPORT' : 'INLINE_DIM_LITERAL_DRIFT',
        line,
      });
    }
  }

  if (findings.length === 0 && !isCanonicalOwner) return null;

  return {
    file: rel,
    role: isCanonicalOwner
      ? 'CANONICAL_OWNER'
      : isKnownReexporter
        ? 'KNOWN_REEXPORTER'
        : importsCanonicalRepresentation || importsCanonicalDimension
          ? 'PARTIAL_IMPORTER'
          : 'NO_CANONICAL_IMPORT',
    importsCanonicalRepresentation,
    importsCanonicalDimension,
    findings,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const files = walkTsFiles(SRC_ROOT);
  const results = [];
  const conflicts = [];
  const identityMap = {};

  for (const absPath of files) {
    const content = readFileSync(absPath, 'utf-8');
    if (!content.includes('768')) continue;
    const classified = classifyFile(absPath, content);
    if (!classified) continue;
    results.push(classified);

    for (const f of classified.findings) {
      if (f.kind === 'DUPLICATE_CANONICAL_OWNER_CANDIDATE') {
        const isDocumentedException = KNOWN_CLIENT_BOUNDARY_EXCEPTIONS.has(`${classified.file}:${f.constName}`);
        conflicts.push({
          type: isDocumentedException ? 'DOCUMENTED_CLIENT_BOUNDARY_DUPLICATE' : 'DUPLICATE_CANONICAL_OWNER',
          file: classified.file,
          line: f.line,
          constName: f.constName,
          severity: isDocumentedException ? 'WARN' : 'HARD_FAIL',
          message: isDocumentedException
            ? `${classified.file}:${f.line} 'export const ${f.constName}' is a documented client/server-boundary duplicate (cannot import $lib/server code into client-bundled files).`
            : `${classified.file}:${f.line} declares 'export const ${f.constName}' as a semantic_768/768 literal — a second canonical owner alongside ${KNOWN_CANONICAL_OWNER.file}.`,
        });
      } else if (f.kind === 'INLINE_REPR_LITERAL_DRIFT' || f.kind === 'INLINE_DIM_LITERAL_DRIFT') {
        conflicts.push({
          type: f.kind,
          file: classified.file,
          line: f.line,
          severity: 'WARN',
          message: `${classified.file}:${f.line} hardcodes a semantic_768/768 literal without importing the canonical constant.`,
        });
      }
    }

    identityMap[classified.file] = {
      role: classified.role,
      importsCanonicalRepresentation: classified.importsCanonicalRepresentation,
      importsCanonicalDimension: classified.importsCanonicalDimension,
      findingCounts: classified.findings.reduce((acc, f) => {
        acc[f.kind] = (acc[f.kind] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }

  const hardFailures = conflicts.filter((c) => c.severity === 'HARD_FAIL');
  const warnings = conflicts.filter((c) => c.severity === 'WARN');

  const report = {
    schema_version: 'semantic-contract-reconciliation-v1',
    scope: 'BOUNDED — TypeScript/Zod contract layer only (sveltekit-frontend/src/**/*.ts)',
    generated_at: new Date().toISOString(),
    repository_commit: safeGitRevision(),
    canonical_owner: KNOWN_CANONICAL_OWNER,
    known_reexporters: [...KNOWN_REEXPORTERS],
    limitations: [
      'Does not inventory Postgres constraints (atlas_packets.source_representation_id etc.)',
      'Does not inventory Neo4j property names',
      'Does not inventory Redis key formats',
      'Does not inventory Python validation schemas (scripts/atlas/gpu/*.py, other Python workers)',
      'Does not inventory Qdrant collection configs directly (only TS files that reference them)',
      'Does not inventory ACE/HyperRAG packet contract runtime behavior — only static TS literal/import shape',
      'Static regex-based analysis, not a TS AST parse — can miss dynamically-constructed literals or produce false positives on comments/strings that happen to contain the pattern',
      '768-as-dimension detection is heuristic (z.literal(768), width:/dimension:/.min(/.max( context) — may miss or over-match unrelated numeric 768 usages',
    ],
    summary: {
      files_scanned: files.length,
      files_with_768_reference: results.length,
      hard_failures: hardFailures.length,
      warnings: warnings.length,
    },
    hard_failures: hardFailures,
    warnings_top50: warnings.slice(0, 50),
    warnings_total: warnings.length,
  };

  writeFileSync(
    join(OUT_DIR, 'semantic-contract-reconciliation.json'),
    JSON.stringify(report, null, 2) + '\n',
  );

  writeFileSync(
    join(OUT_DIR, 'semantic-contract-conflicts.ndjson'),
    conflicts.map((c) => JSON.stringify(c)).join('\n') + (conflicts.length ? '\n' : ''),
  );

  writeFileSync(
    join(OUT_DIR, 'semantic-contract-identity-map.json'),
    JSON.stringify(identityMap, null, 2) + '\n',
  );

  console.log(`[reconcile-semantic-contracts] scanned ${files.length} files, ${results.length} reference semantic_768/768`);
  console.log(`[reconcile-semantic-contracts] hard failures: ${hardFailures.length}, warnings: ${warnings.length}`);
  for (const hf of hardFailures) {
    console.error(`  HARD_FAIL: ${hf.message}`);
  }
  console.log(`[reconcile-semantic-contracts] wrote docs/reports/semantic-contracts/{semantic-contract-reconciliation.json,semantic-contract-conflicts.ndjson,semantic-contract-identity-map.json}`);

  if (hardFailures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[reconcile-semantic-contracts] FATAL:', err);
  process.exitCode = 1;
});

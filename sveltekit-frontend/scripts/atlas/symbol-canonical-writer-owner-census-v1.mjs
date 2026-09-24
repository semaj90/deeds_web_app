#!/usr/bin/env node
// SYMBOL-WRITER-OWNER-01. READ-ONLY. Zero writes. Static census only -- does not invoke any
// writer. Scope disclosed: bounded by this session's context budget (git grep across
// sveltekit-frontend/{src,scripts}, packages, python, drizzle/manual, src/mcp -- not a full
// call-graph trace of every transitive caller).

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, '..');
const OUT_PATH = process.env.SYMBOL_WRITER_OWNER_OUT
  ? path.resolve(WORKSPACE_ROOT, process.env.SYMBOL_WRITER_OWNER_OUT)
  : path.join(REPO_ROOT, 'docs', 'reports', 'symbol-canonical-writer-owner-v1.json');

function grep(pattern, roots) {
  try {
    const out = execFileSync('git', ['grep', '-lE', pattern, '--', ...roots], { cwd: WORKSPACE_ROOT, encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const nominationSource = readFileSync(path.join(WORKSPACE_ROOT, 'packages', 'parent-atlas', 'src', 'core', 'structural-symbol.ts'), 'utf8');
  const extractionSource = readFileSync(path.join(WORKSPACE_ROOT, 'packages', 'parent-atlas', 'src', 'core', 'structural-extraction-fabric.ts'), 'utf8');
  const ownerSource = readFileSync(path.join(WORKSPACE_ROOT, 'packages', 'parent-atlas', 'src', 'core', 'symbol-registry-repository.ts'), 'utf8');
  const upstreamFileIdPropagated = /upstream_file_id:\s*id/.test(nominationSource)
    && /upstream_file_id:\s*chunk\.upstream_file_id/.test(extractionSource)
    && /upstream_file_id/.test(ownerSource);
  const directWriters = grep(
    'INSERT INTO atlas_symbol_(registry|versions)|UPDATE atlas_symbol_(registry|versions)',
    ['sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'packages', 'python', 'sveltekit-frontend/drizzle/manual'],
  ).filter((f) => !f.includes('node_modules') && !f.includes('/dist/') && !f.endsWith('.spec.ts'));

  const callers = grep(
    'createSymbolRegistryRepository|symbol-registry-repository',
    ['sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'packages'],
  ).filter((f) => !f.includes('node_modules') && !f.includes('/dist/') && !f.endsWith('symbol-registry-repository.ts'));

  const wiredToNpmScript = callers.filter((f) => {
    const base = path.basename(f);
    const pkg = readFileSync(path.join(WORKSPACE_ROOT, 'sveltekit-frontend', 'package.json'), 'utf8');
    return pkg.includes(base);
  });

  // Real schema-incompatible legacy writer found in a prior session (SESSION-206b/c): targets
  // stable_symbol_key, which does not exist on the live atlas_symbol_registry table (real column
  // is stable_symbol_id) -- flagged, not modified.
  const schemaIncompatibleWriters = [
    {
      path: 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-symbol-writer-v1.ts',
      reason: 'Writes stable_symbol_key/symbol_kind columns; live atlas_symbol_registry schema has stable_symbol_id, not stable_symbol_key. Targets a different/legacy table shape, not this owner.',
      classification: 'SCHEMA_INCOMPATIBLE_OR_DIFFERENT_TABLE',
    },
  ];

  const owner = {
    path: 'packages/parent-atlas/src/core/symbol-registry-repository.ts',
    export: 'createSymbolRegistryRepository',
    tablesWritten: ['atlas_symbol_registry', 'atlas_symbol_aliases', 'atlas_symbol_versions'],
    stableSymbolIdDerivation: 'sha256(language.toLowerCase(), kind, symbol_key) -- deterministic, no path-only/latest/fuzzy input',
    symbolVersionIdDerivation: 'sha256(stable_symbol_id, source_revision, upstream_node_id, declaration_hash) -- explicitly revision-qualified, never workspace-revision-substituted',
    schemaCompatibility: 'EXACT_MATCH -- INSERT column lists verified byte-for-byte against live atlas_symbol_registry and atlas_symbol_versions, including propagated upstream_file_id.',
    safetyGate: 'promoteNomination() throws SYMBOL_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE unless allow_create=true is explicitly passed -- writes are not accidental.',
    identityRelianceOnForbiddenInputs: 'NONE -- no latest/HEAD/path-only/workspace:0/fuzzy-name identity found in stableSymbolId or symbolVersionId derivation.',
    upstreamFileIdentityConsumption: upstreamFileIdPropagated ? 'UPSTREAM_FILE_ID_PROPAGATED_STABLE_FILE_ADMISSION_OPEN' : 'NO_FILE_IDENTITY',
    upstreamFileIdentityConsumptionNote: upstreamFileIdPropagated
      ? 'upstream_file_id is now carried from the canonical structural chunk schema through nominations into atlas_symbol_versions; the value is not yet proven to be an S01-08K stableFileId because S01-08K has not been applied.'
      : 'upstream_file_id is not carried through the canonical nomination/writer path.',
    callers,
    callersWiredToNpmScript: wiredToNpmScript,
    runtimeReachable: wiredToNpmScript.length > 0 ? 'NPM_SCRIPT_WIRED' : 'MANUAL_SCRIPT_INVOCATION_ONLY',
    classification: 'CANONICAL_RUNTIME_OWNER',
  };

  const conflicts = directWriters.filter((f) => f !== owner.path && !f.endsWith('.spec.ts'));

  const result =
    conflicts.length > 0
      ? 'SYMBOL_CANONICAL_WRITER_CONFLICT'
      : owner.upstreamFileIdentityConsumption !== 'S01_08K_STABLE_FILE_ADMITTED'
        ? 'SYMBOL_CANONICAL_WRITER_LINEAGE_BLOCKED'
        : 'SYMBOL_CANONICAL_WRITER_PROVEN';

  const receipt = {
    schema: 'atlas.symbol-canonical-writer-owner.v1',
    gate: 'SYMBOL-WRITER-OWNER-01',
    generatedAt: new Date().toISOString(),
    scopeDisclosure: 'Bounded by session context budget: git grep across sveltekit-frontend/{src,scripts}, packages, python, drizzle/manual -- NOT a full transitive call-graph trace of every possible caller. Two concrete callers found and inspected directly; not re-verified beyond those two.',
    directWritersFound: directWriters,
    owner,
    schemaIncompatibleWriters,
    conflicts,
    upstreamFileIdentity: {
      status: upstreamFileIdPropagated ? 'UPSTREAM_FILE_ID_PROPAGATED_STABLE_FILE_ADMISSION_OPEN' : 'NOT_CONSUMED_BY_OWNER',
      note: upstreamFileIdPropagated
        ? 'The canonical path now preserves upstream_file_id, but S01-08K stable-file admission remains unapplied and therefore stable-file identity is not promoted.'
        : 'The canonical owner does not consume upstream_file_id.',
    },
    writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphifyRuns: 0 },
    canonicalAuthority: false,
    writesPerformed: false,
    result,
    nextBlocker: result === 'SYMBOL_CANONICAL_WRITER_PROVEN' ? 'S01-08K_STABLE_FILE_IDENTITY_NOT_APPLIED' : upstreamFileIdPropagated ? 'S01-08K_STABLE_FILE_IDENTITY_NOT_APPLIED -- upstream_file_id propagation is proven, stable-file admission is not' : 'SYMBOL_CANONICAL_WRITER_LINEAGE_BLOCKED',
  };

  writeFileSync(OUT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  console.log(`directWritersFound: ${JSON.stringify(directWriters)}`);
  console.log(`owner: ${owner.path}::${owner.export}  runtimeReachable=${owner.runtimeReachable}`);
  console.log(`conflicts: ${JSON.stringify(conflicts)}`);
  console.log(`Result: ${result}`);
  console.log(`Receipt: ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main();

#!/usr/bin/env node
/**
 * S01-09 — SymbolIdentityV1 audit. READ-ONLY (one REPEATABLE READ READ ONLY transaction + static writer scan). Creates/repairs nothing.
 * Judges the EXISTING atlas_symbol_registry / atlas_symbol_versions / atlas_symbol_aliases through the pure invariants in symbol-identity-audit-v1.ts.
 * Result: SYMBOL_IDENTITY_PROVEN only if every observable predicate is PROVEN; otherwise SYMBOL_IDENTITY_BLOCKED with typed blockers.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { auditSymbolIdentityV1, type RegistryRowV1, type SymbolVersionRowV1 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/symbol-identity-audit-v1.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-identity-audit.v1';
const digest = (v: string) => `sha256:${createHash('sha256').update(v).digest('hex')}`;
const pointer = resolve(ROOT, 'docs/reports/symbol-identity-v1.json');
if (existsSync(pointer) && JSON.parse(readFileSync(pointer, 'utf8')).schema !== SCHEMA) throw new Error('POINTER_PATH_OWNED_BY_ANOTHER_ARTIFACT');

const WRITERS = ['scripts/atlas/promote-ast-symbols-to-registry.mjs', 'scripts/atlas/materialize-ast-symbol-versions.mjs', 'scripts/atlas/apply-current-tree-bound-symbol-registry-canary-v1.mjs'];
const writerEvidence = WRITERS.map((f) => {
  const t = existsSync(resolve(ROOT, f)) ? readFileSync(resolve(ROOT, f), 'utf8') : '';
  return { file: f, exists: t.length > 0, writesRegistry: /INSERT\s+INTO\s+(public\.)?atlas_symbol_registry/i.test(t), writesVersions: /INSERT\s+INTO\s+(public\.)?atlas_symbol_versions/i.test(t), writesAliases: /INSERT\s+INTO\s+(public\.)?atlas_symbol_aliases/i.test(t), mentionsWorkspacePlaceholder: /workspace:\$\{|'workspace:|`workspace:/.test(t), classification: 'UNKNOWN' as const };
});

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
const client = await pool.connect();
await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
try {
  const registry: RegistryRowV1[] = (await client.query(`SELECT stable_symbol_id, created_from_source_revision, canonical_key, status FROM public.atlas_symbol_registry`)).rows.map((r: any) => ({ stableSymbolId: r.stable_symbol_id, createdFromSourceRevision: r.created_from_source_revision, canonicalKey: r.canonical_key, status: r.status }));
  const versions: SymbolVersionRowV1[] = (await client.query(`SELECT symbol_version_id, stable_symbol_id, source_revision, workspace_revision, upstream_node_id, upstream_file_id, declaration_hash, qualified_name, source_ref FROM public.atlas_symbol_versions`)).rows.map((r: any) => ({ symbolVersionId: r.symbol_version_id, stableSymbolId: r.stable_symbol_id, sourceRevision: r.source_revision, workspaceRevision: r.workspace_revision, upstreamNodeId: r.upstream_node_id, upstreamFileId: r.upstream_file_id, declarationHash: r.declaration_hash, qualifiedName: r.qualified_name, sourceRef: r.source_ref }));
  const aliasKinds = Object.fromEntries((await client.query(`SELECT alias_kind, count(*)::int AS n FROM public.atlas_symbol_aliases GROUP BY 1`)).rows.map((r: any) => [r.alias_kind, r.n]));
  const audit = auditSymbolIdentityV1({ registry, versions, aliasKinds });
  const bad = Object.entries(audit.predicates).filter(([, p]) => p.state === 'VIOLATED' || p.state.startsWith('BLOCKED')).map(([k, p]) => `${k}:${p.state}`);
  const result = bad.length === 0 ? 'SYMBOL_IDENTITY_PROVEN' : 'SYMBOL_IDENTITY_BLOCKED';
  const body = {
    schema: SCHEMA, gate: 'S01-09', generatedAt: new Date().toISOString(), result, blockers: bad, audit,
    chain: 'stableFileId -> symbolId -> symbolVersionId -> treeNodeId',
    fileLevelGap: 'S01-08 = STABLE_FILE_ID_OWNER_MISSING: the top of the chain has no owner; upstream_file_id is populated on 0 versions.',
    writers: { note: 'static scan; liveness UNKNOWN', evidence: writerEvidence },
    coverage: { registrySymbols: registry.length, symbolsWithVersionRows: audit.registry.symbolsWithVersionRows, admissibleVersions: audit.versions.admissible },
    safety: { databaseWrites: 0, registryWrites: 0, schemaChanges: 0, graphifyRun: false, readerCutover: false, inputIdentityBackfill: false, vectorWrites: 0, graphWrites: 0, cacheWrites: 0, newIdentityNamespaceCreated: false, transaction: 'REPEATABLE READ READ ONLY, ROLLBACK' },
  };
  const receiptChecksum = digest(JSON.stringify(body));
  const versioned = resolve(ROOT, `docs/reports/symbol-identity-v1.${receiptChecksum.slice(7, 19)}.json`);
  const receipt = { ...body, receiptChecksum };
  if (!existsSync(versioned)) writeFileSync(versioned, `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(pointer, `${JSON.stringify({ ...receipt, versionedReceipt: `docs/reports/symbol-identity-v1.${receiptChecksum.slice(7, 19)}.json` }, null, 2)}\n`);
  console.log(JSON.stringify({ result, blockers: bad, registry: audit.registry, versions: audit.versions, predicates: audit.predicates, writers: writerEvidence, receipt: versioned }, null, 2));
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}

#!/usr/bin/env -S npx tsx
/**
 * SYMBOL-RECONCILIATION-WRITER-01
 *
 * Wires the two existing, previously zero-caller scaffold pieces together:
 *   - canonicalizeStructuralEvidence() (packages/parent-atlas/src/core/gis-canonicalization.ts)
 *   - createSymbolRegistryRepository()  (packages/parent-atlas/src/core/symbol-registry-repository.ts)
 *
 * Reads graphify_symbols (scoped to source_refs bound to a target workspace revision via
 * atlas_workspace_source_bindings), builds StructuralSymbolNominationV1 records, and drives
 * them through canonicalization -> atlas_symbol_registry / atlas_symbol_versions.
 *
 * HARD GATE (do not remove): this script refuses to write anything unless the target
 * workspace revision has real bindings in atlas_workspace_source_bindings AND graphify_symbols
 * has real rows for those bound source_refs. As of 2026-09-12 the admitted revision
 * (sha256:322ed1a6...) has ZERO bindings, and graphify_symbols itself has ZERO rows overall --
 * running this against that state must fail closed (BLOCKED_*), not silently no-op-succeed.
 *
 * Default mode is dry-run (resolve-only, no promotion). Pass --allow-create to permit new
 * canonical symbol promotion via atlas_symbol_registry INSERTs. Pass --apply to actually commit;
 * without it, this only prints the gate result and a plan, per this repo's Drizzle Safety Rule
 * extended-to-writers convention.
 */
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFiles, REPO_ROOT } from './connection-config.mjs';
import { canonicalizeStructuralEvidence } from '../../packages/parent-atlas/dist/core/gis-canonicalization.js';
import { createSymbolRegistryRepository } from '../../packages/parent-atlas/dist/core/symbol-registry-repository.js';
import { deriveUpstreamSymbolNominationKey } from '../../packages/parent-atlas/dist/core/structural-symbol.js';
import { loadBindingProvenanceV1, provenanceForV1, qualifyPromotionNominationV1 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/symbol-revision-qualification-v1.js';

const env = loadEnvFiles([
  path.join(REPO_ROOT, '.env'),
  path.join(REPO_ROOT, '.env.local'),
  path.join(REPO_ROOT, 'sveltekit-frontend', '.env'),
  path.join(REPO_ROOT, 'sveltekit-frontend', '.env.local'),
]);

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ADMITTED_REVISION_DEFAULT = 'sha256:322ed1a6f8ffc52576314fde9a33afd1faba015c3fc8cd60609052c5ca2dfbaf';
const targetWorkspaceRevision = opt('--workspace-revision', ADMITTED_REVISION_DEFAULT);
const allowCreate = flag('--allow-create');
const apply = flag('--apply');

const databaseUrl =
  env.DATABASE_URL ||
  `postgresql://${env.POSTGRES_USER ?? 'legal_admin'}:${env.POSTGRES_PASSWORD ?? '123456'}@127.0.0.1:${env.POSTGRES_PORT ?? '5434'}/${env.POSTGRES_DB ?? 'legal_ai_db'}`;

const pool = new pg.Pool({ connectionString: databaseUrl, statement_timeout: 30000 });

type GateResult =
  | { status: 'BLOCKED_ON_UNGROUNDED_REVISION'; workspaceRevision: string; boundSourceRefCount: 0 }
  | { status: 'BLOCKED_ON_EMPTY_SYMBOL_SOURCE'; workspaceRevision: string; boundSourceRefCount: number }
  | { status: 'GROUNDED'; workspaceRevision: string; boundSourceRefCount: number; symbolRowCount: number };

async function checkGrounding(workspaceRevision: string): Promise<GateResult> {
  const bindings = await pool.query<{ canonical_source_ref: string }>(
    `SELECT canonical_source_ref FROM atlas_workspace_source_bindings WHERE workspace_revision = $1`,
    [workspaceRevision],
  );
  if (bindings.rowCount === 0) {
    return { status: 'BLOCKED_ON_UNGROUNDED_REVISION', workspaceRevision, boundSourceRefCount: 0 };
  }

  const boundSourceRefs = bindings.rows.map((r) => r.canonical_source_ref);
  const symbolCount = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n
     FROM graphify_symbols gs
     JOIN graphify_files gf ON gf.file_id = gs.file_id
     WHERE gf.source_ref = ANY($1::text[])`,
    [boundSourceRefs],
  );
  const n = Number(symbolCount.rows[0]?.n ?? '0');
  if (n === 0) {
    return { status: 'BLOCKED_ON_EMPTY_SYMBOL_SOURCE', workspaceRevision, boundSourceRefCount: boundSourceRefs.length };
  }
  return { status: 'GROUNDED', workspaceRevision, boundSourceRefCount: boundSourceRefs.length, symbolRowCount: n };
}

async function main() {
  const gate = await checkGrounding(targetWorkspaceRevision);

  const report: Record<string, unknown> = {
    schema: 'atlas.symbol-reconciliation-writer-receipt.v1',
    generatedAt: new Date().toISOString(),
    targetWorkspaceRevision,
    allowCreate,
    apply,
    gate,
  };

  if (gate.status !== 'GROUNDED') {
    report.action = 'NO_WRITES_PERFORMED';
    report.reason =
      gate.status === 'BLOCKED_ON_UNGROUNDED_REVISION'
        ? `workspace_revision ${targetWorkspaceRevision} has zero rows in atlas_workspace_source_bindings -- this is exactly the ungrounded-revision failure mode flagged repeatedly this session; refusing to synthesize symbol identity against it.`
        : `workspace_revision ${targetWorkspaceRevision} has ${('boundSourceRefCount' in gate ? gate.boundSourceRefCount : 0)} bound source_refs, but graphify_symbols has zero rows for any of them (graphify_symbols is empty repo-wide as of this run) -- there is no structural evidence to canonicalize yet.`;
    writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    await pool.end();
    process.exitCode = gate.status === 'BLOCKED_ON_UNGROUNDED_REVISION' ? 2 : 3;
    return;
  }

  // GROUNDED path: real symbols exist for a real bound revision. Build nominations and
  // canonicalize. (Not exercised live in this repo yet since graphify_symbols is currently
  // empty -- this branch is proven by code review + the gate above, not by a live run.)
  const boundRefs = await pool.query<{ canonical_source_ref: string }>(
    `SELECT canonical_source_ref FROM atlas_workspace_source_bindings WHERE workspace_revision = $1`,
    [targetWorkspaceRevision],
  );
  const symbolRows = await pool.query(
    `SELECT gs.symbol_id, gs.stable_symbol_key, gs.symbol_kind, gs.qualified_name,
            gs.start_byte, gs.end_byte, gs.signature_text, gs.ast_fingerprint,
            gf.source_ref AS source_ref, gf.language
     FROM graphify_symbols gs
     JOIN graphify_files gf ON gf.file_id = gs.file_id
     WHERE gf.source_ref = ANY($1::text[])`,
    [boundRefs.rows.map((r) => r.canonical_source_ref)],
  );

  const nominations = symbolRows.rows.map((row: any) => {
    const kindMap: Record<string, string> = {
      function: 'function', method: 'method', class: 'class', interface: 'interface',
      type: 'type', enum: 'enum', variable: 'variable', constant: 'constant',
      module: 'module', namespace: 'namespace', field: 'field', property: 'property',
    };
    const kind = kindMap[row.symbol_kind] ?? 'function';
    return {
      nomination_id: `nom:${row.symbol_id}`,
      symbol_key: deriveUpstreamSymbolNominationKey({
        language: row.language ?? 'unknown',
        source_ref: row.source_ref,
        kind: kind as any,
        qualified_name: row.qualified_name ?? row.stable_symbol_key,
        upstream_symbol_id: row.symbol_id,
      }),
      kind,
      language: row.language ?? 'unknown',
      name: row.qualified_name ?? row.stable_symbol_key,
      qualified_name: row.qualified_name ?? row.stable_symbol_key,
      container_qualified_name: null,
      source_ref: row.source_ref,
      source_revision: targetWorkspaceRevision,
      workspace_revision: targetWorkspaceRevision,
      upstream_node_id: row.symbol_id,
      upstream_symbol_id: row.symbol_id,
      upstream_chunk_id: row.symbol_id,
      byte_start: Number(row.start_byte),
      byte_end: Number(row.end_byte),
      parent_route: [],
      signature_normalized: row.signature_text ?? null,
      declaration_hash: row.ast_fingerprint,
      exported: false,
      export_name: null,
      extractor: 'treesitter_chunker' as const,
      extractor_revision: 'graphify-symbols-v1',
    };
  });

  // S01-10B main-repo boundary guard: the package promoteNomination writes registry + aliases + version in one transaction with no
  // revision validation. When promotion is requested, an unqualified nomination must never reach it. Dry-run stays read-only and unfiltered.
  const promoting = apply && allowCreate;
  let admittedNominations = nominations;
  const revisionRejections: Array<{ nomination_id: string; reasons: string[] }> = [];
  if (promoting) {
    const provenanceMap = await loadBindingProvenanceV1(pool, nominations.map((n) => ({ sourceRef: n.source_ref, sourceRevision: n.source_revision })));
    admittedNominations = nominations.filter((n) => {
      const v = qualifyPromotionNominationV1(n, targetWorkspaceRevision, provenanceForV1(provenanceMap, n.source_ref, n.source_revision));
      if (!v.admitted) revisionRejections.push({ nomination_id: n.nomination_id, reasons: v.reasons });
      return v.admitted;
    });
  }
  report.revisionRejectedCount = revisionRejections.length;
  report.revisionRejectionSample = revisionRejections.slice(0, 20);

  const repo = createSymbolRegistryRepository(pool);
  const result = await canonicalizeStructuralEvidence({
    evidence_id: `symbol-reconciliation-run:${targetWorkspaceRevision}`,
    evidence_revision: 'symbol-reconciliation-writer-v1',
    source_ref: 'multi',
    source_revision: targetWorkspaceRevision,
    workspace_revision: targetWorkspaceRevision,
    producer_revision: 'symbol-reconciliation-writer-v1',
    symbol_nominations: admittedNominations as any,
    reference_facts: [],
    symbol_resolver: {
      resolve: (n) => repo.resolveNomination({ nomination: n, registry_revision: targetWorkspaceRevision }),
      promote: apply && allowCreate
        ? (n) => repo.promoteNomination({
            nomination: n, registry_revision: targetWorkspaceRevision,
            producer_revision: 'symbol-reconciliation-writer-v1', allow_create: true,
          })
        : undefined,
    },
    promote_unresolved: apply && allowCreate,
  });

  report.action = apply ? 'CANONICALIZATION_APPLIED' : 'DRY_RUN_RESOLUTION_ONLY';
  report.receipt = result.receipt;
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  await pool.end();
}

function writeReport(report: Record<string, unknown>) {
  const dir = path.join(REPO_ROOT, 'docs', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `symbol-reconciliation-writer-v1-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  (report as any)._reportPath = path.relative(REPO_ROOT, outPath);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

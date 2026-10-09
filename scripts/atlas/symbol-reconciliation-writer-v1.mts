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
import { deriveUpstreamSymbolNominationKey, STRUCTURAL_SYMBOL_KIND_VALUES } from '../../packages/parent-atlas/dist/core/structural-symbol.js';
import { classifyStructuralSymbolKindV1 } from './lib/structural-symbol-kind-admission-v1.mjs';
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
const reportOutput = opt('--output', '');
const sourceRefsFilter = opt('--source-refs', '').split(',').map((value) => value.trim()).filter(Boolean);

const databaseUrl =
  env.DATABASE_URL ||
  `postgresql://${env.POSTGRES_USER ?? 'legal_admin'}:${env.POSTGRES_PASSWORD ?? '123456'}@127.0.0.1:${env.POSTGRES_PORT ?? '5434'}/${env.POSTGRES_DB ?? 'legal_ai_db'}`;

if (reportOutput) {
  const resolvedReportOutput = path.resolve(REPO_ROOT, reportOutput);
  const scratchRoot = `${path.resolve(REPO_ROOT, '.tmp', 'atlas')}${path.sep}`;
  if (!resolvedReportOutput.startsWith(scratchRoot)) throw new Error('--output must remain under .tmp/atlas');
}

const pool = new pg.Pool({ connectionString: databaseUrl, statement_timeout: 30000 });

type GateResult =
  | { status: 'BLOCKED_ON_UNGROUNDED_REVISION'; workspaceRevision: string; boundSourceRefCount: 0 }
  | { status: 'BLOCKED_ON_EMPTY_SYMBOL_SOURCE'; workspaceRevision: string; boundSourceRefCount: number }
  | { status: 'GROUNDED'; workspaceRevision: string; boundSourceRefCount: number; symbolRowCount: number };

async function checkGrounding(workspaceRevision: string, sourceRefs: readonly string[]): Promise<GateResult> {
  const bindings = await pool.query<{ canonical_source_ref: string }>(
    `SELECT canonical_source_ref FROM atlas_workspace_source_bindings
      WHERE repo_id = 'deeds-web-app' AND workspace_revision = $1
        AND ($2::text[] IS NULL OR canonical_source_ref = ANY($2::text[]))`,
    [workspaceRevision, sourceRefs.length ? sourceRefs : null],
  );
  if (bindings.rowCount === 0) {
    return { status: 'BLOCKED_ON_UNGROUNDED_REVISION', workspaceRevision, boundSourceRefCount: 0 };
  }

  const boundSourceRefs = bindings.rows.map((r) => r.canonical_source_ref);
  const symbolCount = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n
     FROM atlas_workspace_source_bindings b
     JOIN graphify_files gf
       ON gf.source_ref = b.canonical_source_ref
      AND gf.code_source_revision = b.source_revision
     JOIN graphify_symbols gs ON gs.file_id = gf.file_id
     WHERE b.repo_id = 'deeds-web-app'
       AND b.workspace_revision = $1
       AND b.canonical_source_ref = ANY($2::text[])`,
    [workspaceRevision, boundSourceRefs],
  );
  const n = Number(symbolCount.rows[0]?.n ?? '0');
  if (n === 0) {
    return { status: 'BLOCKED_ON_EMPTY_SYMBOL_SOURCE', workspaceRevision, boundSourceRefCount: boundSourceRefs.length };
  }
  return { status: 'GROUNDED', workspaceRevision, boundSourceRefCount: boundSourceRefs.length, symbolRowCount: n };
}

async function main() {
  const gate = await checkGrounding(targetWorkspaceRevision, sourceRefsFilter);

  const report: Record<string, unknown> = {
    schema: 'atlas.symbol-reconciliation-writer-receipt.v1',
    generatedAt: new Date().toISOString(),
    targetWorkspaceRevision,
    sourceRefsFilter: sourceRefsFilter.length ? sourceRefsFilter : null,
    allowCreate,
    apply,
    gate,
  };

  if (gate.status !== 'GROUNDED') {
    report.action = 'NO_WRITES_PERFORMED';
    report.reason =
      gate.status === 'BLOCKED_ON_UNGROUNDED_REVISION'
        ? `workspace_revision ${targetWorkspaceRevision} has zero rows in atlas_workspace_source_bindings -- this is exactly the ungrounded-revision failure mode flagged repeatedly this session; refusing to synthesize symbol identity against it.`
        : `workspace_revision ${targetWorkspaceRevision} has ${('boundSourceRefCount' in gate ? gate.boundSourceRefCount : 0)} bound source_refs, but no graphify_symbols rows match those bindings' exact source revisions -- there is no admitted structural evidence to canonicalize yet.`;
    writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    await pool.end();
    process.exitCode = gate.status === 'BLOCKED_ON_UNGROUNDED_REVISION' ? 2 : 3;
    return;
  }

  // GROUNDED path: exact source-revision-bound symbols exist for the target workspace.
  // Build nominations and canonicalize without substituting workspace for source revision.
  const boundRefs = await pool.query<{ canonical_source_ref: string }>(
    `SELECT canonical_source_ref FROM atlas_workspace_source_bindings
      WHERE repo_id = 'deeds-web-app' AND workspace_revision = $1
        AND ($2::text[] IS NULL OR canonical_source_ref = ANY($2::text[]))`,
    [targetWorkspaceRevision, sourceRefsFilter.length ? sourceRefsFilter : null],
  );
  const symbolRows = await pool.query(
    `SELECT gs.symbol_id, gs.stable_symbol_key, gs.symbol_kind, gs.qualified_name,
            gs.start_byte, gs.end_byte, gs.signature_text, gs.ast_fingerprint,
            gf.source_ref AS source_ref, b.source_revision, b.workspace_revision, gf.language
     FROM atlas_workspace_source_bindings b
     JOIN graphify_files gf
       ON gf.source_ref = b.canonical_source_ref
      AND gf.code_source_revision = b.source_revision
     JOIN graphify_symbols gs ON gs.file_id = gf.file_id
     WHERE b.repo_id = 'deeds-web-app'
       AND b.workspace_revision = $1
       AND b.canonical_source_ref = ANY($2::text[])`,
    [targetWorkspaceRevision, boundRefs.rows.map((r) => r.canonical_source_ref)],
  );

  const unsupportedKinds: Array<{ symbolId: string; symbolKind: string }> = [];
  const nominations = symbolRows.rows.flatMap((row: any) => {
    const classification = classifyStructuralSymbolKindV1(row.symbol_kind);
    if (!classification.admitted) {
      unsupportedKinds.push({ symbolId: String(row.symbol_id), symbolKind: String(row.symbol_kind) });
      return [];
    }
    const kind = classification.kind;
    return {
      nomination_id: `nom:${row.symbol_id}`,
      symbol_key: deriveUpstreamSymbolNominationKey({
        language: row.language ?? 'unknown',
        source_ref: row.source_ref,
      kind,
        qualified_name: row.qualified_name ?? row.stable_symbol_key,
        upstream_symbol_id: row.symbol_id,
      }),
      kind,
      language: row.language ?? 'unknown',
      name: row.qualified_name ?? row.stable_symbol_key,
      qualified_name: row.qualified_name ?? row.stable_symbol_key,
      container_qualified_name: null,
      source_ref: row.source_ref,
      source_revision: row.source_revision,
      workspace_revision: row.workspace_revision,
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
  report.symbolKindAdmission = {
    allowedKinds: [...STRUCTURAL_SYMBOL_KIND_VALUES],
    admittedCount: nominations.length,
    excludedUnsupportedKindCount: unsupportedKinds.length,
    excludedByKind: Object.fromEntries(
      [...new Set(unsupportedKinds.map((row) => row.symbolKind))]
        .sort()
        .map((symbolKind) => [symbolKind, unsupportedKinds.filter((row) => row.symbolKind === symbolKind).length]),
    ),
    excludedSample: unsupportedKinds.slice(0, 20),
    authority: 'PARENT_ATLAS_STRUCTURAL_SYMBOL_KIND_VALUES',
  };
  report.sourceRevisionBindingSummary = {
    symbolRowCount: symbolRows.rows.length,
    distinctSourceRefCount: new Set(symbolRows.rows.map((row: any) => row.source_ref)).size,
    distinctSourceRevisionCount: new Set(symbolRows.rows.map((row: any) => row.source_revision)).size,
    distinctWorkspaceRevisionCount: new Set(symbolRows.rows.map((row: any) => row.workspace_revision)).size,
    sourceRevisionSamples: symbolRows.rows.slice(0, 5).map((row: any) => ({
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
      workspaceRevision: row.workspace_revision,
    })),
    authority: 'EXACT_WORKSPACE_SOURCE_BINDING_JOIN',
  };

  const exactIdentityCandidates = await pool.query(
    `SELECT n.nomination_id, r.stable_symbol_id, v.symbol_version_id
       FROM jsonb_to_recordset($1::jsonb) AS n(
         nomination_id text, source_ref text, source_revision text, kind text,
         qualified_name text, declaration_hash text, byte_start bigint, byte_end bigint
       )
       JOIN atlas_symbol_versions v
         ON v.source_ref = n.source_ref
        AND v.source_revision = n.source_revision
        AND v.qualified_name = n.qualified_name
        AND v.declaration_hash = n.declaration_hash
        AND v.byte_start = n.byte_start
        AND v.byte_end = n.byte_end
       JOIN atlas_symbol_registry r
         ON r.stable_symbol_id = v.stable_symbol_id
        AND r.symbol_kind = n.kind
        AND r.status = 'active'
       ORDER BY n.nomination_id, r.stable_symbol_id, v.symbol_version_id`,
    [JSON.stringify(nominations.map((n) => ({
      nomination_id: n.nomination_id,
      source_ref: n.source_ref,
      source_revision: n.source_revision,
      kind: n.kind,
      qualified_name: n.qualified_name,
      declaration_hash: n.declaration_hash,
      byte_start: n.byte_start,
      byte_end: n.byte_end,
    })))],
  );
  const exactCandidatesByNomination = new Map<string, Array<{ stable_symbol_id: string; symbol_version_id: string }>>();
  for (const candidate of exactIdentityCandidates.rows) {
    const matches = exactCandidatesByNomination.get(candidate.nomination_id) ?? [];
    matches.push({ stable_symbol_id: candidate.stable_symbol_id, symbol_version_id: candidate.symbol_version_id });
    exactCandidatesByNomination.set(candidate.nomination_id, matches);
  }
  const exactIdentityStatuses = nominations.map((nomination) => {
    const matches = exactCandidatesByNomination.get(nomination.nomination_id) ?? [];
    const stableIds = [...new Set(matches.map((match) => match.stable_symbol_id))];
    return {
      nominationId: nomination.nomination_id,
      status: stableIds.length === 1 ? 'EXACT_UNIQUE_CANDIDATE' : stableIds.length > 1 ? 'EXACT_AMBIGUOUS_CANDIDATES' : 'NO_EXACT_CANDIDATE',
      stableSymbolIds: stableIds,
      symbolVersionIds: matches.map((match) => match.symbol_version_id),
    };
  });
  report.exactIdentityCandidateAudit = {
    comparedCount: nominations.length,
    uniqueCandidateCount: exactIdentityStatuses.filter((row) => row.status === 'EXACT_UNIQUE_CANDIDATE').length,
    ambiguousCandidateCount: exactIdentityStatuses.filter((row) => row.status === 'EXACT_AMBIGUOUS_CANDIDATES').length,
    noCandidateCount: exactIdentityStatuses.filter((row) => row.status === 'NO_EXACT_CANDIDATE').length,
    sample: exactIdentityStatuses.slice(0, 20),
    authority: 'DIAGNOSTIC_EXACT_SOURCE_REVISION_NAME_KIND_SPAN_HASH_ONLY',
    identityResolutionApplied: false,
  };

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

  report.action = apply && allowCreate ? 'CANONICALIZATION_APPLIED' : 'DRY_RUN_RESOLUTION_ONLY';
  report.symbolResolutionSummary = {
    canonical: result.symbol_resolutions.filter((row) => row.status === 'canonical').length,
    unresolved: result.symbol_resolutions.filter((row) => row.status === 'unresolved').length,
    ambiguous: result.symbol_resolutions.filter((row) => row.status === 'ambiguous').length,
    sample: result.symbol_resolutions.slice(0, 12).map((row) => ({
      nominationId: row.nomination_id,
      symbolKey: row.symbol_key,
      status: row.status,
      resolutionBasis: row.resolution_basis,
      candidateSymbolIds: row.candidate_symbol_ids,
    })),
  };
  report.receipt = result.receipt;
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  await pool.end();
}

function writeReport(report: Record<string, unknown>) {
  const outPath = reportOutput
    ? path.resolve(REPO_ROOT, reportOutput)
    : path.join(REPO_ROOT, 'docs', 'reports', `symbol-reconciliation-writer-v1-${Date.now()}.json`);
  const dir = path.dirname(outPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  (report as any)._reportPath = path.relative(REPO_ROOT, outPath);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

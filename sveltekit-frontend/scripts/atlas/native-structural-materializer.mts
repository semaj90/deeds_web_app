#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from '$lib/server/db/client.js';
import { extractAstFeatures } from '$lib/server/analysis/ast-grep-extractor.js';
import { GraphifyStructuralMaterializer } from '$lib/server/atlas/indexing/graphify-structural-materializer.js';
import { compileGraphifyStructuralIntelligence } from '$lib/server/atlas/indexing/graphify-structural-intelligence-adapter.js';
import {
  createEvidenceEntityRepository,
  createEvidenceLedgerRepository,
  createSymbolRegistryRepository,
  promoteResolvedSymbolsToEvidenceEntities,
  type EvidenceEntityFactV1,
  type SymbolResolutionV1,
} from '@deeds/parent-atlas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const APPLY = process.argv.includes('--apply');
const ALLOW_CREATE_SYMBOLS = process.argv.includes('--allow-create-symbols');
const VERBOSE = process.argv.includes('--verbose');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = Math.max(1, Number(limitArg?.split('=')[1] ?? process.env.ATLAS_NATIVE_STRUCTURAL_LIMIT ?? (APPLY ? 1000 : 50)));
const includeArg = process.argv.find((arg) => arg.startsWith('--include='));
const INCLUDE_PREFIX = includeArg?.slice('--include='.length).replaceAll('\\', '/').replace(/^\.\//, '') ?? '';
const PRODUCER_REVISION = 'atlas.native-structural-materializer.v1';
const REGISTRY_REVISION = process.env.ATLAS_SYMBOL_REGISTRY_REVISION ?? 'atlas-symbol-registry-v1';

const SUPPORTED: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
};
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.svelte-kit', '.next', 'dist', 'build', 'coverage', '.venv', 'venv']);

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : stable(value), 'utf8').digest('hex');
}

function workspaceRevision(): string {
  if (process.env.ATLAS_WORKSPACE_REVISION?.trim()) return process.env.ATLAS_WORKSPACE_REVISION.trim();
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'workspace:unknown';
  }
}

function sourceRef(absolutePath: string): string {
  return path.relative(REPO_ROOT, absolutePath).replaceAll('\\', '/');
}

async function discoverSources(): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (files.length >= LIMIT) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= LIMIT) break;
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && SUPPORTED[path.extname(entry.name).toLowerCase()]) {
        const ref = sourceRef(absolute);
        if (!INCLUDE_PREFIX || ref.startsWith(INCLUDE_PREFIX)) files.push(absolute);
      }
    }
  }
  await walk(REPO_ROOT);
  return files.sort((a, b) => sourceRef(a).localeCompare(sourceRef(b))).slice(0, LIMIT);
}

const workspace = workspaceRevision();
const files = await discoverSources();
const materializer = new GraphifyStructuralMaterializer();
const symbolRegistry = createSymbolRegistryRepository(pool);
const evidenceLedger = createEvidenceLedgerRepository(pool);
const evidenceEntities = createEvidenceEntityRepository(pool);

const report = {
  schema: 'atlas.native-structural-materialization-run.v1',
  workspace_revision: workspace,
  apply: APPLY,
  allow_create_symbols: ALLOW_CREATE_SYMBOLS,
  source_revision_authority: 'CONTENT_ANCHOR_ONLY' as const,
  canonical_write_gate: 'BLOCKED_SOURCE_REVISION_AUTHORITY_UNPROVEN' as const,
  limit: LIMIT,
  include_prefix: INCLUDE_PREFIX || null,
  discovered_files: files.length,
  processed_files: 0,
  proven_native_files: 0,
  recovered_files: 0,
  compatibility_files: 0,
  failed_files: 0,
  evidence_rows_written: 0,
  symbol_nominations: 0,
  canonical_symbol_resolutions: 0,
  symbols_created_or_versioned: 0,
  evidence_entity_facts_written: 0,
  diagnostics: [] as Array<{ source_ref: string; messages: string[] }>,
  failures: [] as Array<{ source_ref: string; error: string }>,
};

for (const absolutePath of files) {
  const ref = sourceRef(absolutePath);
  try {
    const source = await readFile(absolutePath, 'utf8');
    if (!source.trim()) continue;
    const language = SUPPORTED[path.extname(absolutePath).toLowerCase()]!;
    const sourceVersionAnchor = `content:${sha256(source)}`;
    const structural = await materializer.materialize({
      sourceRef: ref,
      sourceRevision: null,
      sourceVersionAnchor,
      sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
      language,
      source,
    });
    report.processed_files += 1;

    if (structural.provenanceReadiness.status === 'NATIVE_READY') report.proven_native_files += 1;
    else if (structural.provenanceReadiness.status === 'NATIVE_RECOVERED') report.recovered_files += 1;
    else if (structural.provenanceReadiness.status === 'COMPATIBILITY_ONLY') report.compatibility_files += 1;
    else report.failed_files += 1;

    if (!structural.evidence) {
      report.diagnostics.push({ source_ref: ref, messages: structural.diagnostics });
      continue;
    }

    const astGrepFeatures = await extractAstFeatures(source, language);
    const compiled = compileGraphifyStructuralIntelligence({
      source,
      workspaceRevision: workspace,
      materialization: structural,
      astGrepFeatures,
      revisions: {
        chunker: `${structural.evidence.engine}:${structural.evidence.engine_version}`,
        astGrep: 'ast-grep-napi:v1',
        langExtract: 'langextract:not-requested',
        adapter: 'graphify-structural-intelligence-adapter:v1',
        fabric: 'atlas-structural-extraction-fabric:v1',
      },
    });
    if (!compiled.fabric) continue;
    report.symbol_nominations += compiled.fabric.symbol_nominations.length;

    const evidenceRevision = `structural:${sha256({
      source_version_anchor: sourceVersionAnchor,
      source_revision_authority: structural.sourceRevisionAuthority,
      fabric_receipt: compiled.fabric.receipt,
      reference_facts: compiled.fabric.reference_facts,
      ast_grep_observations: compiled.fabric.ast_grep_observations,
    })}`;
    const evidenceId = `evidence:structural:${sha256([ref, sourceVersionAnchor, evidenceRevision]).slice(0, 40)}`;

    if (!APPLY) {
      if (VERBOSE) console.log(JSON.stringify({
        source_ref: ref,
        status: compiled.receipt.status,
        source_version_anchor: sourceVersionAnchor,
        source_revision: null,
        source_revision_authority: structural.sourceRevisionAuthority,
        canonical_promotion_allowed: compiled.receipt.canonicalPromotionMayBeAttempted,
        evidence_id: evidenceId,
        nominations: compiled.fabric.symbol_nominations.length,
      }));
      continue;
    }

    if (structural.sourceRevisionAuthority !== 'PROVEN' || !structural.sourceRevision) {
      throw new Error('NATIVE_STRUCTURAL_APPLY_BLOCKED_SOURCE_REVISION_AUTHORITY_UNPROVEN');
    }
    const sourceRevision = structural.sourceRevision;

    await evidenceLedger.upsert({
      schema: 'atlas.evidence-record.v1',
      evidence_id: evidenceId,
      evidence_kind: 'code.structural',
      source_ref: ref,
      source_revision: sourceRevision,
      evidence_revision: evidenceRevision,
      producer_revision: PRODUCER_REVISION,
      confidence: structural.status === 'PROVEN' ? 1 : 0.5,
      payload: {
        provider: structural.provider,
        provider_status: structural.status,
        provenance_readiness: structural.provenanceReadiness,
        source_version_anchor: structural.sourceVersionAnchor,
        source_revision_authority: structural.sourceRevisionAuthority,
        structural_receipt: compiled.fabric.receipt,
        reference_facts: compiled.fabric.reference_facts,
        ast_grep_observations: compiled.fabric.ast_grep_observations,
        diagnostics: compiled.receipt.diagnostics,
      },
      tags: ['structural', 'treesitter-chunker', 'ast-grep'],
      search_text: `${ref} ${compiled.fabric.symbol_nominations.map((item) => item.qualified_name).join(' ')}`,
    });
    await evidenceLedger.readback({ evidence_id: evidenceId, producer_revision: PRODUCER_REVISION });
    report.evidence_rows_written += 1;

    const resolutions: SymbolResolutionV1[] = [];
    for (const nomination of compiled.fabric.symbol_nominations) {
      let resolution = await symbolRegistry.resolveNomination({ nomination, registry_revision: REGISTRY_REVISION });
      if (
        resolution.status !== 'canonical'
        && ALLOW_CREATE_SYMBOLS
        && compiled.receipt.canonicalPromotionMayBeAttempted
      ) {
        const promoted = await symbolRegistry.promoteNomination({
          nomination,
          registry_revision: REGISTRY_REVISION,
          producer_revision: PRODUCER_REVISION,
          allow_create: true,
          evidence_refs: [evidenceId],
        });
        resolution = promoted.resolution;
        await symbolRegistry.readback({ stable_symbol_id: promoted.resolution.stable_symbol_id!, producer_revision: PRODUCER_REVISION });
        report.symbols_created_or_versioned += 1;
      }
      resolutions.push(resolution);
      if (resolution.status === 'canonical') report.canonical_symbol_resolutions += 1;
    }

    const facts: EvidenceEntityFactV1[] = promoteResolvedSymbolsToEvidenceEntities({
      evidence_id: evidenceId,
      evidence_revision: evidenceRevision,
      source_ref: ref,
      source_revision: sourceRevision,
      producer_revision: PRODUCER_REVISION,
      nominations: compiled.fabric.symbol_nominations,
      resolutions,
    });
    if (facts.length > 0) {
      const writeReceipt = await evidenceEntities.upsertFacts({
        source_snapshot_revision: workspace,
        facts,
        source_checksum: sha256(source),
        producer_revision: PRODUCER_REVISION,
      });
      if (writeReceipt.rejected_count > 0) {
        throw new Error(`EVIDENCE_ENTITY_WRITE_REJECTED:${writeReceipt.rejected_refs.join(',')}`);
      }
      report.evidence_entity_facts_written += writeReceipt.inserted_count;
    }

    if (compiled.receipt.diagnostics.length > 0 && VERBOSE) {
      report.diagnostics.push({ source_ref: ref, messages: compiled.receipt.diagnostics });
    }
  } catch (error) {
    report.failed_files += 1;
    report.failures.push({ source_ref: ref, error: error instanceof Error ? error.message : String(error) });
  }
}

const status = report.failed_files > 0
  ? 'COMPLETED_WITH_FAILURES'
  : APPLY
    ? 'APPLY_BLOCKED_REVISION_OWNER_UNPROVEN'
    : 'DRY_RUN_COMPLETE';
const finalReceipt = { ...report, status, output_checksum: sha256(report), producer_revision: PRODUCER_REVISION };
console.log(JSON.stringify(finalReceipt, null, 2));
await pool.end();
if (report.failed_files > 0 || APPLY) process.exitCode = 2;

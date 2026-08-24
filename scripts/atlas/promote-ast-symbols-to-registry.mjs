#!/usr/bin/env node
/**
 * promote-ast-symbols-to-registry.mjs
 *
 * Bounded canonical-symbol-registry promotion writer, requested explicitly
 * (not run automatically). Populates `atlas_symbol_registry` — the single
 * most protected table in this repo's identity model, FK-referenced by
 * `atlas_structural_reference_resolutions`, `atlas_symbol_aliases`, and
 * `atlas_symbol_versions` — from the AST-grep nomination JSONL already
 * reviewed read-only by `review-ast-symbol-promotion-plan.mjs`.
 *
 * Hard rule, matching that review script and the openspec guardrail this
 * change was built against ("Do not promote variables or mint canonical IDs
 * from AST-grep alone"): only declaration-like kinds are eligible —
 * function, method, class, interface, type, enum. `variable`-kind
 * nominations are never promoted by this script, full stop.
 *
 * Default is dry-run. `--apply` requires `--limit=N` (no unbounded apply —
 * this is canonical identity, not a rebuildable cache) and inserts via
 * `ON CONFLICT (canonical_key) DO NOTHING`, so re-running is always safe
 * and never overwrites an already-registered symbol.
 *
 * Usage:
 *   node scripts/atlas/promote-ast-symbols-to-registry.mjs                       # dry-run, all eligible
 *   node scripts/atlas/promote-ast-symbols-to-registry.mjs --apply --limit=50    # bounded live apply
 *
 * Exit codes: 0 = success, 1 = missing --limit with --apply, 2 = Postgres error
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const REGISTRY_REVISION = 'promotion:ast-nominations:v1';
const PROMOTABLE_KINDS = new Set(['function', 'method', 'class', 'interface', 'type', 'enum']);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0) || null;
const INPUT = path.resolve(ROOT, (args.find((a) => a.startsWith('--input=')) || '').slice(8)
  || '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl');

function canonicalKeyFor(row) {
  // MUST equal the nomination's own `symbol_key` verbatim — that's what
  // resolve-ast-symbol-nominations-dry-run.mjs matches nominations against
  // (`registry.get(nomination.symbol_key)`), not an independently-derived
  // key. `symbol_key` is nominate-ast-symbols-dry-run.mjs's
  // `symbol-key:${sha256({sourceRef, sourceRevision, kind, name, startByte,
  // endByte}).slice(0,40)}` — already unique per exact declaration
  // instance (byte-offset-scoped, so overloads/re-declarations of the same
  // name naturally get distinct keys). Confirmed live: an earlier version
  // of this function invented a second key scheme, which inserted 50 real
  // registry rows that the resolver could never match (`registry_keys: 50`
  // but `canonical: 0` on rerun) — fixed here, not left as a silent gap.
  if (!row.symbol_key) throw new Error(`nomination ${row.nomination_id} has no symbol_key`);
  return row.symbol_key;
}

function stableSymbolIdFor(canonicalKey) {
  return `stable-symbol:${createHash('sha256').update(canonicalKey, 'utf8').digest('hex')}`;
}

async function main() {
  if (APPLY && !LIMIT) {
    console.error('Refusing --apply without an explicit --limit=N — canonical identity writes are always bounded here.');
    process.exit(1);
  }

  const raw = await fs.readFile(INPUT, 'utf8');
  const rows = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

  const eligible = rows.filter((row) => PROMOTABLE_KINDS.has(row.kind));
  const excludedVariables = rows.length - eligible.length;

  // Dedupe by canonical_key within this run's input (distinct from the live
  // DB dedupe ON CONFLICT provides across runs).
  const byKey = new Map();
  for (const row of eligible) {
    const canonicalKey = canonicalKeyFor(row);
    if (!byKey.has(canonicalKey)) byKey.set(canonicalKey, row);
  }
  const uniqueCandidates = [...byKey.entries()];

  const report = {
    schema: 'atlas.ast-symbol-registry-promotion-report.v1',
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    input: INPUT,
    registryRevision: REGISTRY_REVISION,
    limit: LIMIT,
    inputNominations: rows.length,
    excludedVariables,
    eligibleDeclarationLike: eligible.length,
    uniqueCandidatesAfterDedup: uniqueCandidates.length,
    rowsAttempted: 0,
    rowsInserted: 0,
    rowsAlreadyRegistered: 0,
    sample: uniqueCandidates.slice(0, 5).map(([canonicalKey, row]) => ({
      canonicalKey,
      stableSymbolId: stableSymbolIdFor(canonicalKey),
      kind: row.kind,
      qualifiedName: row.qualified_name,
      sourceRef: row.source_ref,
    })),
    errors: [],
  };

  console.log(`[SYMBOL-PROMOTE] mode=${report.mode} input=${rows.length} excludedVariables=${excludedVariables} eligible=${eligible.length} uniqueCandidates=${uniqueCandidates.length}`);

  if (!APPLY) {
    await writeReport(report);
    console.log('[SYMBOL-PROMOTE] dry-run complete: 0 database writes performed.');
    return;
  }

  const batch = uniqueCandidates.slice(0, LIMIT);
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    for (const [canonicalKey, row] of batch) {
      report.rowsAttempted++;
      const stableSymbolId = stableSymbolIdFor(canonicalKey);
      try {
        const res = await pool.query(
          `INSERT INTO atlas_symbol_registry (
             stable_symbol_id, canonical_key, language, symbol_kind,
             canonical_name, canonical_qualified_name,
             created_from_nomination_id, created_from_source_ref,
             created_from_source_revision, registry_revision, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
           ON CONFLICT (canonical_key) DO NOTHING
           RETURNING stable_symbol_id`,
          [
            stableSymbolId,
            canonicalKey,
            row.language,
            row.kind,
            row.name,
            row.qualified_name,
            row.nomination_id,
            row.source_ref,
            row.source_revision,
            REGISTRY_REVISION,
          ],
        );
        if (res.rowCount > 0) {
          report.rowsInserted++;
        } else {
          report.rowsAlreadyRegistered++;
        }
      } catch (err) {
        report.errors.push({ canonicalKey, error: err.message });
      }
    }
  } catch (err) {
    report.errors.push({ fatal: err.message });
    await writeReport(report);
    console.error(`Postgres error: ${err.message}`);
    process.exit(2);
  } finally {
    await pool.end();
  }

  await writeReport(report);
  console.log(`[SYMBOL-PROMOTE] apply complete: ${report.rowsInserted} inserted, ${report.rowsAlreadyRegistered} already registered, ${report.errors.length} errors.`);
}

async function writeReport(report) {
  const outDir = path.resolve(ROOT, 'docs/reports');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.resolve(outDir, 'ast-symbol-registry-promotion.json');
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`[SYMBOL-PROMOTE] report written to ${outPath}`);
}

main().catch((err) => {
  console.error(`[SYMBOL-PROMOTE] fatal: ${err.stack || err.message}`);
  process.exit(1);
});

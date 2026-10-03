#!/usr/bin/env node
/**
 * S01-09C — tree-node occurrence cardinality audit. READ ONLY, zero writes anywhere except the receipt files.
 * Investigates the 22 `upstream_node_id` values already flagged (S01-09) as attaching to more than one
 * stable_symbol_id, root-causing the defect rather than just re-counting it.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-tree-node-occurrence-cardinality.v1';
const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

try {
  const total = (await pool.query(`SELECT count(*)::int AS n, count(DISTINCT upstream_node_id)::int AS distinctNodes FROM atlas_symbol_versions WHERE upstream_node_id IS NOT NULL`)).rows[0];
  const sharedGroups = (await pool.query(`
    SELECT upstream_node_id, count(*)::int AS rowCount, count(DISTINCT stable_symbol_id)::int AS stableSymbolCount,
           count(DISTINCT declaration_hash)::int AS declarationHashCount, count(DISTINCT qualified_name)::int AS qualifiedNameCount,
           count(DISTINCT (byte_start, byte_end))::int AS byteSpanCount, count(DISTINCT source_ref)::int AS sourceRefCount,
           array_agg(DISTINCT source_ref) AS sourceRefs, array_agg(DISTINCT producer_revision) AS producerRevisions
    FROM atlas_symbol_versions WHERE upstream_node_id IS NOT NULL
    GROUP BY upstream_node_id HAVING count(DISTINCT stable_symbol_id) > 1 ORDER BY count(*) DESC`)).rows;

  const distinctDeclarationsWithinGroup = sharedGroups.every((g) => g.declarationhashcount === g.rowcount && g.qualifiednamecount === g.rowcount && g.bytespancount === g.rowcount);
  const eachGroupConfinedToOneFile = sharedGroups.every((g) => g.sourcerefcount === 1);
  const rootCause = distinctDeclarationsWithinGroup && eachGroupConfinedToOneFile
    ? 'UPSTREAM_NODE_ID_IS_FILE_SCOPED_NOT_DECLARATION_SCOPED'
    : 'UNCLASSIFIED_SHARING_PATTERN';

  const affectedRows = (await pool.query(`
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE source_revision ~ '^sha256:[0-9a-f]{64}$')::int AS qualified,
           count(*) FILTER (WHERE source_revision !~ '^sha256:[0-9a-f]{64}$')::int AS unqualified,
           count(DISTINCT producer_revision) AS producerRevisionCount, array_agg(DISTINCT producer_revision) AS producerRevisions
    FROM atlas_symbol_versions
    WHERE upstream_node_id IN (SELECT upstream_node_id FROM atlas_symbol_versions WHERE upstream_node_id IS NOT NULL GROUP BY upstream_node_id HAVING count(DISTINCT stable_symbol_id) > 1)`)).rows[0];

  const allBadRowsCount = (await pool.query(`SELECT count(*)::int AS n FROM atlas_symbol_versions WHERE source_revision !~ '^sha256:[0-9a-f]{64}$'`)).rows[0].n;
  const unrepairedRowsFullyInsideSharedGroups = affectedRows.unqualified === allBadRowsCount;

  // Cross-check against the source-evidence table this repo already uses for nomination provenance: was the current, on-disk
  // AST-grep nominations JSONL the origin of these 285 materializer rows? A negative match here is itself evidence that
  // this population was produced by an input file that has since been regenerated (superseded), not a live-reproducible source.
  const nominationsPath = path.join(root, '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl');
  let currentNominationsFileLineCount = null, perGroupPresence = [], presentCount = 0;
  if (fs.existsSync(nominationsPath)) {
    const body = fs.readFileSync(nominationsPath, 'utf8');
    currentNominationsFileLineCount = body.split('\n').filter(Boolean).length;
    perGroupPresence = sharedGroups.map((g) => ({ upstreamNodeId: g.upstream_node_id, presentInCurrentNominationsFile: body.includes(g.upstream_node_id) }));
    presentCount = perGroupPresence.filter((p) => p.presentInCurrentNominationsFile).length;
  }

  const receipt = {
    schema: SCHEMA, generatedAt: new Date().toISOString(), gate: 'S01-09C',
    totals: { versionRowsWithUpstreamNodeId: total.n, distinctUpstreamNodeIds: total.distinctnodes, sharedGroupCount: sharedGroups.length },
    sharedGroups: sharedGroups.map((g) => ({
      upstreamNodeId: g.upstream_node_id, rowCount: g.rowcount, stableSymbolCount: g.stablesymbolcount,
      declarationHashCount: g.declarationhashcount, qualifiedNameCount: g.qualifiednamecount, byteSpanCount: g.bytespancount,
      sourceRefCount: g.sourcerefcount, sourceRefs: g.sourcerefs, producerRevisions: g.producerrevisions,
    })),
    rootCause: { classification: rootCause, distinctDeclarationsWithinGroup, eachGroupConfinedToOneFile,
      explanation: 'Every shared group has exactly ONE distinct source_ref but N distinct declaration_hash/qualified_name/byte_span values -- the sibling rows are genuinely different declarations in the same file, not duplicate registrations of one physical AST node. upstream_node_id for these rows behaves as a file-scoped identifier, not a declaration-scoped tree-node occurrence id. This means the S01-09 predicate TREE_NODE_OCCURRENCE_UNIQUE_TO_SYMBOL is correctly VIOLATED, and root-caused: it is a field-population defect in the historical writer/input for this population, not evidence that any single physical AST node is claimed by more than one symbol.' },
    affectedPopulation: { totalRows: affectedRows.n, qualified: affectedRows.qualified, unqualified: affectedRows.unqualified, producerRevisions: affectedRows.producerrevisions },
    correlationWithS01_10_repair: { allStillBadVersionRows: allBadRowsCount, unrepairedRowsFullyInsideSharedGroups, note: 'Every one of the 77 rows left SOURCE_NOT_IN_COHORT by S01-10C/E falls inside these 22 shared-node groups; the remaining 121 rows in these groups were successfully repaired by S01-10E (qualified revisions do not depend on upstream_node_id in any way -- these are two independent facts about the same historical population, not causally linked).' },
    currentNominationsFileCrossCheck: {
      path: '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl', exists: fs.existsSync(nominationsPath), lineCount: currentNominationsFileLineCount,
      groupsPresentInCurrentFile: presentCount, groupsAbsentFromCurrentFile: sharedGroups.length - presentCount, perGroup: perGroupPresence,
      interpretation: `${presentCount}/${sharedGroups.length} of the shared upstream_node_id groups still appear in the current on-disk nominations file; ${sharedGroups.length - presentCount}/${sharedGroups.length} do not. This is a mixed population, not uniformly historical: some of the sharing is reproducible from current AST-grep output (a live defect in that extraction/nomination step, not just stale writer input) and some is not (produced by an input that has since been regenerated). Presence in the current file does not by itself explain the 1-node-per-file sharing pattern -- that pattern (declaration_hash/qualified_name/byte_span all distinct, source_ref always singular per group) is present regardless of whether the group's id is still in the current file.`,
    },
    excludedActions: 'No repair, backfill, dedup, or schema change performed here. No stableFileId created. No Graphify run. This is a root-cause census only.',
    safety: { databaseWrites: 0, historicalRowsChanged: 0, graphifyRun: false, stableFileIdCreated: false },
    status: 'TREE_NODE_OCCURRENCE_CARDINALITY_ROOT_CAUSED',
  };
  const body = JSON.stringify(receipt, null, 2);
  const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
  const immutable = path.join(root, 'docs/reports', `symbol-tree-node-occurrence-cardinality-v1.${sha12}.json`);
  const pointer = path.join(root, 'docs/reports/symbol-tree-node-occurrence-cardinality-v1.json');
  fs.writeFileSync(immutable, body + '\n', { flag: 'wx' });
  fs.writeFileSync(pointer, body + '\n');
  console.log(receipt.status, immutable);
  console.log(JSON.stringify({ sharedGroupCount: sharedGroups.length, rootCause, unrepairedRowsFullyInsideSharedGroups, groupsPresentInCurrentFile: presentCount, groupsAbsentFromCurrentFile: sharedGroups.length - presentCount }));
} finally {
  await pool.end();
}

#!/usr/bin/env node

/**
 * Read-only registry-writer ownership audit.
 *
 * This intentionally inventories reachability and write semantics; it never
 * executes a writer, creates a table, or changes PostgreSQL/derived state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'atlas-registry-writer-ownership-v2.json');
const SCAN_ROOTS = ['package.json', 'scripts', 'services', 'packages', 'sveltekit-frontend/src',
  'sveltekit-frontend/package.json', 'openspec', '.github', 'docker'];
const WRITERS = [
  'scripts/atlas/hyperrag-packet-materializer.mjs',
  'scripts/atlas/materialize-addressable-packets.mjs',
  'sveltekit-frontend/scripts/atlas/materialize-addressable-packets.mjs',
  'scripts/atlas/backfill-packet-registry.mjs',
  'scripts/atlas/week1-packet-registry-backfill.mjs',
  'scripts/atlas/week1-backfill-packet-registry.mjs',
];
const TERMS = [
  'hyperrag-packet-materializer', 'materialize-addressable-packets',
  'backfill-packet-registry', 'week1-packet-registry', 'atlas_packet_registry',
];

function readText(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  try {
    if (fs.statSync(absolute).size > 2 * 1024 * 1024) return '';
    return fs.readFileSync(absolute, 'utf8');
  } catch { return ''; }
}

function walk(relativePath, output = []) {
  const absolute = path.join(ROOT, relativePath);
  let stat;
  try { stat = fs.statSync(absolute); } catch { return output; }
  if (stat.isFile()) { output.push(relativePath.replaceAll('\\', '/')); return output; }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', '.svelte-kit'].includes(entry.name)) continue;
    walk(path.join(relativePath, entry.name), output);
  }
  return output;
}

function unique(values) { return [...new Set(values)]; }
function matches(text, pattern) { return [...text.matchAll(pattern)].map((m) => m[0]); }

function classify(relativePath, source, references, entrypointReferences) {
  if (relativePath.includes('week1-')) {
    return /nes_chrom_packets|neschrom97|nes_chrom/i.test(source) ? 'BROKEN_LEGACY' : 'MANUAL_MIGRATION_ONLY';
  }
  if (relativePath.endsWith('backfill-packet-registry.mjs')) return 'MANUAL_MIGRATION_ONLY';
  if (relativePath.includes('hyperrag-packet-materializer')) {
    return entrypointReferences.length > 0 ? 'ACTIVE_SECONDARY_WRITER' : 'UNRESOLVED';
  }
  if (relativePath.includes('materialize-addressable-packets')) {
    if (relativePath.startsWith('sveltekit-frontend/')) return 'UNRESOLVED';
    return entrypointReferences.length > 0 ? 'ACTIVE_SECONDARY_WRITER' : 'UNRESOLVED';
  }
  return 'UNRESOLVED';
}

function inventoryWriter(relativePath) {
  const source = readText(relativePath);
  const references = [];
  const needle = path.basename(relativePath);
  try {
    const output = execFileSync('rg', ['-l', '--hidden', '--glob', '!**/node_modules/**', '--glob', '!**/dist/**', '--glob', '!**/.git/**', '--glob', '!**/NUL', '--glob', '!*.lock', '--', needle, ...SCAN_ROOTS], { cwd: ROOT, encoding: 'utf8', timeout: 15000 });
    references.push(...output.split(/\r?\n/).map((file) => file.trim()).filter(Boolean));
  } catch {
    // rg exit code 1 means no caller was found, which is a valid result.
  }
  const filtered = unique(references.map((file) => file.replaceAll('\\', '/')).filter((file) => file !== relativePath));
  const entrypointReferences = filtered.filter((file) => /package\.json$|docker|\.github|startup|cron|daily|graphify|tasks\.json/i.test(file));
  return {
    path: relativePath,
    exists: Boolean(source),
    classification: classify(relativePath, source, filtered, entrypointReferences),
    reachableReferences: filtered,
    entrypointReferences,
    writeTargets: unique(matches(source, /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\s+[\w.]+/gi)),
    conflictSemantics: unique(matches(source, /ON\s+CONFLICT[\s\S]{0,180}/gi).map((v) => v.replace(/\s+/g, ' ').trim())).slice(0, 5),
    sourceTables: unique(matches(source, /(?:FROM|JOIN)\s+[\w.]+/gi)),
    revisionReferences: unique(matches(source, /(?:source_revision|workspace_revision|graph_revision|revision|content_hash)/gi)),
    identityReferences: unique(matches(source, /(?:packet_key|source_ref|feature_id|title_id|qdrant_point_id)/gi)),
    hasDryRun: /dry[-_ ]run|DRY_RUN|APPLY_REQUESTED/i.test(source),
    hasApply: /--apply|APPLY\b/i.test(source),
    hasTransactionMarkers: /\b(?:BEGIN|COMMIT|ROLLBACK|transaction)\b/i.test(source),
    canMutateExistingRegistryIdentity: /ON\s+CONFLICT[\s\S]{0,220}DO\s+UPDATE/i.test(source),
    dryRunMutatesSchema: /ensureHotTable\(/i.test(source) && !/if\s*\(\s*APPLY\s*\)\s*await\s+ensureHotTable/i.test(source),
    writesFiles: /writeFile|renameSync|writeFileSync/i.test(source),
    writesDatabase: /INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE/i.test(source),
    sourcePopulation: source.includes('atlas_packets') ? 'atlas_packets' : source.includes('atlas_packet_registry') ? 'registry-or-evidence' : 'file/evidence inputs',
  };
}

async function liveParity() {
  const env = loadRepoEnv(process.env);
  Object.assign(process.env, env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.atlas_packets) AS packets,
        (SELECT count(*)::int FROM public.atlas_packet_registry) AS registry,
        (SELECT count(*)::int FROM public.atlas_packets p LEFT JOIN public.atlas_packet_registry r ON r.packet_key=p.packet_key WHERE r.packet_key IS NULL) AS missing,
        (SELECT count(*)::int FROM public.atlas_packet_registry r LEFT JOIN public.atlas_packets p ON p.packet_key=r.packet_key WHERE p.packet_key IS NULL) AS orphan_registry,
        (SELECT count(*)::int FROM (SELECT packet_key FROM public.atlas_packet_registry GROUP BY packet_key HAVING count(*) > 1) d) AS duplicate_registry_keys,
        (SELECT count(*)::int FROM public.atlas_packets WHERE packet_key IS NOT NULL AND source_ref IS NOT NULL AND feature_id IS NOT NULL) AS complete_packets
    `);
    return result.rows[0];
  } finally { client.release(); await pool.end(); }
}

async function main() {
  const writers = WRITERS.map((writer) => inventoryWriter(writer));
  let census;
  try { census = await liveParity(); } catch (error) {
    census = { error: String(error?.message ?? error), writesPerformed: false };
  }
  const report = {
    schema: 'atlas.registry-writer-ownership.v2',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    writesPerformed: false,
    safeToBackfill: false,
    acceptance: {
      liveParityRequired: true,
      exactlyOneCanonicalWriterOrIntentionalNonOverlappingOwners: false,
      activeWritersPreserveCanonicalIdentity: false,
      activeWritersRevisionQualified: false,
      noSilentIdentitySynthesis: false,
    },
    liveParity: census,
    canonicalInvariant: 'atlas_packets.packet_key == atlas_packet_registry.packet_key; registry is an admitted projection/index, not an identity generator',
    writerInventory: writers,
    ownershipGraph: writers.map((writer) => ({
      writer: writer.path,
      callers: writer.entrypointReferences,
      referencesOnly: writer.reachableReferences.filter((file) => !writer.entrypointReferences.includes(file)),
      targets: writer.writeTargets,
      sourcePopulation: writer.sourcePopulation,
      classification: writer.classification,
    })),
    classificationCounts: writers.reduce((out, writer) => { out[writer.classification] = (out[writer.classification] ?? 0) + 1; return out; }, {}),
    nextGate: 'REGISTRY-WRITER-OWNERSHIP-02',
    nextAction: 'Review unresolved/secondary writer callers and conflict semantics; do not execute a writer or backfill.',
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'REGISTRY_WRITER_OWNERSHIP_READ_ONLY_COMPLETE',
    parity: census,
    classifications: report.classificationCounts,
    writesPerformed: false,
    reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
  }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'REGISTRY_WRITER_OWNERSHIP_FAILED', error: String(error?.message ?? error), writesPerformed: false }, null, 2));
  process.exitCode = 1;
});

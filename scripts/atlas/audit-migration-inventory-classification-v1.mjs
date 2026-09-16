#!/usr/bin/env node

/**
 * Read-only inventory of SQL migration ownership.
 *
 * This intentionally classifies files; it never moves, journals, applies, or
 * hashes SQL. A later migration decision must review the emitted rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const drizzleDir = path.resolve(root, 'sveltekit-frontend/drizzle');
const journalPath = path.join(drizzleDir, 'meta/_journal.json');
const sidecarPath = path.join(drizzleDir, 'sidecar-migrations.json');
const reportPath = path.resolve(root, 'docs/reports/migration-inventory-classification-v1.json');
const lineageReadbackPath = path.resolve(root, 'docs/reports/live-source-lineage-table-audit.json');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['meta', 'meta_backup_20260101', 'introspected'].includes(entry.name)) continue;
      result.push(...walk(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sql')) {
      result.push(full);
    }
  }
  return result;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function relative(file) {
  return path.relative(drizzleDir, file).replaceAll(path.sep, '/');
}

function locationFor(rel) {
  if (!rel.includes('/')) return 'ROOT';
  if (rel.startsWith('manual/')) return 'MANUAL';
  return 'NESTED';
}

function schemaSurfaces(sql) {
  const matches = sql.toLowerCase().match(/\b(?:atlas|graphify|codebase|feature|semantic|qdrant|ontology|source|packet|symbol|representation)[a-z0-9_]*\b/g) ?? [];
  return [...new Set(matches)].filter((value) => value.length > 4).sort();
}

function referencedTables(sql) {
  const uncommented = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ');
  const names = new Set();
  const patterns = [
    /\b(?:create\s+(?:or\s+replace\s+)?(?:table|materialized\s+view)|alter\s+table|drop\s+table|insert\s+into|update|from|join|references)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?(?:public\.)?["`]?([a-z_][a-z0-9_]*)["`]?/gi,
    /\bcreate\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?["`]?[a-z_][a-z0-9_]*["`]?\s+on\s+(?:only\s+)?(?:public\.)?["`]?([a-z_][a-z0-9_]*)["`]?/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(uncommented)) !== null) names.add(match[1].toLowerCase());
  }
  const sqlKeywords = new Set([
    'if', 'not', 'exists', 'concurrently', 'only', 'on', 'where', 'select',
    'values', 'set', 'skip', 'locked', 'returning', 'do', 'nothing', 'when',
    'then', 'else', 'end', 'case', 'using', 'with', 'recursive', 'as',
  ]);
  for (const keyword of sqlKeywords) names.delete(keyword);
  return [...names].sort();
}

function ownerDomain(surfaces) {
  const text = surfaces.join(' ');
  if (/qdrant|projection/.test(text)) return 'PROJECTION';
  if (/ontology|concept|taxonomy/.test(text)) return 'ONTOLOGY';
  if (/semantic|embedding|latent|representation/.test(text)) return 'SEMANTIC';
  if (/feature|classifier|topology|som|kmeans/.test(text)) return 'FEATURE';
  if (/symbol|ast|graphify|tree/.test(text)) return 'STRUCTURAL';
  if (/packet|chunk|source|workspace|lineage/.test(text)) return 'LINEAGE';
  if (/cache|redis|valkey|event|receipt/.test(text)) return 'CONTROL_PLANE';
  return 'OTHER';
}

const reviewOrder = ['LINEAGE', 'STRUCTURAL', 'SEMANTIC', 'FEATURE', 'ONTOLOGY', 'PROJECTION', 'CONTROL_PLANE', 'OTHER'];
const criticalLineageTables = new Set([
  'atlas_packets',
  'codebase_chunk_index',
  'graphify_files',
  'graphify_executions',
  'graphify_execution_files',
  'graphify_execution_file_membership',
  'atlas_packet_chunk_lineage',
  'workspace_source_membership',
  'atlas_workspace_source_bindings',
]);

function ownerCandidates(surfaces) {
  const text = surfaces.join(' ');
  const candidates = [];
  if (/atlas_packets|packet_key|packet|chunk|source_ref|source_revision|workspace_revision|lineage|graphify_files/.test(text)) {
    candidates.push('parent-atlas-retrieval-lineage-dag-convergence');
  }
  if (/symbol|ast|tree|graphify|tree_node|graph_edge/.test(text)) {
    candidates.push('parent-atlas-graph-validation-fabric');
  }
  if (/semantic|embedding|latent|representation/.test(text)) {
    candidates.push('parent-atlas-semantic-768-canonical-contract');
  }
  if (/feature|classifier|topology|som|kmeans/.test(text)) {
    candidates.push('parent-atlas-candidate-feature-execution-fabric');
  }
  if (/ontology|concept|taxonomy/.test(text)) {
    candidates.push('parent-atlas-ontology-kernel');
  }
  if (/qdrant|projection/.test(text)) {
    candidates.push('parent-atlas-retrieval-lineage-dag-convergence');
  }
  if (/cache|redis|valkey|event|receipt/.test(text)) {
    candidates.push('parent-atlas-ace-rlm-bitfrost-integration');
  }
  return [...new Set(candidates)];
}

const journal = readJson(journalPath, { entries: [] });
const journalTags = new Set((journal.entries ?? []).map((entry) => String(entry.tag)));
const sidecar = readJson(sidecarPath, { sidecars: [] });
const sidecars = new Map((sidecar.sidecars ?? []).map((entry) => [String(entry.file).replaceAll('\\', '/'), entry]));
const lineageReadback = readJson(lineageReadbackPath, null);
const liveTables = new Map((lineageReadback?.candidateTableEvidence ?? []).map((entry) => [String(entry.tableName), entry]));

const files = walk(drizzleDir).sort();
const rows = files.map((file) => {
  const rel = relative(file);
  const sql = fs.readFileSync(file, 'utf8');
  const base = path.basename(rel, '.sql');
  const journaled = journalTags.has(base);
  const declaration = sidecars.get(rel) ?? null;
  const location = locationFor(rel);
  let classification = 'UNRESOLVED';
  let reason = 'No journal entry or sidecar declaration was found.';
  let ownerChange = 'REVIEW_REQUIRED';
  if (journaled) {
    classification = 'JOURNALED_CANONICAL';
    reason = 'Matched the active Drizzle journal by migration tag.';
    ownerChange = 'NONE';
  } else if (declaration) {
    const status = String(declaration.status ?? '').toLowerCase();
    classification = ['applied', 'manual_sidecar'].includes(status)
      ? 'DECLARED_SIDECAR'
      : ['planned_sidecar', 'design_unapplied', 'deferred'].includes(status)
        ? 'DEFERRED'
        : 'UNRESOLVED';
    reason = declaration.reason ?? `Sidecar status: ${declaration.status ?? 'unknown'}.`;
    ownerChange = classification === 'DECLARED_SIDECAR' ? 'NONE' : 'REVIEW_REQUIRED';
  } else if (location === 'NESTED') {
    classification = 'ACCEPTED_HISTORICAL';
    reason = 'Nested SQL is outside the active root journal; retain as historical until an owner review says otherwise.';
    ownerChange = 'REVIEW_REQUIRED';
  }
  const surfaces = schemaSurfaces(sql);
  const tables = referencedTables(sql);
  const domain = ownerDomain(surfaces);
  const criticalSurfaces = tables.filter((table) => criticalLineageTables.has(table));
  const criticalReadback = criticalSurfaces.map((table) => {
    const evidence = liveTables.get(table);
    return {
      table,
      status: evidence == null ? 'NO_LIVE_READBACK' : evidence.present ? 'LIVE_SCHEMA_PRESENT' : 'LIVE_SCHEMA_ABSENT',
      rowCount: evidence?.row_count ?? null,
      sourceRevisionCount: evidence?.source_revision_count ?? null,
      workspaceRevisionCount: evidence?.workspace_revision_count ?? null,
    };
  });
  return {
    path: rel,
    location,
    drizzleJournaled: journaled,
    sidecarDeclared: Boolean(declaration),
    sidecarStatus: declaration?.status ?? null,
    liveEvidence: null,
    classification,
    ownerChange,
    schemaSurfaces: surfaces,
    referencedTables: tables,
    criticalLineageTables: criticalSurfaces,
    criticalLineageReadback: criticalReadback,
    ownerDomain: domain,
    reviewPriority: reviewOrder.indexOf(domain) + 1,
    ownerCandidates: ownerCandidates(surfaces),
    blocking: classification === 'UNRESOLVED',
    reason,
    sha256: crypto.createHash('sha256').update(sql).digest('hex'),
  };
});

const counts = Object.fromEntries([...new Set(rows.map((row) => row.classification))]
  .sort().map((key) => [key, rows.filter((row) => row.classification === key).length]));
const ownerDomainCounts = Object.fromEntries([...new Set(rows.map((row) => row.ownerDomain))]
  .sort().map((key) => [key, rows.filter((row) => row.ownerDomain === key).length]));
const unresolvedPriority = Object.fromEntries(reviewOrder.map((domain, index) => [
  `${index + 1}:${domain}`,
  rows.filter((row) => row.classification === 'UNRESOLVED' && row.ownerDomain === domain).length,
]));
const unresolvedTableCounts = Object.fromEntries(
  [...new Set(rows.flatMap((row) => row.classification === 'UNRESOLVED' ? row.referencedTables : []))]
    .sort()
    .map((table) => [table, rows.filter((row) => row.classification === 'UNRESOLVED' && row.referencedTables.includes(table)).length]),
);
const criticalLineageRows = rows.filter((row) => row.classification === 'UNRESOLVED' && row.criticalLineageTables.length > 0);
const report = {
  schema: 'atlas.migration-inventory-classification.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  writesPerformed: false,
  drizzleDir: path.relative(root, drizzleDir).replaceAll(path.sep, '/'),
  journalPath: path.relative(root, journalPath).replaceAll(path.sep, '/'),
  sidecarPath: path.relative(root, sidecarPath).replaceAll(path.sep, '/'),
  counts: {
    sqlFiles: rows.length,
    journalEntries: journal.entries?.length ?? 0,
    sidecarEntries: sidecar.sidecars?.length ?? 0,
    ...counts,
    unresolvedCurrentOwners: rows.filter((row) => row.classification === 'UNRESOLVED').length,
    unresolvedByOwnerDomain: Object.fromEntries(Object.entries(ownerDomainCounts).map(([key]) => [
      key,
      rows.filter((row) => row.classification === 'UNRESOLVED' && row.ownerDomain === key).length,
    ])),
    unresolvedReviewOrder: unresolvedPriority,
    unresolvedReferencedTableCount: Object.keys(unresolvedTableCounts).length,
    unresolvedByReferencedTable: unresolvedTableCounts,
    unresolvedCriticalLineageFiles: criticalLineageRows.length,
    unresolvedCriticalLineageTables: Object.fromEntries(
      [...new Set(criticalLineageRows.flatMap((row) => row.criticalLineageTables))].sort().map((table) => [
        table,
        criticalLineageRows.filter((row) => row.criticalLineageTables.includes(table)).length,
      ]),
    ),
    unresolvedCriticalLineageReadback: Object.fromEntries(
      [...new Set(criticalLineageRows.flatMap((row) => row.criticalLineageReadback.map((item) => item.status)))].sort().map((status) => [
        status,
        criticalLineageRows.filter((row) => row.criticalLineageReadback.some((item) => item.status === status)).length,
      ]),
    ),
  },
  reviewOrder,
  rows,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const tmp = `${reportPath}.tmp-${process.pid}-${Date.now()}`;
fs.writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(tmp, reportPath);
console.log(JSON.stringify({
  reportPath: path.relative(root, reportPath).replaceAll(path.sep, '/'),
  writesPerformed: false,
  counts: report.counts,
}, null, 2));

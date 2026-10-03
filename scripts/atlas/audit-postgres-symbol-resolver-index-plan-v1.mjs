#!/usr/bin/env node
/**
 * Read-only resolver index plan. It records live index definitions, bounded
 * EXPLAIN plans, and a migration proposal. It never creates or changes indexes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = path.join(root, 'docs', 'reports', 'postgres-symbol-resolver-index-plan-v1.json');
const run = (sql, stdin = false) => execFileSync(
  'docker', ['exec', ...(stdin ? ['-i'] : []), 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-qAt', '-F', '|', ...(stdin ? ['-f', '-'] : ['-c', sql])],
  { input: stdin ? sql : undefined, maxBuffer: 1 << 24, timeout: 120000 },
).toString().trim();
const q = (sql) => run(sql);
const rows = (sql) => q(sql).split('\n').filter(Boolean).map((line) => line.split('|'));
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;
const walk = (node, acc = []) => {
  if (!node) return acc;
  acc.push(node['Node Type']);
  for (const child of node.Plans ?? []) walk(child, acc);
  return acc;
};
const explain = (sql) => {
  const payload = run(`BEGIN;\nEXPLAIN (FORMAT JSON) ${sql};\nROLLBACK;\n`, true);
  const plan = JSON.parse(payload)[0]?.Plan ?? {};
  const nodes = [...new Set(walk(plan))];
  return { nodes, usesSeqScan: nodes.includes('Seq Scan'), usesIndex: nodes.some((node) => node.endsWith('Index Scan') || node === 'Index Scan'), usesBitmap: nodes.includes('Bitmap Heap Scan') || nodes.includes('Bitmap Index Scan') };
};

const indexes = rows(`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'atlas_symbol_versions'
  ORDER BY indexname
`).map(([name, definition]) => ({ name, definition }));
const samples = rows(`
  SELECT source_revision, qualified_name
  FROM public.atlas_symbol_versions
  ORDER BY symbol_version_id
  LIMIT 1
`)[0] ?? [];
const sourceRevision = samples[0] ?? null;
const qualifiedName = samples[1] ?? null;
const plans = [];
if (sourceRevision) plans.push({ id: 'source_revision_exact', predicate: 'source_revision = $1', plan: explain(`SELECT symbol_version_id FROM public.atlas_symbol_versions WHERE source_revision = ${lit(sourceRevision)} LIMIT 200`) });
if (qualifiedName) plans.push({ id: 'qualified_name_exact', predicate: 'qualified_name = $1', plan: explain(`SELECT symbol_version_id FROM public.atlas_symbol_versions WHERE qualified_name = ${lit(qualifiedName)} LIMIT 200`) });
if (sourceRevision && qualifiedName) plans.push({ id: 'source_revision_and_qualified_name', predicate: 'source_revision = $1 AND qualified_name = $2', plan: explain(`SELECT symbol_version_id FROM public.atlas_symbol_versions WHERE source_revision = ${lit(sourceRevision)} AND qualified_name = ${lit(qualifiedName)} LIMIT 200`) });

const report = {
  schema: 'atlas.postgres-symbol-resolver-index-plan.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  table: 'public.atlas_symbol_versions',
  estimatedRows: Number(q("SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.atlas_symbol_versions'::regclass")),
  indexes,
  observedQueries: [
    'source_ref = $1 AND source_revision = $2 (existing idx_atlas_symbol_versions_source covers this)',
    'source_revision = $1 (no leading-column index observed)',
    'qualified_name = $1 (no leading-column index observed)',
  ],
  plans,
  proposal: {
    status: 'DRAFT_NOT_APPLIED',
    preferredShape: 'Do not add an index solely because the table contract names a field; select a composite or standalone index only after resolver call-site census and EXPLAIN on production-shaped predicates.',
    candidates: [
      { name: 'atlas_symbol_versions_source_revision_idx', sql: 'CREATE INDEX CONCURRENTLY atlas_symbol_versions_source_revision_idx ON public.atlas_symbol_versions (source_revision);', useWhen: 'Independent revision-only filtering is a real hot query.' },
      { name: 'atlas_symbol_versions_qualified_name_idx', sql: 'CREATE INDEX CONCURRENTLY atlas_symbol_versions_qualified_name_idx ON public.atlas_symbol_versions (qualified_name);', useWhen: 'Independent exact qualified-name lookup is a real hot query.' },
      { name: 'atlas_symbol_versions_source_revision_qualified_name_idx', sql: 'CREATE INDEX CONCURRENTLY atlas_symbol_versions_source_revision_qualified_name_idx ON public.atlas_symbol_versions (source_revision, qualified_name);', useWhen: 'The dominant resolver predicate constrains both columns in this order.' },
    ],
    excluded: [
      'No pg_trgm index proposed: fuzzy qualified-name search is not yet proven as a resolver requirement.',
      'No partial index excluding workspace:0: legacy values must be filtered by authority predicates, never hidden or coerced by index design.',
      'No pgvector index: the existing semantic_768 HNSW owner is separate and already present.',
    ],
  },
  nextGate: 'POSTGRES_SYMBOL_RESOLVER_INDEX_PLAN_PROVEN',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath: path.relative(root, reportPath).replaceAll(path.sep, '/'), estimatedRows: report.estimatedRows, indexCount: indexes.length, plans: plans.map((item) => `${item.id}:${item.plan.nodes.join(',')}`), status: report.proposal.status }, null, 2));

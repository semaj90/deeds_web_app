#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv(resolve('.'));

const registryPath = resolve('configs/atlas-glyph-label-registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 1,
  connectionTimeoutMillis: 3000,
  statement_timeout: 10000,
});

const { rows: glyphRows } = await pool.query(`
  select glyph_type as value, count(*)::int as rows
  from atlas_svg_glyphs
  group by glyph_type
  order by rows desc, glyph_type
`);
const { rows: labelRows } = await pool.query(`
  select 'domain_class' as kind, domain_class as value, count(*)::int as rows
  from atlas_retrieval_eval_times
  where domain_class is not null
  group by domain_class
  union all
  select 'ontology_label', ontology_label, count(*)::int
  from atlas_retrieval_eval_times
  where ontology_label is not null
  group by ontology_label
  union all
  select 'topology_label', topology_label, count(*)::int
  from atlas_retrieval_eval_times
  where topology_label is not null
  group by topology_label
  order by kind, value
`);
const { rows: [joinCoverage] } = await pool.query(`
  select
    count(*)::int as total,
    count(g.id)::int as matched
  from atlas_higher_hop_index h
  left join atlas_svg_glyphs g on g.id = h.glyph_record_id
`);
await pool.end();

const surfaces = [
  ...glyphRows.map((row) => ({ kind: 'glyph_type', ...row })),
  ...labelRows,
];
const mapped = [];
const missing = [];
for (const surface of surfaces) {
  const entry = registry[surface.kind]?.[surface.value];
  if (entry?.icon && entry?.class) mapped.push({ ...surface, ...entry });
  else missing.push(surface);
}
const totalObservedRows = surfaces.reduce((sum, row) => sum + Number(row.rows), 0);
const mappedRows = mapped.reduce((sum, row) => sum + Number(row.rows), 0);
const report = {
  generatedAt: new Date().toISOString(),
  status: missing.length === 0 && Number(joinCoverage.matched) === Number(joinCoverage.total)
    ? 'READY'
    : 'PARTIAL',
  registryVersion: registry.version,
  glyphJoin: {
    total: Number(joinCoverage.total),
    matched: Number(joinCoverage.matched),
    pct: Number(joinCoverage.total)
      ? Number((Number(joinCoverage.matched) / Number(joinCoverage.total) * 100).toFixed(2))
      : 0,
  },
  labelCoverage: {
    observedRows: totalObservedRows,
    mappedRows,
    pct: totalObservedRows ? Number((mappedRows / totalObservedRows * 100).toFixed(2)) : 0,
  },
  mapped,
  missing,
  fallback: registry.fallback,
};

const reportDir = resolve('docs/reports');
mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(reportDir, 'glyph-label-coverage-audit.json'), JSON.stringify(report, null, 2));
writeFileSync(resolve(reportDir, 'glyph-label-coverage-audit.md'), `# Glyph Label Coverage Audit

- Generated: ${report.generatedAt}
- Status: ${report.status}
- Higher-hop glyph join: ${report.glyphJoin.matched}/${report.glyphJoin.total} (${report.glyphJoin.pct}%)
- Observed label rows mapped: ${report.labelCoverage.mappedRows}/${report.labelCoverage.observedRows} (${report.labelCoverage.pct}%)
- Missing labels: ${report.missing.length}

The registry uses Lucide icon names and statically visible UnoCSS class strings.
Unknown future labels use the documented fallback and remain visible in this
audit until explicitly mapped.
`);

console.log(JSON.stringify(report, null, 2));

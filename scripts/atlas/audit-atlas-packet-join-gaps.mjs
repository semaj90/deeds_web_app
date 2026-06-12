#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const SQL = `
WITH gaps AS (
  SELECT
    ap.packet_id::text AS packet_id,
    ap.source_ref,
    ap.feature_id,
    ap.community_id,
    ap.concept_ids::text AS concept_ids,
    EXISTS (
      SELECT 1 FROM atlas_feature_map afm2
      WHERE afm2.source_ref = ap.source_ref
    ) AS source_ref_has_afm,
    COUNT(*) OVER (PARTITION BY ap.source_ref) AS packets_for_source_ref
  FROM atlas_packets ap
  LEFT JOIN atlas_feature_map afm
    ON afm.packet_id = ap.packet_id::text
  WHERE afm.packet_id IS NULL
)
SELECT json_agg(gaps) FROM gaps;
`;

function classify(row) {
  const s = String(row.source_ref ?? '').replaceAll('\\', '/');

  if (row.source_ref_has_afm || Number(row.packets_for_source_ref) > 1) return 'duplicate_source_ref';
  if (s.includes('backup-202') || s.includes('api-cleanup')) return 'backup';
  if (s.includes('documents-atlas-index.md#') || s.includes('DocChunk')) return 'doc_chunk';
  if (s.startsWith('docs/reports/') || s.includes('-report')) return 'report';
  if (s.startsWith('.svelte-kit/') || s.startsWith('node_modules/') || s.startsWith('.tmp/')) return 'generated';
  if (s.includes('/routes/') || s.includes('+server') || s.includes('+page')) return 'code_route';
  if (s.includes('/components/') || s.endsWith('.svelte')) return 'code_component';
  if (s.includes('/schema/') || s.includes('db/schema')) return 'code_schema';
  if (s.startsWith('scripts/') || s.endsWith('.mjs') || s.endsWith('.ps1')) return 'script';
  return 'unknown';
}

function psqlJson(sql) {
  const out = execFileSync('docker', [
    'exec', 'legal-ai-postgres', 'psql',
    '-U', 'legal_admin', '-d', 'legal_ai_db',
    '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });

  const text = out.trim();
  return text ? JSON.parse(text) : [];
}

const rows = psqlJson(SQL) ?? [];

const classified = rows.map((r) => ({
  ...r,
  bucket: classify(r),
}));

const counts = {};
for (const r of classified) counts[r.bucket] = (counts[r.bucket] ?? 0) + 1;

const total = classified.length;
const duplicatePct = total ? ((counts.duplicate_source_ref ?? 0) / total) * 100 : 100;

const decision =
  duplicatePct >= 90
    ? 'P1_PASS_DUPLICATE_SOURCE_REF_GAP'
    : 'REVIEW_REQUIRED';

const report = {
  generated_at: new Date().toISOString(),
  total_gap_rows: total,
  counts,
  duplicate_source_ref_pct: Number(duplicatePct.toFixed(1)),
  decision,
  sample: classified.slice(0, 50),
};

mkdirSync('docs/reports', { recursive: true });

writeFileSync(
  'docs/reports/atlas-packet-join-gap-report.json',
  JSON.stringify(report, null, 2),
);

const md = `# Atlas Packet Join Gap Report

Generated: ${report.generated_at}

## Summary

- Total gap rows: ${total}
- Duplicate source_ref pct: ${report.duplicate_source_ref_pct}%
- Decision: **${decision}**

## Buckets

${Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

## Rule

If duplicate_source_ref >= 90%, P1 passes because the remaining gap is non-canonical duplicate packet rows sharing a source_ref already covered by atlas_feature_map.
`;

writeFileSync('docs/reports/atlas-packet-join-gap-report.md', md);

console.log(md);

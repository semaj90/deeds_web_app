#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, toPosixPath, writeJson, writeMarkdown } from './_atlas-utils.mjs';
import { normalizeRef } from './normalize-source-ref-id.mjs';

const OUT_DIR = path.join(REPO_ROOT, 'memory', 'exports', 'atlas');
const BUNDLE_MANIFEST = path.join(OUT_DIR, 'parent-atlas-export-bundle-manifest.json');
const NORMALIZED_PREVIEW = path.join(REPO_ROOT, '.tmp', 'source-ref-normalization-preview.jsonl');
const SCHEMA_MAP = path.join(OUT_DIR, 'drizzle-schema-map.jsonl');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'duckdb-parent-atlas-audit.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'duckdb-parent-atlas-audit.md');
const FINDINGS_JSONL = path.join(OUT_DIR, 'duckdb-parent-atlas-audit-findings.jsonl');

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { _raw: line };
      }
    });
}

function classifySourceRef(ref) {
  const s = String(ref ?? '').replace(/\\/g, '/');
  if (s.includes('#chunk-')) return 'doc_chunk';
  if (s.startsWith('src/') || s.startsWith('$lib/') || s.startsWith('sveltekit-frontend/src/')) return 'code_file';
  if (s.startsWith('docs/reports/') || s.startsWith('reports/')) return 'generated_report';
  if (s.startsWith('memory/exports/')) return 'memory_export';
  if (s.startsWith('neschrom97/cards/')) return 'neschrom_card';
  return 'unknown';
}

function basenameOf(ref) {
  const s = String(ref ?? '').replace(/\\/g, '/');
  return s.split('/').pop() ?? s;
}

function main() {
  const bundle = readJson(BUNDLE_MANIFEST, { files: [] });
  const schemaRows = readJsonl(SCHEMA_MAP);
  const normalizedRows = readJsonl(NORMALIZED_PREVIEW);
  const inventory = new Map();
  for (const file of bundle.files ?? []) {
    inventory.set(file.normalizedPath, file);
  }

  const findings = [];
  const ambiguous = normalizedRows.filter((row) => Array.isArray(row.normalizedCandidates) && row.normalizedCandidates.length > 1);
  const matched = [];
  const unmatched = [];
  const kindCounts = {};
  const relevantKinds = new Set(['code_file', 'doc_chunk', 'generated_report', 'memory_export', 'neschrom_card']);
  const relevantMatched = [];
  const relevantUnmatched = [];

  for (const row of normalizedRows) {
    const kind = classifySourceRef(row.originalRef);
    kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;
    const normalizedCandidates = Array.isArray(row.normalizedCandidates) ? row.normalizedCandidates : [];
    const matchedCandidate = normalizedCandidates.find((candidate) => inventory.has(candidate));
    if (matchedCandidate) {
      matched.push({ ...row, matchedCandidate, kind });
      if (relevantKinds.has(kind)) relevantMatched.push({ ...row, matchedCandidate, kind });
      continue;
    }
    unmatched.push({ ...row, kind });
    if (relevantKinds.has(kind)) relevantUnmatched.push({ ...row, kind });
  }

  for (const row of ambiguous.slice(0, 100)) {
    findings.push({
      type: 'ambiguous_source_ref',
      originalRef: row.originalRef,
      normalizedCandidates: row.normalizedCandidates,
      sources: row.sources ?? [],
    });
  }

  for (const row of unmatched.slice(0, 250)) {
    findings.push({
      type: 'unmatched_source_ref',
      originalRef: row.originalRef,
      normalizedCandidates: row.normalizedCandidates ?? [],
      kind: row.kind,
      basename: basenameOf(row.originalRef),
    });
  }

  const suffixCounts = new Map();
  for (const row of unmatched) {
    const suffix = basenameOf(row.originalRef);
    suffixCounts.set(suffix, (suffixCounts.get(suffix) ?? 0) + 1);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    bundleFiles: bundle.files?.length ?? 0,
    schemaTables: schemaRows.length,
    sourceRefRows: normalizedRows.length,
    matchedRows: matched.length,
    unmatchedRows: unmatched.length,
    ambiguousRows: ambiguous.length,
    relevantKinds: [...relevantKinds],
    relevantRows: relevantMatched.length + relevantUnmatched.length,
    relevantMatchedRows: relevantMatched.length,
    relevantUnmatchedRows: relevantUnmatched.length,
    relevantMatchRate: relevantMatched.length + relevantUnmatched.length > 0
      ? Number(((relevantMatched.length / (relevantMatched.length + relevantUnmatched.length)) * 100).toFixed(2))
      : 0,
    kindCounts,
    topUnmatchedSuffixes: [...suffixCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([suffix, count]) => ({ suffix, count })),
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeJson(REPORT_JSON, report);
  writeMarkdown(REPORT_MD, [
    '# DuckDB Parent Atlas Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Bundle files: ${report.bundleFiles}`,
    `- Schema tables: ${report.schemaTables}`,
    `- SourceRef rows: ${report.sourceRefRows}`,
    `- Matched rows: ${report.matchedRows}`,
    `- Unmatched rows: ${report.unmatchedRows}`,
    `- Ambiguous rows: ${report.ambiguousRows}`,
    `- Relevant rows: ${report.relevantRows}`,
    `- Relevant matched rows: ${report.relevantMatchedRows}`,
    `- Relevant unmatched rows: ${report.relevantUnmatchedRows}`,
    `- Relevant match rate: ${report.relevantMatchRate}%`,
    '',
    '## Top Unmatched Suffixes',
    '',
    ...report.topUnmatchedSuffixes.map((row) => `- ${row.suffix}: ${row.count}`),
    '',
    '## Notes',
    '',
    '- This audit is read-only. It does not mutate Postgres, Qdrant, Redis, Neo4j, DuckDB, or packet files.',
    '- It treats the bundle manifest and normalized sourceRef catalog as the dry-run join surface.',
  ].join('\n'));
  fs.writeFileSync(FINDINGS_JSONL, findings.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Wrote ${FINDINGS_JSONL}`);
}

main();

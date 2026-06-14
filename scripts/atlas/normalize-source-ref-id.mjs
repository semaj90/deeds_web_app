#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_PREVIEW = '.tmp/source-ref-normalization-preview.jsonl';
const DEFAULT_REPORT = '.tmp/source-ref-normalization-report.md';
const WIDE_DEFAULT_INPUTS = [
  '.opencode/outcome-ledger.ndjson',
  '.tmp/ast-neo4j-dryrun.json',
  '.tmp/phase19b-cache-config-join-debug.json',
  'memory/exports/atlas/parent-atlas-export-bundle-manifest.json',
  'memory/exports/atlas/parent-atlas-export-bundle.jsonl',
  'memory/exports/atlas/drizzle-schema-map.jsonl',
  'memory/exports/atlas/duckdb-parent-atlas-audit-findings.jsonl',
  'memory/exports/atlas/training-rows.jsonl',
  'docs/reports/ignored-directory-audit.json',
  'docs/reports/artifact-bloat-report.json',
  'docs/reports/backfill-som-community-id.json',
  'docs/reports/concept-evidence-spine-backfill.json',
  'docs/reports/seed-neo4j-used-concept-edges.json',
  'docs/reports/upsert-qdrant-packet-payload.json',
  'docs/reports/atlas-feature-map-duckdb-report.json',
  'docs/reports/atlas-packet-join-gap-report.json',
  'docs/reports/codebase-semantics-neo4j-report.json',
  'docs/reports/doc-feature-crosswalk-2026-06-01.json',
  'docs/reports/directory-topology-map.json',
  'docs/reports/feature-lineage-verification.json',
  'docs/reports/gitignored-folder-summary-2026-06-01.json',
  'docs/reports/parent-atlas-production-readiness-report.json',
  'docs/reports/parent-atlas-export-bundle-report.json',
  'docs/reports/duckdb-parent-atlas-audit.json',
  'docs/reports/recommendation-merge-audit-report.json',
  'sveltekit-frontend/docs/reports/feature-lineage-report.json',
  'sveltekit-frontend/docs/reports/runtime-packet-density-report.json',
  'sveltekit-frontend/docs/reports/postgres-contract-mirrors-report.json',
  'sveltekit-frontend/docs/reports/contextual-tree-readiness-report.json',
  'sveltekit-frontend/docs/reports/live-service-env-report.json',
  'sveltekit-frontend/docs/reports/hidden-packet-pathmap-report.json',
  'sveltekit-frontend/docs/reports/hidden-packet-pathmap-duckdb-report.json',
].filter((input) => fs.existsSync(input));
const OPEN_LANES_DEFAULT_INPUTS = [
  '.opencode/outcome-ledger.ndjson',
  '.opencode/recommendations/recommendations.json',
  '.opencode/recommendations/recommendations.md',
  '.opencode/startup-briefing.json',
  '.opencode/startup-briefing.md',
  '.tmp/feature_labels.jsonl',
  '.tmp/kanban_tasks.jsonl',
  '.tmp/phase-lane-completion.json',
  '.tmp/parent_atlas_packets/parent-atlas-packets.ndjson',
  'docs/reports/parent-atlas-export-bundle-report.json',
  'docs/reports/recommendation-merge-audit-report.json',
  'docs/reports/artifact-bloat-report.json',
  'docs/reports/feature-lineage-verification.json',
  'docs/reports/parent-atlas-production-readiness-report.json',
  'docs/reports/contextual-tree-readiness-report.json',
  'docs/reports/live-service-env-report.json',
  'docs/reports/hidden-packet-pathmap-duckdb-report.json',
  'sveltekit-frontend/docs/reports/feature-lineage-report.json',
  'sveltekit-frontend/docs/reports/runtime-packet-density-report.json',
  'sveltekit-frontend/docs/reports/postgres-contract-mirrors-report.json',
  'sveltekit-frontend/docs/reports/hidden-packet-pathmap-report.json',
].filter((input) => fs.existsSync(input));
const MAIN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_PATH = path.resolve(fileURLToPath(import.meta.url));
const IS_MAIN = MAIN_PATH === THIS_PATH;

export function sha256hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function normalizeRef(value, repoRoot = process.cwd()) {
  if (value === null || value === undefined) return '';
  let s = String(value).trim();
  if (!s) return '';

  // Reject audit warning labels — not source paths
  if (/^Audit Report:/i.test(s) || /\[unsafe_/i.test(s) || / warning detected/i.test(s)) return '';
  // Reject strings where a space appears before any path separator (log messages)
  const firstSlash = s.indexOf('/');
  const firstSpace = s.indexOf(' ');
  if (firstSpace !== -1 && (firstSlash === -1 || firstSpace < firstSlash)) return '';

  const root = String(repoRoot).replaceAll('\\', '/');
  s = s.replace(/^file:\/\//i, '').replace(/^file:/i, '');
  s = s.replace(/\\/g, '/');
  s = s.replace(/^\[\s*["']?/, '');
  s = s.replace(/["']?\s*\]$/, '');
  s = s.replace(/^["']+|["']+$/g, '');
  s = s.replace(/^\.?\//, '');
  s = s.replace(/#L\d+(?:-L\d+)?$/i, '');
  s = s.replace(/:\d+(?::\d+)?$/i, '');
  s = s.replace(/\/+/g, '/');

  const prefixes = [
    `${root}/`,
    'sveltekit-frontend/',
    './sveltekit-frontend/',
    'src/',
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of prefixes) {
      const normalizedPrefix = prefix.replaceAll('\\', '/');
      if (normalizedPrefix && s.toLowerCase().startsWith(normalizedPrefix.toLowerCase())) {
        s = s.slice(normalizedPrefix.length);
        changed = true;
        break;
      }
    }
  }

  s = s.replace(/(^|\/)src\/src\//gi, '$1src/');
  s = s.replace(/^\/+|\/+$/g, '');
  return s;
}

function isSyntheticAuditWarningRef(value) {
  const s = String(value ?? '').trim();
  return s === 'Audit Report: [unsafe_drizzle_update_delete] warning detected'
    || /^Audit Report:/i.test(s)
    || /\[unsafe_/i.test(s)
    || / warning detected/i.test(s);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readNdjson(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const [index, line] of lines.entries()) {
    try {
      out.push({ value: JSON.parse(line), line: index + 1, raw: line });
    } catch {
      out.push({ value: { _raw: line }, line: index + 1, raw: line, invalid: true });
    }
  }
  return out;
}

function collectFilesRecursively(inputPaths) {
  const allowed = new Set(['.json', '.jsonl', '.ndjson']);
  const ignoreDirs = new Set(['node_modules', '.git', '.svelte-kit', '.vite', 'dist', 'build']);
  const out = [];
  const seen = new Set();

  const pushFile = (filePath) => {
    const resolved = path.resolve(filePath);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    out.push(resolved);
  };

  const walk = (target) => {
    if (!fs.existsSync(target)) return;
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        if (ignoreDirs.has(entry.name)) continue;
        walk(path.join(target, entry.name));
      }
      return;
    }
    if (allowed.has(path.extname(target).toLowerCase())) pushFile(target);
  };

  for (const input of inputPaths) walk(input);
  return out;
}

function extractRefsFromValue(value, refs) {
  const keyPattern = /^(sourceRefs?|source_ref|source_refs|filePath|file_path|relative_path|relPath|path|source)$/i;
  const containerPattern = /^(files?|directories?|rows?|records?|entries?|items?|samples?|sample_files|sampleFiles|cards?|packets?|nodes?|edges?|tables?|columns?)$/i;

  function visit(node, active = false) {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      if (active && !isSyntheticAuditWarningRef(node)) refs.add(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, active);
      return;
    }
    if (!isObject(node)) return;

    for (const [key, nested] of Object.entries(node)) {
      const nextActive = active || keyPattern.test(key);
      if (nextActive) {
        visit(nested, true);
      } else if (containerPattern.test(key)) {
        visit(nested, false);
      }
    }
  }

  visit(value, false);
}

export function analyzeSourceRefInputs(inputPaths, { repoRoot = process.cwd() } = {}) {
  const files = collectFilesRecursively(inputPaths);
  const grouped = new Map();
  const sources = new Map();

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const fileRefs = new Set();

    try {
      if (ext === '.ndjson' || ext === '.jsonl') {
        for (const row of readNdjson(filePath)) {
          extractRefsFromValue(row.value, fileRefs);
          if (row.invalid) fileRefs.add(`__invalid_row__:${path.relative(repoRoot, filePath)}:${row.line}`);
        }
      } else {
        const parsed = readJson(filePath);
        if (parsed !== null) extractRefsFromValue(parsed, fileRefs);
      }
    } catch {
      // ignore unreadable files in dry-run mode
    }

    for (const original of fileRefs) {
      if (!grouped.has(original)) grouped.set(original, { originals: new Set(), normals: new Set(), sources: new Set() });
      const entry = grouped.get(original);
      entry.originals.add(original);
      const normalized = original.startsWith('__invalid_row__:') ? '' : normalizeRef(original, repoRoot);
      if (normalized) entry.normals.add(normalized);
      entry.sources.add(path.relative(repoRoot, filePath).replaceAll('\\', '/'));
      sources.set(original, entry);
    }
  }

  const rows = [];
  for (const [originalRef, data] of grouped.entries()) {
    const normalizedCandidates = [...data.normals];
    rows.push({
      originalRef,
      normalizedCandidates,
      normalized: normalizedCandidates.length === 1 ? normalizedCandidates[0] : null,
      sourceRefId: normalizedCandidates.length === 1 ? sha256hex(normalizedCandidates[0]) : null,
      sources: [...data.sources],
    });
  }

  rows.sort((a, b) => a.originalRef.localeCompare(b.originalRef));
  return {
    files,
    rows,
    summary: {
      inputCount: files.length,
      totalRefs: rows.length,
      uniqueNormalizedRefs: new Set(rows.flatMap((row) => row.normalizedCandidates)).size,
      ambiguousRefs: rows.filter((row) => row.normalizedCandidates.length > 1).length,
    },
  };
}

function parseArgs(argv) {
  const out = { inputs: [], preview: DEFAULT_PREVIEW, report: DEFAULT_REPORT, dryRun: false, wide: false, lanes: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) {
      out.inputs.push(argv[++i]);
    } else if (arg === '--out' && argv[i + 1]) {
      out.preview = argv[++i];
    } else if (arg === '--report' && argv[i + 1]) {
      out.report = argv[++i];
    } else if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--wide') {
      out.wide = true;
    } else if (arg === '--lanes' && argv[i + 1]) {
      out.lanes = String(argv[++i]).trim().toLowerCase();
    } else if (arg.startsWith('--lanes=')) {
      out.lanes = arg.slice('--lanes='.length).trim().toLowerCase();
    }
  }
  return out;
}

function formatReport(result, inputs) {
  const lines = [
    '# SourceRef Normalization Report',
    '',
    `Run at: ${new Date().toISOString()}`,
    '',
    `Inputs scanned: ${inputs.length ? inputs.join(', ') : '(defaults)'}`,
    '',
    `Total refs scanned: ${result.summary.totalRefs}`,
    `Unique normalized refs: ${result.summary.uniqueNormalizedRefs}`,
    `Ambiguous refs: ${result.summary.ambiguousRefs}`,
    '',
    '## Ambiguous examples',
    '',
  ];
  for (const row of result.rows.filter((r) => r.normalizedCandidates.length > 1).slice(0, 20)) {
    lines.push(`- ${row.originalRef} -> ${row.normalizedCandidates.join(' | ')}`);
  }
  lines.push('', '## Notes', '', '- This is a dry-run identity pass. No DB or vector writes were performed.', '- If normalized is null, the row had multiple normalized candidates or was invalid.');
  return lines.join('\n');
}

function writeOutputs(result, args) {
  fs.mkdirSync(path.dirname(args.preview), { recursive: true });
  fs.mkdirSync(path.dirname(args.report), { recursive: true });
  fs.writeFileSync(args.preview, result.rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(args.report, formatReport(result, args.inputs), 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const defaultInputs = [
    '.opencode/outcome-ledger.ndjson',
    '.tmp/ast-neo4j-dryrun.json',
    '.tmp/phase19b-cache-config-join-debug.json',
  ].filter((filePath) => fs.existsSync(filePath));
  const inputs = args.inputs.length > 0
    ? args.inputs
    : args.lanes === 'open'
      ? OPEN_LANES_DEFAULT_INPUTS
      : args.wide
      ? [...new Set([...WIDE_DEFAULT_INPUTS, ...defaultInputs])]
      : defaultInputs;
  const result = analyzeSourceRefInputs(inputs);
  writeOutputs(result, args);
  console.log(`Normalization preview written to ${args.preview}`);
  console.log(`Report written to ${args.report}`);
  return result;
}

if (IS_MAIN) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

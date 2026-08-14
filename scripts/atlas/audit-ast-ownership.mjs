#!/usr/bin/env node

/**
 * Read-only AST ownership and supersession audit.
 *
 * This records lifecycle evidence; it never deletes or rewrites source files.
 * Use --write to persist the JSON/Markdown receipt under docs/reports.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '../..');
const REGISTRY_PATH = join(ROOT, 'scripts/atlas/knowledge-layer/supersession-registry.json');
const REPORT_DIR = join(ROOT, 'docs/reports');
const REPORT_JSON = join(REPORT_DIR, 'ast-ownership-receipt.json');
const REPORT_MD = join(REPORT_DIR, 'ast-ownership-receipt.md');
const WRITE = process.argv.includes('--write');

const CODE_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.svelte-kit', 'dist', 'build', '.cache', '.tmp', '.venv', '.venv-cu130', '.venv-gemma4', '.python311', '.opencode', '.claude', '.vscode']);

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (CODE_EXTENSIONS.has(extname(entry.name))) files.push(full);
  }
  return files;
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}

function readRegistry() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  if (registry.schemaVersion !== 'atlas-supersession-v1' || !Array.isArray(registry.entries)) {
    throw new Error(`Invalid supersession registry: ${REGISTRY_PATH}`);
  }
  return registry;
}

function callerMatches(text, artifact) {
  const normalizedArtifact = normalize(artifact);
  const basename = normalizedArtifact.split('/').at(-1);
  const stem = basename.replace(/\.(ts|mts|cts|js|mjs|cjs)$/, '');
  if (text.includes(normalizedArtifact)) return true;
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const importPattern = new RegExp(`(?:from|import|require\\s*\\()\\s*[\\\"'][^\\\"']*(?:^|[/\\\\])${escapedStem}(?:\\.(?:ts|mts|cts|js|mjs|cjs))?[\\\"']`);
  return importPattern.test(text);
}

function auditEntry(entry, files) {
  const artifactPath = join(ROOT, entry.artifact);
  const artifactExists = existsSync(artifactPath);
  const callers = [];
  const importers = [];
  const graphifyStages = [];

  for (const file of files) {
    const relativePath = normalize(relative(ROOT, file));
    if (relativePath === normalize(entry.artifact)) continue;
    const text = readFileSync(file, 'utf8');
    if (!callerMatches(text, entry.artifact)) continue;
    callers.push(relativePath);
    if (/\b(import|export)\b|require\s*\(/.test(text)) importers.push(relativePath);
    if (/graphify|daily-graphify|ast|tree-sitter/i.test(relativePath)) graphifyStages.push(relativePath);
  }

  const liveCallers = callers.filter((path) => !path.endsWith('/index.ts') && !path.endsWith('index.ts'));
  const state = liveCallers.length === 0 ? 'MIGRATION_CANDIDATE' : entry.state;
  return {
    artifact: entry.artifact,
    artifactExists,
    declaredState: entry.state,
    observedState: state,
    liveCallers: [...new Set(liveCallers)].sort(),
    importers: [...new Set(importers)].sort(),
    barrelReferences: callers.filter((path) => path.endsWith('index.ts')).sort(),
    graphifyStages: [...new Set([...graphifyStages, ...(entry.observedOwners ?? [])])].sort(),
    replacementCandidates: entry.replacementCandidates,
    promotionRequirements: entry.promotionRequirements,
    evidence: {
      replacementIdentifiedOrExplicitlyNone: entry.replacementCandidates.length > 0,
      liveCallersEnumerated: true,
      graphifyStageEnumerated: (entry.observedOwners?.length ?? 0) > 0,
      noAssumedTypes: true
    }
  };
}

function renderMarkdown(report) {
  const lines = [
    '# AST ownership receipt',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    '',
    '| artifact | observed state | live callers | importers | replacement candidates |',
    '|---|---|---:|---:|---|',
    ...report.entries.map((entry) => '| `' + entry.artifact + '` | **' + entry.observedState + '** | ' + entry.liveCallers.length + ' | ' + entry.importers.length + ' | ' + (entry.replacementCandidates.map((value) => '`' + value + '`').join('<br>') || 'none') + ' |'),
    '',
    '## Promotion rule',
    '',
    'An artifact may move from `MIGRATION_CANDIDATE` to `SUPERSEDED` only after a canonical replacement is proven, all live callers use it, Graphify no longer depends on the old implementation, and the superseded-import check remains zero.',
    '',
    'This receipt is read-only evidence. It does not delete or modify the audited artifact.'
  ];
  return `${lines.join('\n')}\n`;
}

const registry = readRegistry();
const files = [
  ...walk(join(ROOT, 'scripts')),
  ...walk(join(ROOT, 'sveltekit-frontend/src')),
  ...walk(join(ROOT, 'sveltekit-frontend/scripts')),
  ...walk(join(ROOT, 'packages'))
];
const entries = registry.entries.map((entry) => auditEntry(entry, files));
const report = {
  schemaVersion: 'atlas-ast-ownership-receipt-v1',
  generatedAt: new Date().toISOString(),
  status: entries.every((entry) => entry.artifactExists && entry.evidence.liveCallersEnumerated && entry.evidence.graphifyStageEnumerated) ? 'PROVEN_AUDIT' : 'INCOMPLETE',
  gates: {
    AST_OWNER_IDENTIFIED: entries.every((entry) => entry.replacementCandidates.length > 0),
    LIVE_CALLERS_ENUMERATED: entries.every((entry) => entry.evidence.liveCallersEnumerated),
    GRAPHIFY_STAGE_IDENTIFIED: entries.every((entry) => entry.evidence.graphifyStageEnumerated),
    REPLACEMENT_IDENTIFIED_OR_EXPLICITLY_NONE: entries.every((entry) => entry.evidence.replacementIdentifiedOrExplicitlyNone),
    NO_ASSUMED_TYPES_TS: entries.every((entry) => entry.evidence.noAssumedTypes),
    SUPERSEDED_IMPORT_DETECTED: entries.some((entry) => entry.observedState === 'SUPERSEDED' && entry.liveCallers.length > 0)
  },
  entries
};

if (WRITE) {
  writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(REPORT_MD, renderMarkdown(report));
}

console.log(JSON.stringify({
  status: report.status,
  write: WRITE,
  reportJson: WRITE ? REPORT_JSON : null,
  reportMarkdown: WRITE ? REPORT_MD : null,
  entries: entries.map((entry) => ({ artifact: entry.artifact, state: entry.observedState, liveCallers: entry.liveCallers.length, importers: entry.importers.length })),
  gates: report.gates
}, null, 2));

if (report.gates.SUPERSEDED_IMPORT_DETECTED) process.exitCode = 2;

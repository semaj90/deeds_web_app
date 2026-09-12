#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '../..');
const REPORT = path.join(ROOT, 'docs/reports/repo-topology-index-scope-v1.json');
const noReport = process.argv.includes('--no-report');

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx',
  '.java', '.kt', '.kts', '.cs', '.swift', '.svelte', '.vue', '.sql', '.proto',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.wasm', '.wat', '.wgsl', '.glsl',
]);

const GOVERNANCE_EXTENSIONS = new Set(['.md', '.mdx', '.yaml', '.yml', '.json', '.toml']);

const HARD_EXCLUDE_SEGMENTS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.svelte-kit', '.next', '.nuxt',
  '.cache', '.tmp', 'coverage', '.venv', 'venv', '__pycache__', 'target',
  '.turbo', '.vite', 'artifacts', 'snapshots',
]);

const LOW_VALUE_PREFIXES = [
  'docs/reports/',
  'reports/',
  'archive/',
  'backups/',
  'backup/',
  'coverage/',
];

const HIGH_VALUE_GOVERNANCE_PREFIXES = [
  'openspec/',
  'docs/architecture/',
  '.claude/',
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const slash = (value) => value.replaceAll('\\', '/');

function gitTrackedFiles() {
  const raw = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  return raw.split('\0').filter(Boolean).map(slash).sort();
}

function rgVisibleFiles() {
  try {
    const raw = execFileSync('rg', ['--files', '-0'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
    return raw.split('\0').filter(Boolean).map(slash).sort();
  } catch {
    return [];
  }
}

function parentDirectories(filePath) {
  const parts = slash(filePath).split('/');
  const dirs = [];
  for (let i = 1; i < parts.length; i += 1) dirs.push(parts.slice(0, i).join('/'));
  return dirs;
}

function containsHardExcludedSegment(filePath) {
  return slash(filePath).split('/').some((segment) => HARD_EXCLUDE_SEGMENTS.has(segment));
}

function classify(filePath) {
  const normalized = slash(filePath);
  const ext = path.extname(normalized).toLowerCase();
  if (containsHardExcludedSegment(normalized)) return { lane: 'EXCLUDED_RUNTIME_OR_BUILD', reason: 'hard-excluded-segment' };
  if (LOW_VALUE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return { lane: 'GENERATED_OR_HISTORICAL_EVIDENCE', reason: 'report-archive-backup' };
  if (CODE_EXTENSIONS.has(ext)) return { lane: 'CODE_TOPOLOGY', reason: 'source-extension' };
  if (HIGH_VALUE_GOVERNANCE_PREFIXES.some((prefix) => normalized.startsWith(prefix)) && GOVERNANCE_EXTENSIONS.has(ext)) {
    return { lane: 'GOVERNANCE_CONTEXT', reason: 'governance-or-architecture' };
  }
  if (GOVERNANCE_EXTENSIONS.has(ext)) return { lane: 'DOCUMENT_CONTEXT_OPTIONAL', reason: 'document-or-config' };
  return { lane: 'OTHER_TRACKED', reason: 'not-index-eligible-by-default' };
}

function summarize(files) {
  const directorySet = new Set();
  const byLane = new Map();
  const topLevel = new Map();
  const eligibleFiles = [];
  const graphRagFiles = [];

  for (const filePath of files) {
    for (const dir of parentDirectories(filePath)) directorySet.add(dir);
    const lane = classify(filePath);
    const top = filePath.includes('/') ? filePath.split('/')[0] : '(root)';
    topLevel.set(top, (topLevel.get(top) ?? 0) + 1);
    byLane.set(lane.lane, (byLane.get(lane.lane) ?? 0) + 1);
    if (lane.lane === 'CODE_TOPOLOGY' || lane.lane === 'GOVERNANCE_CONTEXT') eligibleFiles.push(filePath);
    if (lane.lane === 'CODE_TOPOLOGY' || lane.lane === 'GOVERNANCE_CONTEXT' || lane.lane === 'DOCUMENT_CONTEXT_OPTIONAL') graphRagFiles.push(filePath);
  }

  const eligibleDirs = new Set(eligibleFiles.flatMap(parentDirectories));
  const graphRagDirs = new Set(graphRagFiles.flatMap(parentDirectories));

  return {
    trackedFileCount: files.length,
    trackedDirectoryCount: directorySet.size,
    codeAndGovernanceEligibleFileCount: eligibleFiles.length,
    codeAndGovernanceEligibleDirectoryCount: eligibleDirs.size,
    graphRagCandidateFileCount: graphRagFiles.length,
    graphRagCandidateDirectoryCount: graphRagDirs.size,
    byLane: Object.fromEntries([...byLane.entries()].sort(([a], [b]) => a.localeCompare(b))),
    topLevelTrackedFileCounts: Object.fromEntries([...topLevel.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  };
}

const tracked = gitTrackedFiles();
const rgFiles = rgVisibleFiles();
const summary = summarize(tracked);
const rgTrackedOverlap = new Set(rgFiles.filter((file) => tracked.includes(file)));

const deterministic = {
  schema: 'atlas.repo-topology-index-scope.v1',
  gate: 'REPO-TOPOLOGY-INDEX-SCOPE-01',
  mode: 'READ_ONLY',
  root: ROOT,
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  gitTracked: summary,
  rgVisibility: {
    rgAvailable: rgFiles.length > 0,
    visibleFileCount: rgFiles.length,
    trackedVisibleFileCount: rgTrackedOverlap.size,
    trackedHiddenFromRgCount: Math.max(0, tracked.length - rgTrackedOverlap.size),
  },
  scopePolicy: {
    codeTopology: 'AST/CST/LSP/import/call/type/test structure; eligible for graph/topology extraction',
    governanceContext: 'OpenSpec/architecture/agent rules; eligible for document GraphRAG context, not code identity',
    documentContextOptional: 'configuration/docs; opt-in for GraphRAG text context, never code topology authority',
    generatedHistoricalEvidence: 'reports/archive/backup; searchable evidence only, excluded from canonical code topology by default',
    excludedRuntimeOrBuild: 'runtime/build/cache/generated directories; never GraphRAG/code topology input',
  },
  proposedDerivedRepresentations: {
    semantic: 'one semantic_768 logical lane; Qdrant is derived ANN, PostgreSQL is canonical lineage/evidence',
    topology: 'SOM/KMeans/PageRank/community/manifold coordinates are payload/features, not separate semantic owners',
    ontology: 'OntologyLinkedTupleV1/n-ary relations remain structured canonical evidence; graph/vector forms are projections',
    graphrag: 'derived document/entity/relationship/community/report compiler; no canonical identity ownership',
  },
  writes: false,
};

const report = {
  ...deterministic,
  generatedAt: new Date().toISOString(),
  checksum: `sha256:${sha256(JSON.stringify(deterministic))}`,
};

if (!noReport) {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  status: 'REPO_TOPOLOGY_INDEX_SCOPE_AUDIT_COMPLETE',
  ...summary,
  rgVisibility: deterministic.rgVisibility,
  reportPath: noReport ? null : path.relative(ROOT, REPORT),
  writesPerformed: false,
}, null, 2));

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { semanticChecksum, array, object, string } from './lib/stable-json.mjs';
import { walkFiles, readTextSafe } from './lib/repo-walk.mjs';
import { classifyText } from './lib/taxonomy.mjs';

const reportsDir = path.resolve(process.argv[2] ?? 'docs/reports');
const outputPath = path.resolve(process.argv[3] ?? path.join(reportsDir, 'openspec-file-task-fanout-v1.json'));
const repoRoot = path.resolve(process.argv[4] ?? '.');
const read = (name) => JSON.parse(fs.readFileSync(path.join(reportsDir, name), 'utf8'));
const normalize = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');

const directory = read('openspec-directory-graph-v1.json');
const kmeans = read('openspec-file-kmeans-v1.json');
const progress = read('openspec-progress-audit-v2.json');
const fileRows = array(directory.files);
const assignments = new Map(array(kmeans.assignments).map((row) => [normalize(row.path), row]));
const labels = new Map(fileRows.map((row) => [normalize(row.path), row]));
const repositoryFileRows = walkFiles(repoRoot, { maxFiles: 250000, ignores: ['.tmp', '.codex'] });
const repositoryFiles = new Set(repositoryFileRows.map((row) => normalize(row.path)));
const repositoryFileByPath = new Map(repositoryFileRows.map((row) => [normalize(row.path), row]));
const repositoryBasenameIndex = new Map();
for (const file of repositoryFiles) {
  const base = path.posix.basename(file);
  const matches = repositoryBasenameIndex.get(base) ?? [];
  matches.push(file);
  repositoryBasenameIndex.set(base, matches);
}
const fallbackLabels = new Map();
const basenameIndex = new Map();
for (const file of labels.keys()) {
  const base = path.posix.basename(file);
  const matches = basenameIndex.get(base) ?? [];
  matches.push(file);
  basenameIndex.set(base, matches);
}
const taskLinks = array(progress.dag?.taskFileLinks);
const fanout = new Map();
const inventoryExcluded = new Map();
const unresolved = new Map();
const unresolvedReasons = new Map();

function recordUnresolved(candidate, reason, detail = {}) {
  unresolved.set(candidate, (unresolved.get(candidate) ?? 0) + 1);
  const entry = unresolvedReasons.get(candidate) ?? { file: candidate, taskCount: 0, reasons: new Set(), candidates: new Set() };
  entry.taskCount += 1;
  entry.reasons.add(reason);
  for (const match of detail.candidates ?? []) entry.candidates.add(match);
  unresolvedReasons.set(candidate, entry);
}

function resolveFile(reference) {
  const normalized = normalize(reference).replace(/^.*?deeds-web-app\//i, '');
  if (labels.has(normalized)) return normalized;
  const suffixMatches = [...labels.keys()].filter((candidate) => candidate.endsWith(`/${normalized}`) || normalized.endsWith(`/${candidate}`));
  if (suffixMatches.length === 1) return suffixMatches[0];
  const basenameMatches = basenameIndex.get(path.posix.basename(normalized)) ?? [];
  if (basenameMatches.length === 1) return basenameMatches[0];
  if (repositoryFiles.has(normalized)) return normalized;
  const repositoryBasenameMatches = [...repositoryFiles].filter((candidate) => path.posix.basename(candidate) === path.posix.basename(normalized));
  return repositoryBasenameMatches.length === 1 ? repositoryBasenameMatches[0] : null;
}

for (const link of taskLinks) {
  const file = resolveFile(link.file);
  if (!file) {
    const candidate = normalize(link.file);
    const changeName = String(link.taskId ?? '').split(':')[0];
    const scopedCandidate = !candidate.includes('/') && changeName
      ? `openspec/changes/${changeName}/${candidate}`
      : null;
    const existingCandidate = fs.existsSync(path.resolve(repoRoot, candidate))
      ? candidate
      : scopedCandidate && fs.existsSync(path.resolve(repoRoot, scopedCandidate))
        ? scopedCandidate
        : null;
    if (existingCandidate) {
      inventoryExcluded.set(existingCandidate, (inventoryExcluded.get(existingCandidate) ?? 0) + 1);
    } else {
      const normalized = candidate.replace(/^.*?deeds-web-app\//i, '');
      const basenameMatches = repositoryBasenameIndex.get(path.posix.basename(normalized)) ?? [];
      if (basenameMatches.length > 1) {
        recordUnresolved(candidate, 'AMBIGUOUS_REPOSITORY_BASENAME', { candidates: basenameMatches.slice(0, 12) });
      } else {
        recordUnresolved(candidate, 'NOT_IN_INDEXED_INVENTORY_OR_UNSCOPED_REFERENCE');
      }
    }
    continue;
  }
  const entry = fanout.get(file) ?? { file, taskIds: new Set(), changes: new Set() };
  entry.taskIds.add(String(link.taskId));
  const change = String(link.taskId).split(':')[0];
  if (change) entry.changes.add(change);
  fanout.set(file, entry);
}

const rows = [...fanout.values()].map((entry) => {
  let label = labels.get(entry.file) ?? {};
  if (!labels.has(entry.file)) {
    const file = repositoryFileByPath.get(entry.file);
    const text = file ? readTextSafe(file.fullPath, 120_000) ?? '' : '';
    const classification = classifyText(`${entry.file}\n${text.slice(0, 40_000)}`);
    label = fallbackLabels.get(entry.file) ?? {
      primaryTopic: classification.primary,
      secondaryTopics: classification.secondary,
      concepts: classification.concepts,
    };
    fallbackLabels.set(entry.file, label);
  }
  const cluster = assignments.get(entry.file) ?? {};
  return {
    file: entry.file,
    taskCount: entry.taskIds.size,
    taskIds: [...entry.taskIds].sort(),
    changes: [...entry.changes].sort(),
    primaryTopic: label.primaryTopic ?? cluster.primaryTopic ?? 'unclassified',
    secondaryTopics: array(label.secondaryTopics),
    concepts: array(label.concepts),
    clusterId: Number.isInteger(cluster.clusterId) ? cluster.clusterId : null,
    evidence: {
      treeNodeEvidence: Boolean(label.treeNodeEvidence),
      graphifyEvidence: Boolean(label.graphifyEvidence),
      openspecEvidence: Boolean(label.openspecEvidence),
    },
    authority: 'NAVIGATION_ONLY',
  };
}).sort((a, b) => b.taskCount - a.taskCount || a.file.localeCompare(b.file));

const topicCounts = {};
for (const row of rows) topicCounts[row.primaryTopic] = (topicCounts[row.primaryTopic] ?? 0) + row.taskCount;
const report = {
  schema: 'atlas.openspec-file-task-fanout.v1',
  sourceReports: ['openspec-progress-audit-v2.json', 'openspec-directory-graph-v1.json', 'openspec-file-kmeans-v1.json'],
  summary: {
    linkedTaskFileReferences: taskLinks.length,
    uniquelyResolvedFiles: rows.length,
    inventoryExcludedReferences: [...inventoryExcluded.values()].reduce((sum, count) => sum + count, 0),
    unresolvedReferencesNotProvenPresent: [...unresolved.values()].reduce((sum, count) => sum + count, 0),
    topicCounts,
    clusterCount: array(kmeans.clusters).length,
  },
  files: rows,
  inventoryExcluded: [...inventoryExcluded.entries()].map(([file, taskCount]) => ({ file, taskCount })).sort((a, b) => b.taskCount - a.taskCount || a.file.localeCompare(b.file)),
  unresolved: [...unresolvedReasons.values()].map((entry) => ({
    file: entry.file,
    taskCount: entry.taskCount,
    reasons: [...entry.reasons].sort(),
    candidateFiles: [...entry.candidates].sort(),
  })).sort((a, b) => b.taskCount - a.taskCount || a.file.localeCompare(b.file)),
  policy: {
    authority: 'NAVIGATION_ONLY',
    canonicalAuthority: false,
    writesPerformed: false,
    unresolvedDoesNotProveRepositoryAbsence: true,
    indexedInventoryIsNotACompleteRepositoryManifest: true,
    clustersDoNotCreateDependencies: true,
    sourceLineageFieldsAreNotTaskDependencies: true,
  },
};
report.semanticChecksum = semanticChecksum(report);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ outputPath, summary: report.summary, semanticChecksum: report.semanticChecksum }, null, 2));

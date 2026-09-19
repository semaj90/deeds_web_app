#!/usr/bin/env node

/**
 * Join deterministic repository taxonomy labels with structural KMeans
 * assignments. This is navigation/challenger metadata only; it never changes
 * OpenSpec state and never establishes source or runtime authority.
 */
import fs from 'node:fs';
import path from 'node:path';
import { semanticChecksum } from './lib/stable-json.mjs';

const reportsDir = path.resolve(process.argv[2] ?? 'docs/reports');
const outputPath = path.resolve(process.argv[3] ?? path.join(reportsDir, 'openspec-file-labels-v1.json'));
const read = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(reportsDir, name), 'utf8')); }
  catch { return null; }
};
const graph = read('openspec-directory-graph-v1.json');
const clusters = read('openspec-file-kmeans-v1.json');
const taxonomy = new Map((graph?.taxonomy ?? []).map((item) => [String(item.id), item]));
const clusterById = new Map((clusters?.clusters ?? []).map((item) => [Number(item.clusterId), item]));
const assignmentByPath = new Map((clusters?.assignments ?? []).map((item) => [String(item.path).replaceAll('\\', '/'), item]));
const labels = (graph?.files ?? []).map((file) => {
  const relativePath = String(file.path ?? '').replaceAll('\\', '/');
  const assignment = assignmentByPath.get(relativePath);
  const topicId = String(file.primaryTopic ?? 'other');
  const topic = taxonomy.get(topicId);
  const clusterId = assignment ? Number(assignment.clusterId) : null;
  const cluster = clusterById.get(clusterId);
  return {
    path: relativePath,
    labelId: assignment ? `${topicId}:cluster-${clusterId}` : `${topicId}:unassigned`,
    primaryTopic: topicId,
    taxonomyLabel: topic?.label ?? 'Other',
    clusterId,
    clusterDominantTopics: cluster?.dominantTopics ?? [],
    evidence: {
      treeNodeObserved: Boolean(file.treeNodeEvidence),
      graphifyObserved: Boolean(file.graphifyEvidence),
      openspecObserved: Boolean(file.openspecEvidence),
    },
  };
}).sort((a, b) => a.path.localeCompare(b.path));

const missingAssignments = labels.filter((label) => label.clusterId === null).length;
const report = {
  schema: 'atlas.openspec-file-labels.v1',
  generatedAt: new Date().toISOString(),
  inputs: {
    directoryGraph: 'openspec-directory-graph-v1.json',
    directoryGraphChecksum: graph?.semanticChecksum ?? null,
    kmeans: 'openspec-file-kmeans-v1.json',
    kmeansChecksum: clusters?.semanticChecksum ?? null,
  },
  summary: {
    files: labels.length,
    labels: new Set(labels.map((label) => label.labelId)).size,
    taxonomyTopics: new Set(labels.map((label) => label.primaryTopic)).size,
    assigned: labels.length - missingAssignments,
    missingAssignments,
  },
  status: !graph ? 'DIRECTORY_GRAPH_MISSING' : !clusters ? 'KMEANS_REPORT_MISSING' : missingAssignments ? 'PARTIAL_ASSIGNMENTS' : 'FILE_LABELS_PROVEN_NAVIGATION_ONLY',
  labels,
  authority: 'CHALLENGER_NAVIGATION_ONLY',
  canonicalAuthority: false,
  promotionAuthorized: false,
  writesPerformed: false,
  invariants: [
    'File labels are derived from repository topology and deterministic taxonomy metadata.',
    'Cluster labels do not establish source, packet, CandidateOrdinal, or OpenSpec execution authority.',
    'Graphify/tree-node observations remain evidence markers, not canonical ownership.',
  ],
};
report.semanticChecksum = semanticChecksum(report);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, status: report.status, files: labels.length, labels: report.summary.labels, semanticChecksum: report.semanticChecksum, writesPerformed: false }, null, 2));

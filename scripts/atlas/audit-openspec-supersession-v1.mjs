#!/usr/bin/env node

/**
 * Read-only Parent Atlas Workstation audit of active OpenSpec changes.
 *
 * This inventories the OpenSpec CLI state and extracts only explicit
 * relationship language. Dates or semantic overlap never imply supersession.
 * No OpenSpec artifact, task, or archive is modified.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '../..');
const REPORT = resolve(ROOT, 'docs/reports/openspec-supersession-audit-v1.json');
const CHANGES = resolve(ROOT, 'openspec/changes');

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function stable(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function cliInventory() {
  const command = process.platform === 'win32'
    ? [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npx openspec list --json']]
    : ['npx', ['openspec', 'list', '--json']];
  const raw = execFileSync(command[0], command[1], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(raw);
}

function explicitEdges(changeId, text, knownChangeIds) {
  const edges = [];
  const patterns = [
    ['SUPERSEDES', '(?:supersedes|superseded by|replaces|replaced by)'],
    ['MOVED_TO', '(?:moved to|move to)'],
    ['SATISFIED_BY', '(?:satisfied by|satisfies)'],
    ['DUPLICATE_ALIAS_OF', '(?:duplicate alias of|alias of)'],
    ['DEPENDS_ON', '(?:depends on|dependent on)'],
    ['BLOCKED_BY', '(?:blocked by)'],
  ];
  for (const [type, relation] of patterns) {
    for (const target of knownChangeIds) {
      if (target === changeId) continue;
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`${relation}[^\\n]{0,140}?${escaped}`, 'i');
      const match = pattern.exec(text);
      if (match) {
        edges.push({ from: changeId, type, to: target, evidence: match[0].slice(0, 180) });
      }
    }
  }
  return edges;
}

function relationshipMentionCount(text) {
  return (text.match(/\b(?:supersedes|superseded by|replaces|replaced by|moved to|move to|satisfied by|satisfies|duplicate alias of|alias of|depends on|dependent on|blocked by)\b/gi) || []).length;
}

const inventory = cliInventory();
const listed = Array.isArray(inventory.changes) ? inventory.changes : [];
const active = listed.filter((item) => item.status !== 'complete');
const knownChangeIds = new Set(listed.map((item) => item.name));
const nodes = [];
const edges = [];

for (const item of active) {
  const dir = resolve(CHANGES, item.name);
  const artifactTexts = [];
  for (const file of ['proposal.md', 'design.md', 'tasks.md']) {
    const path = resolve(dir, file);
    if (existsSync(path)) artifactTexts.push({ file, text: readFileSync(path, 'utf8') });
  }
  const relationships = artifactTexts.flatMap(({ file, text }) =>
    explicitEdges(item.name, text, knownChangeIds).map((edge) => ({ ...edge, evidenceFile: `openspec/changes/${item.name}/${file}` })));
  const relationshipMentions = artifactTexts.reduce((count, { text }) => count + relationshipMentionCount(text), 0);
  edges.push(...relationships);
  nodes.push({
    changeId: item.name,
    status: item.status,
    completedTasks: item.completedTasks,
    totalTasks: item.totalTasks,
    lastModified: item.lastModified,
    artifactFiles: artifactTexts.map(({ file }) => file),
    explicitRelationshipCount: relationships.length,
    relationshipMentionCount: relationshipMentions,
    unresolvedRelationshipMentionCount: Math.max(0, relationshipMentions - relationships.length),
  });
}

const dedupedEdges = [...new Map(edges
  .filter((edge) => knownChangeIds.has(edge.to))
  .map((edge) => [JSON.stringify(edge), edge])).values()]
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const nodeChecksum = sha256(JSON.stringify(nodes));
const edgeChecksum = sha256(JSON.stringify(dedupedEdges));
const report = {
  schema: 'atlas.openspec-supersession-audit.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_EXPLICIT_RELATIONSHIP_SCAN',
  source: 'npx openspec list --json + active change artifacts',
  activeChangeCount: active.length,
  completeChangeCount: listed.length - active.length,
  nodes,
  edges: dedupedEdges,
  counts: {
    explicitSupersessionCount: dedupedEdges.filter((e) => e.type === 'SUPERSEDES').length,
    movedToCount: dedupedEdges.filter((e) => e.type === 'MOVED_TO').length,
    satisfiedByCount: dedupedEdges.filter((e) => e.type === 'SATISFIED_BY').length,
    duplicateAliasCount: dedupedEdges.filter((e) => e.type === 'DUPLICATE_ALIAS_OF').length,
    dependencyCount: dedupedEdges.filter((e) => e.type === 'DEPENDS_ON').length,
    blockedByCount: dedupedEdges.filter((e) => e.type === 'BLOCKED_BY').length,
  },
  nodeChecksum,
  edgeChecksum,
  classificationPolicy: {
    datesDoNotImplySupersession: true,
    semanticOverlapRequiresReview: true,
    automaticArchive: false,
    automaticOpenSpecMutation: false,
    zeroEdgesMeansNoInventoryBoundExplicitEdgesOnly: true,
    unresolvedMentionsRequireHumanReview: true,
  },
  writesPerformed: false,
  canonicalMutationAuthority: false,
};

mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'PROVEN_READ_ONLY_EXPLICIT_RELATIONSHIP_SCAN',
  activeChangeCount: report.activeChangeCount,
  completeChangeCount: report.completeChangeCount,
  edgeCount: dedupedEdges.length,
  counts: report.counts,
  writesPerformed: false,
  reportPath: 'docs/reports/openspec-supersession-audit-v1.json',
}, null, 2));

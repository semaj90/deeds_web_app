#!/usr/bin/env node

/**
 * Deterministic, read-only OpenSpec portfolio inventory and relation pass.
 * It never changes a change directory, task ledger, or OpenSpec state.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_DIR = path.join(ROOT, 'docs', 'reports');
const INVENTORY_REPORT = path.join(REPORT_DIR, 'openspec-portfolio-inventory-v2.json');
const RELATIONS_REPORT = path.join(REPORT_DIR, 'openspec-portfolio-relations-v2.json');
const CHANGE_ROOTS = [
  { tree: 'ROOT', path: path.join(ROOT, 'openspec', 'changes') },
  { tree: 'SVELTEKIT', path: path.join(ROOT, 'sveltekit-frontend', 'openspec', 'changes') },
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const normalized = (value) => value.toLowerCase().replace(/[`*_#:/\\.-]+/g, ' ').replace(/\s+/g, ' ').trim();
const unique = (values) => [...new Set(values.filter(Boolean))].sort();
const STOPWORDS = new Set(['the', 'from', 'into', 'with', 'this', 'that', 'then', 'when', 'where', 'which', 'node', 'scripts', 'src', 'docs', 'sveltekit', 'atlas', 'file', 'files', 'path', 'service', 'endpoint', 'port']);

function filesIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
}

function extractRefs(text, patterns) {
  return unique(patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1] ?? match[0])));
}

function taskCounts(text) {
  const complete = (text.match(/^\s*- \[[xX]\]/gm) ?? []).length;
  const open = (text.match(/^\s*- \[ \]/gm) ?? []).length;
  return { taskTotal: complete + open, taskComplete: complete, taskOpen: open };
}

function inventoryEntry(tree, changeDir, changeId) {
  const proposal = read(path.join(changeDir, 'proposal.md'));
  const design = read(path.join(changeDir, 'design.md'));
  const tasks = read(path.join(changeDir, 'tasks.md'));
  const specFiles = filesIn(path.join(changeDir, 'specs')).filter((name) => name.endsWith('.md'));
  const specTexts = specFiles.map((name) => read(path.join(changeDir, 'specs', name)));
  const combined = [proposal, design, tasks, ...specTexts].join('\n');
  const task = taskCounts(tasks);
  const referencedCodePaths = extractRefs(combined, [/(?:^|[`\s(])((?:src\/|scripts\/|services\/|packages\/|python\/|docker\/|drizzle\/|proto\/)[^`\s),;]*)/g]).filter((value) => value.includes('/') && !value.endsWith('/') && value.length > 8);
  const referencedTables = extractRefs(combined, [/(?:table|relation|collection|index|FROM|INTO|UPDATE|JOIN)\s+[`'"`]?([a-z][a-z0-9_.-]{2,})/gi]).filter((value) => /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(value) || /^(?:codebase_chunks|task_semantic_packets|atlas_[a-z0-9_]+)$/.test(value));
  const referencedFunctions = extractRefs(combined, [/(?:function|method|helper|call(?:er)?|`)([A-Za-z_$][A-Za-z0-9_$]{4,})\s*\(?/g]).filter((value) => !STOPWORDS.has(value.toLowerCase()) && /[A-Z]/.test(value) && value !== value.toUpperCase() && !value.includes('_'));
  const referencedServices = extractRefs(combined, [/(?:service|container|endpoint|port)\s+[`'"`]?([a-z][a-z0-9_.-]{2,}|:\d{4,5})/gi]).filter((value) => !STOPWORDS.has(value.toLowerCase()));
  const referencedOpenSpecChanges = extractRefs(combined, [/(?:openspec\/changes\/|change(?:Id| ID)?\s*[:=]\s*)([a-z0-9][a-z0-9-]{3,})/gi]);
  return {
    tree,
    changeId,
    path: path.relative(ROOT, changeDir).replaceAll(path.sep, '/'),
    created: statSync(changeDir).birthtime.toISOString(),
    stage: /proposal|design|tasks|spec/i.test(combined) ? 'DOCUMENTED' : 'UNKNOWN',
    status: /SUPERSEDED|ARCHIVED|RETIRED/i.test(combined) ? 'REFERENCE_OR_RETIRED' : task.taskOpen ? 'OPEN_OR_PARTIAL' : 'COMPLETE_OR_UNSPECIFIED',
    hasProposal: Boolean(proposal),
    hasDesign: Boolean(design),
    hasTasks: Boolean(tasks),
    hasSpecs: specFiles.length > 0,
    hasEvidence: /evidence|receipt|report|proven|live[- ]proven/i.test(combined),
    ...task,
    proposalChecksum: proposal ? sha256(proposal) : null,
    normalizedProposalChecksum: proposal ? sha256(normalized(proposal)) : null,
    specChecksums: specFiles.sort().map((name, index) => ({ file: name, checksum: sha256(specTexts[index]) })),
    taskChecksum: tasks ? sha256(tasks) : null,
    referencedCodePaths,
    referencedTables,
    referencedFunctions,
    referencedServices,
    referencedOpenSpecChanges,
  };
}

function tokenSet(entry) {
  return new Set(normalized([
    entry.changeId,
    ...entry.referencedCodePaths,
    ...entry.referencedTables,
    ...entry.referencedFunctions,
    ...entry.referencedServices,
  ].join(' ')).split(' ').filter((token) => token.length >= 5));
}

function relation(left, right, kind, evidence, confidence) {
  return { leftChange: `${left.tree}:${left.changeId}`, rightChange: `${right.tree}:${right.changeId}`, relation: kind, evidence, confidence, mutationRecommended: false };
}

function buildRelations(changes) {
  const output = [];
  for (let i = 0; i < changes.length; i += 1) {
    for (let j = i + 1; j < changes.length; j += 1) {
      const left = changes[i];
      const right = changes[j];
      const evidence = [];
      if (left.changeId === right.changeId && left.tree !== right.tree) evidence.push('same_change_id_in_distinct_openspec_roots');
      if (left.proposalChecksum && left.proposalChecksum === right.proposalChecksum) evidence.push('identical_proposal_checksum');
      const sharedPaths = left.referencedCodePaths.filter((value) => right.referencedCodePaths.includes(value));
      const sharedTables = left.referencedTables.filter((value) => right.referencedTables.includes(value));
      const sharedFunctions = left.referencedFunctions.filter((value) => right.referencedFunctions.includes(value));
      if (sharedPaths.length) evidence.push(`shared_code_paths:${sharedPaths.slice(0, 8).join(',')}`);
      if (sharedTables.length) evidence.push(`shared_tables:${sharedTables.slice(0, 8).join(',')}`);
      if (sharedFunctions.length) evidence.push(`shared_functions:${sharedFunctions.slice(0, 8).join(',')}`);
      if (left.referencedOpenSpecChanges.includes(right.changeId) || right.referencedOpenSpecChanges.includes(left.changeId)) evidence.push('explicit_change_cross_reference');
      if (!evidence.length) continue;
      let kind = 'RELATED_NOT_DUPLICATE';
      let confidence = 0.55;
      if (left.changeId === right.changeId && left.tree !== right.tree) { kind = 'NEEDS_REVIEW'; confidence = 0.95; }
      else if (left.proposalChecksum && left.proposalChecksum === right.proposalChecksum) { kind = 'EXACT_DUPLICATE'; confidence = 1; }
      else if (evidence.some((item) => item.startsWith('explicit_change_cross_reference'))) { kind = 'LAYERED_DEPENDENCY'; confidence = 0.85; }
      else if (sharedPaths.length || sharedTables.length || sharedFunctions.length) { kind = 'OVERLAPPING_SCOPE'; confidence = 0.75; }
      output.push(relation(left, right, kind, evidence, confidence));
    }
  }
  return output;
}

const changes = CHANGE_ROOTS.flatMap(({ tree, path: root }) => {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== 'archive').map((entry) => inventoryEntry(tree, path.join(root, entry.name), entry.name));
}).sort((a, b) => `${a.tree}:${a.changeId}`.localeCompare(`${b.tree}:${b.changeId}`));

const relations = buildRelations(changes);
const canonicalTables = new Set(['atlas_packets', 'task_semantic_packets', 'codebase_chunk_index', 'graphify_files', 'graphify_runs', 'atlas_ast_nodes', 'atlas_packet_registry']);
const ownerCollisions = relations.filter((item) => item.relation === 'NEEDS_REVIEW' || item.evidence.some((value) => value.startsWith('shared_tables:'))).map((item) => {
  const tableEvidence = item.evidence.find((value) => value.startsWith('shared_tables:'))?.slice('shared_tables:'.length).split(',') ?? [];
  const canonicalTableHit = tableEvidence.some((table) => canonicalTables.has(table));
  return {
    ...item,
    priority: item.relation === 'NEEDS_REVIEW' ? 'P0_CROSS_TREE_ID_COLLISION' : canonicalTableHit ? 'P1_CANONICAL_TABLE_REVIEW' : 'P2_SHARED_DERIVED_SURFACE',
    collisionType: item.relation === 'NEEDS_REVIEW' ? 'CROSS_TREE_CHANGE_ID_COLLISION' : canonicalTableHit ? 'CANONICAL_WRITER_OR_DATA_OWNER_COLLISION' : 'DERIVED_SURFACE_OVERLAP',
  };
});
const relationCounts = Object.fromEntries(unique(relations.map((item) => item.relation)).map((kind) => [kind, relations.filter((item) => item.relation === kind).length]));
const summary = {
  changeCount: changes.length,
  treeCounts: Object.fromEntries(CHANGE_ROOTS.map(({ tree }) => [tree, changes.filter((entry) => entry.tree === tree).length])),
  taskTotal: changes.reduce((sum, entry) => sum + entry.taskTotal, 0),
  taskComplete: changes.reduce((sum, entry) => sum + entry.taskComplete, 0),
  relationCount: relations.length,
  relationCounts,
  ownerCollisionCount: ownerCollisions.length,
  ownerCollisionPriorityCounts: Object.fromEntries(unique(ownerCollisions.map((item) => item.priority)).map((priority) => [priority, ownerCollisions.filter((item) => item.priority === priority).length])),
  mutationRecommendedCount: 0,
};

writeFileSync(INVENTORY_REPORT, `${JSON.stringify({ schema: 'atlas.openspec-change-inventory.v2', readOnly: true, generatedAt: new Date().toISOString(), summary, changes }, null, 2)}\n`);
writeFileSync(RELATIONS_REPORT, `${JSON.stringify({ schema: 'atlas.openspec-relations.v2', readOnly: true, generatedAt: new Date().toISOString(), summary, relations, ownerCollisions }, null, 2)}\n`);
console.log(JSON.stringify({ readOnly: true, summary, inventoryReport: INVENTORY_REPORT, relationsReport: RELATIONS_REPORT }, null, 2));

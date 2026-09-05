#!/usr/bin/env node

/**
 * Build the Parent Atlas Workstation-specific OpenSpec reconciliation board.
 *
 * This is a derived, read-only planning projection. It consumes the existing
 * OpenSpec workboard plus the Workstation dependency spine and never changes
 * task ledgers, source files, or runtime stores.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKSTATION_SPINE = path.join(ROOT, 'docs', 'parent-atlas-workstation-todo.md');
const WORKBOARD = path.join(ROOT, 'docs', 'reports', 'openspec-workboard-v1.json');
const PORTFOLIO = path.join(ROOT, 'docs', 'reports', 'openspec-portfolio-v1.json');
const SOURCE_COHORT = path.join(ROOT, 'docs', 'reports', 'current-source-cohort-lineage-v1.json');
const PACKET_JOIN = path.join(ROOT, 'docs', 'reports', 'current-workspace-packet-chunk-join-v1.json');
const OUT_JSON = path.join(ROOT, 'docs', 'reports', 'parent-atlas-workstation-openspec-workboard-v2.json');
const OUT_MD = path.join(ROOT, 'docs', 'reports', 'parent-atlas-workstation-openspec-workboard-v2.md');

const read = (file) => fs.readFileSync(file, 'utf8');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const json = (file) => JSON.parse(read(file));

const spineText = read(WORKSTATION_SPINE);
const workboard = json(WORKBOARD);
const portfolio = json(PORTFOLIO);
const sourceCohort = json(SOURCE_COHORT);
const packetJoin = json(PACKET_JOIN);

const explicitChanges = new Set(
  [...spineText.matchAll(/openspec\/changes\/([a-z0-9-]+)/gi)].map((match) => match[1]),
);
const convergence = 'parent-atlas-retrieval-lineage-dag-convergence';
explicitChanges.add(convergence);

const gateTokens = new Set(
  [...spineText.matchAll(/\b(?:GRAPHIFY|PKT-LINEAGE|DIR-INDEX|DAG-RUNTIME|RETRIEVAL)-[A-Z0-9._-]+\b/g)].map(
    (match) => match[0],
  ),
);

function taskBlocks(changeId) {
  const file = path.join(ROOT, 'openspec', 'changes', changeId, 'tasks.md');
  if (!fs.existsSync(file)) return [];
  const lines = read(file).split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^- \[ \] (.+)$/);
    if (!match) continue;
    const start = index + 1;
    const parts = [match[1].trim()];
    while (index + 1 < lines.length && lines[index + 1] && !/^(- \[[ xX]\]|## )/.test(lines[index + 1])) {
      parts.push(lines[index + 1].trim());
      index += 1;
    }
    blocks.push({ line: start, text: parts.filter(Boolean).join(' ') });
  }
  return blocks;
}

function stepFor(text) {
  if (/identity|source|revision|workspace|namespace|lineage|cohort|graphify/i.test(text)) return 'STEP-01';
  if (/eligib|provenance|admission|promotion|canonical|ordinal|candidate/i.test(text)) return 'STEP-02';
  if (/retrieval|qdrant|semantic|embedding|vector|lexical|search|parameter/i.test(text)) return 'STEP-03';
  if (/ast|cst|graph|neo4j|pagerank|topology|ontology/i.test(text)) return 'STEP-04';
  if (/ace|context|dag|receipt|workflow|synthesis|bitfrost|valkey|cache|runtime/i.test(text)) return 'STEP-05';
  if (/openspec|governance|ledger|authority|task board|portfolio/i.test(text)) return 'STEP-06';
  if (/benchmark|challenger|cuvs|cugraph|cagra|xgboost|ewin tang|gpu/i.test(text)) return 'STEP-08';
  return 'STEP-07';
}

function classify(changeId, text) {
  if (/\bSUPERSEDED\b|historical|archived|retired/i.test(text)) return 'SUPERSEDED';
  if (/do not|don't|never|must not|no .* writes|without .* writes/i.test(text)) return 'NEGATIVE_CONSTRAINT';
  if (/human|authorization|approval|required direction|HITL/i.test(text)) return 'HUMAN_DECISION_REQUIRED';
  if (/\bBLOCKED\b|blocked by|unresolved|missing authoritative|workspace.*mismatch|revision.*unproven/i.test(text)) return 'BLOCKED_UPSTREAM';
  if (changeId !== convergence) return 'OWNED_BY_OTHER_CHANGE';
  if (/governance|authority|ledger|portfolio|task board|status|reconcile|receipt/i.test(text)) return 'GOVERNANCE_ONLY';
  return 'UNVERIFIED';
}

function evidenceFor(classification, changeId, text) {
  const refs = [];
  if (changeId === convergence) {
    refs.push('docs/reports/current-source-cohort-lineage-v1.json', 'docs/reports/current-workspace-packet-chunk-join-v1.json');
  }
  if (classification === 'OWNED_BY_OTHER_CHANGE') refs.push('docs/reports/openspec-portfolio-v1.json');
  if (/Graphify|workspace|source|revision|lineage|cohort/i.test(text)) refs.push('docs/reports/graphify-daily-coordinator-canary-v1.json');
  return [...new Set(refs)];
}

function resolveEvidence(refs) {
  return refs.map((ref) => ({
    ref,
    exists: fs.existsSync(path.join(ROOT, ref)),
  }));
}

function evidenceDisposition(classification, text) {
  if (classification === 'SUPERSEDED') return 'SUPERSEDED';
  if (classification === 'BLOCKED_UPSTREAM') return 'BLOCKED';
  if (classification === 'HUMAN_DECISION_REQUIRED') return 'HUMAN_DECISION_REQUIRED';
  if (classification === 'NEGATIVE_CONSTRAINT') return 'CONSTRAINT';
  if (/regression|finding confirmed|follow[- ]?up open|confirmed.*unfixed/i.test(text)) {
    return 'FINDING_CONFIRMED_FOLLOWUP_OPEN';
  }
  if (classification === 'OWNED_BY_OTHER_CHANGE') return 'OWNED_BY_OTHER_CHANGE';
  return 'UNVERIFIED';
}

const tasks = [];
for (const entry of fs.readdirSync(path.join(ROOT, 'openspec', 'changes'), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'archive') continue;
  const changeId = entry.name;
  const blocks = taskBlocks(changeId);
  for (const block of blocks) {
    const explicit = explicitChanges.has(changeId);
    const gateMentioned = [...gateTokens].some((gate) => block.text.includes(gate));
    const convergenceRelevant = changeId === convergence && (/identity|source|revision|workspace|namespace|lineage|cohort|graphify|retrieval|qdrant|ace|dag|representation|promotion/i.test(block.text) || gateMentioned);
    if (!explicit && !convergenceRelevant) continue;
    const classification = classify(changeId, block.text);
    const step = stepFor(block.text);
    const owner = changeId === convergence ? 'parent-atlas-retrieval-lineage-dag-convergence' : changeId;
    const evidenceRefs = evidenceFor(classification, changeId, block.text);
    const evidenceResolution = resolveEvidence(evidenceRefs);
    const missingEvidenceRefs = evidenceResolution.filter((item) => !item.exists).map((item) => item.ref);
    const blocker = classification === 'BLOCKED_UPSTREAM'
      ? 'Current post-coordinator lineage is not coherent: source cohort 0/52 matches current workspace; packet/chunk join 0/111 exact.'
      : classification === 'OWNED_BY_OTHER_CHANGE'
        ? `Implementation owner is ${changeId}; this board may reference it but does not execute its unchecked backlog.`
        : classification === 'NEGATIVE_CONSTRAINT'
          ? 'Constraint only; not executable work.'
          : classification === 'GOVERNANCE_ONLY'
            ? 'Governance/proof bookkeeping; requires evidence, not model selection.'
            : null;
    const validation = changeId === convergence
      ? 'npx openspec validate parent-atlas-retrieval-lineage-dag-convergence --type change --strict --json'
      : `npx openspec validate ${changeId} --type change --strict --json`;
    const safeNext = classification === 'BLOCKED_UPSTREAM'
      ? 'Repair or identify the authoritative current source/chunk binding; do not apply a cohort.'
      : classification === 'OWNED_BY_OTHER_CHANGE'
        ? `Review the owning change's proof gate: ${changeId}`
        : classification === 'NEGATIVE_CONSTRAINT'
          ? 'Preserve this constraint while executing its parent gate.'
          : classification === 'GOVERNANCE_ONLY'
            ? 'Attach current evidence before changing task status.'
            : 'Remain unexecuted until its prerequisites and proof receipt are present.';
    tasks.push({
      openspecChange: changeId,
      taskRef: `${changeId}:${block.line}`,
      sourceLine: block.line,
      taskText: block.text,
      taskChecksum: sha256(`${changeId}\n${block.line}\n${block.text}`),
      taskLedgerState: 'UNCHECKED',
      classification,
      evidenceDisposition: evidenceDisposition(classification, block.text),
      currentOwner: owner,
      dependencyOrBlocker: blocker,
      evidenceRefs,
      evidenceResolution,
      missingEvidenceRefs,
      validationCommand: validation,
      safeNextAction: safeNext,
      mutationScope: classification === 'NEGATIVE_CONSTRAINT' ? 'NONE' : 'UNAUTHORIZED_UNTIL_EXPLICIT_GATE',
      executable: false,
      eligibilityBasis: 'EXPLICIT_CLASSIFICATION_AND_EVIDENCE_ONLY',
      priority: step === 'STEP-01' ? 10 : step === 'STEP-02' ? 20 : step === 'STEP-03' ? 30 : step === 'STEP-04' ? 40 : step === 'STEP-05' ? 50 : step === 'STEP-06' ? 60 : 80,
      step,
    });
  }
}

tasks.sort((a, b) => a.priority - b.priority || a.openspecChange.localeCompare(b.openspecChange) || a.sourceLine - b.sourceLine);
const taskPopulationChecksum = sha256(JSON.stringify(tasks));
const candidateLimit = 5;
const eligibleCandidates = tasks
  .filter((task) => task.executable === true && task.classification === 'OPEN_ACTIONABLE')
  .sort((a, b) => a.priority - b.priority || a.openspecChange.localeCompare(b.openspecChange) || a.sourceLine - b.sourceLine);
const selectedCandidates = eligibleCandidates.slice(0, candidateLimit);
const workPlanBody = {
  schema: 'atlas.openspec-work-plan.v1',
  status: selectedCandidates.length > 0 ? 'BOUNDED_ACTION_AVAILABLE' : 'NO_EXECUTABLE_CANDIDATE',
  taskRefs: selectedCandidates.map((task) => task.taskRef),
  nextAction: selectedCandidates[0] ?? null,
  blockers: selectedCandidates.length > 0 ? [] : [
    'No task is explicitly OPEN_ACTIONABLE and executable.',
    'Current source cohort has 0/52 current-workspace matches.',
    'Current packet/chunk join has 0/111 exact matches.',
  ],
  evidenceRefs: ['docs/reports/current-source-cohort-lineage-v1.json', 'docs/reports/current-workspace-packet-chunk-join-v1.json'],
  mutationScope: 'NONE_UNTIL_EXPLICIT_AUTHORIZATION',
  validationCommands: ['npx openspec validate parent-atlas-openspec-workstation-synthesis --type change --strict --json'],
};
const workPlan = {
  ...workPlanBody,
  planChecksum: sha256(JSON.stringify(workPlanBody)),
};

const summary = Object.fromEntries(
  ['OPEN_ACTIONABLE', 'BLOCKED_UPSTREAM', 'CLOSED_BY_CURRENT_EVIDENCE', 'SUPERSEDED', 'OWNED_BY_OTHER_CHANGE', 'GOVERNANCE_ONLY', 'NEGATIVE_CONSTRAINT', 'HUMAN_DECISION_REQUIRED', 'UNVERIFIED']
    .map((classification) => [classification, tasks.filter((task) => task.classification === classification).length]),
);
const report = {
  schema: 'atlas.parent-atlas-workstation-openspec-workboard.v2',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  authority: {
    mechanicalIndex: 'docs/reports/openspec-workboard-v1.json',
    scopeSpine: 'docs/parent-atlas-workstation-todo.md',
    taskAuthority: 'openspec/changes/*/tasks.md',
    portfolioAuthority: 'docs/reports/openspec-portfolio-v1.json',
  },
  sourceChecksums: {
    workstationSpine: sha256(spineText),
    workboard: sha256(read(WORKBOARD)),
    portfolio: sha256(read(PORTFOLIO)),
    sourceCohort: sha256(read(SOURCE_COHORT)),
    packetJoin: sha256(read(PACKET_JOIN)),
  },
  currentBlocker: {
    status: sourceCohort.status,
    sourceCohortCounts: sourceCohort.counts,
    packetJoinStatus: packetJoin.status,
    packetJoinCounts: packetJoin.counts,
    conclusion: 'No current-workspace-qualified source/chunk cohort is executable; PKT-LINEAGE-08 remains blocked.',
  },
  summary: {
    selectedTaskCount: tasks.length,
    ...summary,
    evidenceRefs: tasks.reduce((count, task) => count + task.evidenceRefs.length, 0),
    missingEvidenceRefs: tasks.reduce((count, task) => count + task.missingEvidenceRefs.length, 0),
  },
  taskPopulationChecksum,
  planning: {
    candidateLimit,
    eligibleCandidateCount: eligibleCandidates.length,
    selectedCandidateCount: selectedCandidates.length,
    selectedTaskRefs: selectedCandidates.map((task) => task.taskRef),
    status: selectedCandidates.length > 0 ? 'BOUNDED_CANDIDATES_AVAILABLE' : 'NO_EXECUTABLE_CANDIDATE',
    selectionPolicy: 'EXPLICIT_OPEN_ACTIONABLE_PLUS_EXECUTABLE; PRIORITY_THEN_CHANGE_THEN_SOURCE_LINE',
    modelCalls: 0,
    writes: 0,
  },
  workPlan,
  tasks,
  writes: { taskLedgers: 0, sourceFiles: 0, databases: 0, qdrant: 0, neo4j: 0, cache: 0, modelCalls: 0 },
  notes: [
    'Unchecked status is not executable authority.',
    'The historical July workstation board was not overwritten.',
    'STEP-07 is ownership classification, not an execution queue.',
    'GPU/challenger work remains downstream of identity, provenance, and candidate prerequisites.',
    'No task is executable from this reconciliation projection; planning and mutation are separate gates.',
  ],
};

const markdown = [
  '# Parent Atlas Workstation OpenSpec Workboard v2',
  '',
  `Generated: ${report.generatedAt} | selected unchecked tasks: ${tasks.length}`,
  '',
  '> Derived reconciliation projection. OpenSpec task ledgers remain authoritative; this board does not execute or close tasks.',
  '',
  '## Current blocker',
  '',
  `- **${sourceCohort.status}** — source cohort ${sourceCohort.counts.cohortRows ?? 'unknown'} rows; current-workspace matches ${sourceCohort.counts.currentWorkspaceMatched ?? 'unknown'}; revision-qualified ${sourceCohort.counts.revisionQualified ?? 'unknown'}.`,
  `- **${packetJoin.status}** — packet/chunk binding rows ${packetJoin.counts.binding_rows ?? 'unknown'}; exact current joins ${packetJoin.counts.packet_chunk_exact_sources ?? 'unknown'}.`,
  '- Result: `PKT-LINEAGE-08` remains blocked; no cohort apply or broad Graphify run is authorized.',
  `- Planning: **${report.planning.status}**; eligible ${report.planning.eligibleCandidateCount}; selected ${report.planning.selectedCandidateCount}/${report.planning.candidateLimit}; model calls ${report.planning.modelCalls}; writes ${report.planning.writes}.`,
  `- Work plan: **${report.workPlan.status}**; checksum ${report.workPlan.planChecksum}; next action ${report.workPlan.nextAction ? report.workPlan.nextAction.taskRef : 'none'}.`,
  '',
  '## Classification summary',
  '',
  ...Object.entries(summary).map(([key, value]) => `- **${key}**: ${value}`),
  '',
  '## Workstation-relevant tasks',
  '',
  ...tasks.map((task) => `- **${task.classification}** [${task.openspecChange}:${task.sourceLine}](../../openspec/changes/${task.openspecChange}/tasks.md#L${task.sourceLine}) **${task.step}** — ${task.taskText} — owner: ${task.currentOwner}; next: ${task.safeNextAction}`),
  '',
  '## Write policy',
  '',
  '- Task ledger writes: 0',
  '- Source/database/Qdrant/Neo4j/cache/model writes: 0',
  '- Historical July workstation board: preserved unchanged.',
].join('\n');

fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(OUT_MD, `${markdown}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, selectedTaskCount: tasks.length, summary, currentBlocker: report.currentBlocker, writes: report.writes, outJson: OUT_JSON, outMarkdown: OUT_MD }, null, 2));

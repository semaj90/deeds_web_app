import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const phaseIndexPath = path.join(root, 'parent-atlas-workstation-todo.md');
const workboardPath = path.join(root, 'docs/reports/parent-atlas-workstation-openspec-workboard-v2.json');

function read(pathname) {
  return readFileSync(pathname, 'utf8');
}

function checksum(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function tableRows(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex < 0) throw new Error(`Missing required heading: ${heading}`);
  const rows = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith('|')) {
      if (rows.length) break;
      continue;
    }
    if (/^\|[\s|:-]+\|$/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length >= 4) rows.push(cells);
  }
  return rows;
}

function canonicalPhases(markdown) {
  const rows = tableRows(markdown, '### Canonical phase index');
  if (!rows.length || rows[0][0] !== 'Canonical phase') {
    throw new Error('Canonical phase index table schema did not match.');
  }
  return rows.slice(1).map(([phase, lane, ownerText, status]) => {
    const owners = [...ownerText.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    return {
      phase,
      phaseId: /^P\d+$/.test(phase) ? `workstation-p${phase.slice(1)}` : null,
      lane,
      owners,
      ownerDescription: owners.length ? null : ownerText,
      statusAndBoundary: status,
    };
  });
}

function ownerLedger(changeId) {
  const relativePath = `openspec/changes/${changeId}/tasks.md`;
  const absolutePath = path.join(root, relativePath);
  try {
    const content = read(absolutePath);
    const lines = content.split(/\r?\n/);
    const taskLines = lines.flatMap((line, index) => {
      const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
      if (!match) return [];
      const taskId = match[2].match(/\*\*([A-Z][A-Z0-9_-]{2,})\*\*/)?.[1] ?? null;
      return [{ line: index + 1, checked: match[1].toLowerCase() === 'x', text: match[2], taskId }];
    });
    return {
      changeId,
      path: relativePath,
      exists: true,
      checksum: checksum(content),
      checkedTaskCount: taskLines.filter((task) => task.checked).length,
      openTaskCount: taskLines.filter((task) => !task.checked).length,
      explicitPhaseLinks: taskLines.flatMap((task) => {
        const ids = [...task.text.matchAll(/\bworkstation-p(\d+)\b/gi)].map((match) => `workstation-p${match[1]}`);
        return [...new Set(ids)].map((phaseId) => ({ phaseId, taskRef: `${changeId}:${task.line}`, taskId: task.taskId }));
      }),
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { changeId, path: relativePath, exists: false, checkedTaskCount: 0, openTaskCount: 0, explicitPhaseLinks: [] };
    throw error;
  }
}

const phaseMarkdown = read(phaseIndexPath);
const workboardText = read(workboardPath);
const workboard = JSON.parse(workboardText);
if (!Array.isArray(workboard.tasks)) throw new Error('Workboard has no task array.');

const allPhases = canonicalPhases(phaseMarkdown);
const uniqueOwners = [...new Set(allPhases.flatMap((phase) => phase.owners))];
const ownerLedgers = Object.fromEntries(uniqueOwners.map((changeId) => [changeId, ownerLedger(changeId)]));
const phases = allPhases.map((phase) => {
  const ownerTaskCandidates = workboard.tasks
    .filter((task) => phase.owners.includes(task.openspecChange))
    .map((task) => ({
      taskRef: task.taskRef,
      taskChecksum: task.taskChecksum,
      taskLedgerState: task.taskLedgerState,
      classification: task.classification,
      evidenceDisposition: task.evidenceDisposition,
      explicitPhaseLink: Boolean(
        phase.phaseId &&
        new RegExp(`(?:^|[^a-z0-9-])${phase.phaseId}(?:$|[^a-z0-9-])`, 'i').test(task.taskText),
      ),
    }));
  const phaseId = phase.phaseId;
  const explicitLedgerLinks = phaseId
    ? phase.owners.flatMap((owner) => ownerLedgers[owner].explicitPhaseLinks.filter((link) => link.phaseId === phaseId))
    : [];
  return {
    ...phase,
    ownerLedgers: phase.owners.map((owner) => ({
      ...ownerLedgers[owner],
      explicitPhaseLinkCount: phaseId ? ownerLedgers[owner].explicitPhaseLinks.filter((link) => link.phaseId === phaseId).length : 0,
    })),
    ownerTaskCandidateCount: ownerTaskCandidates.length,
    ownerTaskCandidates,
    phaseLinkedTaskRefs: explicitLedgerLinks.map((link) => link.taskRef),
    mappingStatus: explicitLedgerLinks.length
      ? 'EXPLICIT_PHASE_TASK_LINKS_PRESENT'
      : phase.owners.some((owner) => ownerLedgers[owner].exists)
        ? 'OWNER_LEDGER_AVAILABLE_PHASE_MEMBERSHIP_UNRESOLVED'
        : 'OWNER_LEDGER_NOT_FOUND_OR_UNDECLARED',
  };
});

const output = {
  schema: 'parent-atlas.workstation-phase-task-crosswalk.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  authority: {
    phaseOwners: 'parent-atlas-workstation-todo.md#canonical-phase-index',
    taskState: 'OpenSpec tasks.md; workboard is a navigation projection',
  },
  sourceChecksums: {
    canonicalPhaseIndex: checksum(phaseMarkdown),
    workboardSnapshot: checksum(workboardText),
  },
  workboardGeneratedAt: workboard.generatedAt ?? null,
  workboardTaskCount: workboard.tasks.length,
  ownerLedgerCensus: ownerLedgers,
  unmappedLegacyPhaseRange: 'P1-P10',
  phases,
  summary: {
    canonicalPhaseRows: phases.length,
    explicitOwnerTaskLinks: phases.reduce((sum, phase) => sum + phase.phaseLinkedTaskRefs.length, 0),
    ownerNavigationOnlyPhases: phases.filter((phase) => phase.mappingStatus === 'OWNER_LEDGER_AVAILABLE_PHASE_MEMBERSHIP_UNRESOLVED').length,
    phasesWithExplicitTaskLinks: phases.filter((phase) => phase.mappingStatus === 'EXPLICIT_PHASE_TASK_LINKS_PRESENT').map((phase) => phase.phase),
    phasesWithoutAvailableOwnerLedger: phases.filter((phase) => phase.mappingStatus === 'OWNER_LEDGER_NOT_FOUND_OR_UNDECLARED').map((phase) => phase.phase),
    writesPerformed: false,
  },
  invariants: [
    'Exact OpenSpec change ownership provides navigation only; it does not prove task membership in a workstation phase.',
    'Only explicit canonical workstation phase IDs in task text create phase-to-task links.',
    'Task checkboxes and workboard classifications are not completion proof.',
    'Revision-producing work remains deferred until after P20 and the required tournament gate; read-only audits and fail-closed checks may continue.',
  ],
};

if (process.argv.includes('--summary')) {
  process.stdout.write(`${JSON.stringify({
    schema: output.schema,
    generatedAt: output.generatedAt,
    workboardGeneratedAt: output.workboardGeneratedAt,
    workboardTaskCount: output.workboardTaskCount,
    summary: output.summary,
    phases: phases.map(({ phase, phaseId, owners, ownerLedgers: ledgers, ownerTaskCandidateCount, phaseLinkedTaskRefs, mappingStatus }) => ({
      phase, phaseId, owners, ownerLedgers: ledgers.map(({ changeId, exists, checkedTaskCount, openTaskCount, explicitPhaseLinkCount }) => ({ changeId, exists, checkedTaskCount, openTaskCount, explicitPhaseLinkCount })), ownerTaskCandidateCount, explicitTaskLinkCount: phaseLinkedTaskRefs.length, mappingStatus,
    })),
  }, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

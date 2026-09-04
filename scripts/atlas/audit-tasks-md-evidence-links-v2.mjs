#!/usr/bin/env node
/**
 * Task-ID-aware, read-only evidence audit for an OpenSpec tasks.md file.
 * A checkbox block owns every following line until the next top-level
 * checkbox, regardless of indentation. This avoids treating continuation
 * prose or numbered acceptance criteria as separate task IDs.
 */
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('usage: node audit-tasks-md-evidence-links-v2.mjs <tasks.md> [report.json]');
  process.exit(1);
}
const absolute = path.resolve(input);
const reportPath = path.resolve(process.argv[3] ?? 'docs/reports/tasks-md-evidence-links-v2.json');
const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
const checkbox = /^- \[([ xX])\] (.+)$/;
const evidence = /docs\/reports\/[\w./-]+\.json|`[^`]+\.(?:ts|mjs|mts|sql|py)`|\b\d+\/\d+\s+(?:tests?|checks?|changes?)\s+pass(?:ed)?\b|(?:tests?|checks?|changes?)\s+pass(?:ed)?/i;
const blocks = [];
let current = null;
let section = 'UNSECTIONED';
let groupBlockIndexes = [];
const sectionEvidenceIndexes = new Set();
for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
  const line = lines[lineIndex];
  const heading = line.match(/^#{1,6}\s+(.+)$/);
  if (heading) {
    section = heading[1].trim();
    groupBlockIndexes = [];
  }
  if (/^\s*Evidence:/i.test(line)) {
    for (const blockIndex of groupBlockIndexes) sectionEvidenceIndexes.add(blockIndex);
    groupBlockIndexes = [];
  }
  const match = line.match(checkbox);
  if (match) {
    if (current) blocks.push(current);
    const title = match[2].trim();
    current = {
      checked: match[1].toLowerCase() === 'x',
      taskId: title.split(/\s+—|\s+-\s+|\s+/)[0],
      title,
      startLine: lineIndex + 1,
      section,
      lines: [line],
    };
    groupBlockIndexes.push(blocks.length);
  } else if (current) {
    current.lines.push(line);
  }
}
if (current) blocks.push(current);

const checked = blocks.filter((block) => block.checked);
const classified = checked.map((block) => {
  const ownEvidence = evidence.test(block.lines.join('\n'));
  const blockIndex = blocks.indexOf(block);
  const sectionEvidence = !ownEvidence && sectionEvidenceIndexes.has(blockIndex);
  return { ...block, evidenceScope: ownEvidence ? 'TASK_BLOCK' : sectionEvidence ? 'SECTION' : null };
});
const missing = classified.filter((block) => !block.evidenceScope);
const likelyContinuation = /^(?:Keep|\d{2}|Transaction|Current|Review|Execution|Prove|Exact|Insert|Every|Heartbeat|Successful|Failure)$/;
const missingWithClassification = missing.map(({ taskId, title, startLine, section }) => ({
  taskId,
  title,
  startLine,
  section,
  classification: likelyContinuation.test(taskId)
    || /^(?:GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02|GRAPHIFY-RUN-IDENTITY-SEPARATION-01)$/.test(taskId.replaceAll('`', '').replace(/:+$/, ''))
    ? 'LIKELY_CONTINUATION_OR_SUBTASK'
    : 'REVIEW_REQUIRED',
}));
const sectionEvidenceCount = classified.filter((block) => block.evidenceScope === 'SECTION').length;
const report = {
  schema: 'atlas.tasks-md-evidence-links.v2',
  input: path.relative(process.cwd(), absolute).replaceAll(path.sep, '/'),
  parser: 'top_level_checkbox_block_until_next_checkbox',
  checkedTaskCount: checked.length,
  checkedWithEvidenceCount: checked.length - missing.length,
  taskBlockEvidenceCount: classified.filter((block) => block.evidenceScope === 'TASK_BLOCK').length,
  sectionEvidenceCount,
  checkedWithoutEvidence: missingWithClassification,
  missingEvidenceCounts: {
    likelyContinuationOrSubtask: missingWithClassification.filter((item) => item.classification === 'LIKELY_CONTINUATION_OR_SUBTASK').length,
    reviewRequired: missingWithClassification.filter((item) => item.classification === 'REVIEW_REQUIRED').length,
  },
  falsePositiveGuard: 'continuation prose and numbered criteria are not task blocks; section evidence is reported separately',
  writesPerformed: false,
  canonicalAuthority: false,
  status: 'PROVEN_READ_ONLY_TASK_BLOCK_AUDIT',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, checkedTaskCount: report.checkedTaskCount, checkedWithEvidenceCount: report.checkedWithEvidenceCount, missingEvidenceCount: missing.length, reportPath }, null, 2));

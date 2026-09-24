#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { blockHash, resolveDeclarations, sectionSlug, stripWfuComment, taskBlock } from './lib/wfu-metadata.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function groupOpenDuplicateDeclaredIdsV1(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    if (!task.ledgerId) continue;
    const key = `${task.change}\u0000${task.ledgerId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  return [...groups.entries()]
    .map(([key, occurrences]) => {
      const [change, id] = key.split('\u0000');
      const openAmbiguous = occurrences.filter((task) => task.state === 'OPEN' && task.taskIdentity?.basis === 'AMBIGUOUS_DECLARED_ID');
      if (openAmbiguous.length === 0) return null;
      return {
        change,
        id,
        totalOccurrences: occurrences.length,
        openAmbiguousOccurrences: openAmbiguous.length,
        occurrences: occurrences.map((task) => ({
          source: task.source,
          line: task.line,
          state: task.state,
          identityBasis: task.taskIdentity?.basis ?? null,
          sectionSlug: task.sectionSlug ?? null,
          taskRevision: task.blockHash ?? null,
          titleExcerpt: task.text.slice(0, 220),
        })).sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.change.localeCompare(b.change) || a.id.localeCompare(b.id));
}

function readOpenSpecTasks(root) {
  const changesRoot = path.join(root, 'openspec', 'changes');
  const files = fs.readdirSync(changesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(changesRoot, entry.name, 'tasks.md'))
    .filter((file) => fs.existsSync(file))
    .sort();
  const tasks = [];
  const sourceFiles = [];

  for (const file of files) {
    const source = path.relative(root, file).split(path.sep).join('/');
    const content = fs.readFileSync(file, 'utf8');
    sourceFiles.push({ source, sha256: crypto.createHash('sha256').update(content).digest('hex') });
    const lines = content.split(/\r?\n/);
    let currentSection = '';
    lines.forEach((line, index) => {
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) currentSection = sectionSlug(heading[1]);
      const match = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
      if (!match) return;
      const block = taskBlock(lines, index);
      tasks.push({
        taskKey: `${path.basename(path.dirname(file))}:${index + 1}`,
        change: path.basename(path.dirname(file)),
        source,
        line: index + 1,
        text: stripWfuComment(match[2].trim()),
        state: match[1].toLowerCase() === 'x' ? 'DONE' : 'OPEN',
        sectionSlug: currentSection,
        blockHash: blockHash(block),
      });
    });
  }

  resolveDeclarations(tasks);
  return { tasks, sourceFiles };
}

export function buildDuplicateTaskIdReportV1(root = ROOT, generatedAt = new Date().toISOString()) {
  const { tasks, sourceFiles } = readOpenSpecTasks(root);
  const groups = groupOpenDuplicateDeclaredIdsV1(tasks);
  const ambiguousOpenCount = groups.reduce((sum, group) => sum + group.openAmbiguousOccurrences, 0);
  return {
    schema: 'atlas.openspec-duplicate-task-ids.v1',
    generatedAt,
    status: groups.length ? 'REVIEW_REQUIRED' : 'NO_OPEN_AMBIGUOUS_DECLARED_IDS',
    source: {
      taskFiles: sourceFiles.length,
      taskRows: tasks.length,
      openTaskRows: tasks.filter((task) => task.state === 'OPEN').length,
      sourceFilesSha256: sourceFiles,
      sourceSetSha256: crypto.createHash('sha256').update(JSON.stringify(sourceFiles)).digest('hex'),
      identityResolver: 'scripts/atlas/lib/wfu-metadata.mjs::resolveDeclarations',
    },
    summary: { duplicateIdGroups: groups.length, openAmbiguousRows: ambiguousOpenCount },
    groups,
    authority: { canonicalAuthority: false, taskLedgersChanged: false, promotionAuthorized: false },
    writes: { taskLedgers: 0, persistentStores: 0, reportFile: 1 },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = path.resolve(process.argv[2] ?? path.join(ROOT, 'docs/reports/openspec-duplicate-task-ids-v1.json'));
  const report = buildDuplicateTaskIdReportV1();
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output, ...report.summary, taskFiles: report.source.taskFiles, taskRows: report.source.taskRows, status: report.status }, null, 2));
}

#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assignDomain, assignFeatureLabel, ownerArea } from '../graphify/feature-labeling.mjs';

const ROOT = process.cwd();
const DEFAULT_INPUT = 'docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md';

function classifyWorkstream(text) {
  if (/agentic.{0,30}(error|repair|fix)|(?:error|repair).{0,30}(fix|agent)/i.test(text)) return 'AGENTIC_ERROR_FIXING';
  if (/fastapi|cpu worker|worker pool|concurren|\/embed\/v2/i.test(text)) return 'EMBEDDING_RUNTIME_ALIGNMENT';
  if (/pgvector|dense search|vector retrieval|qdrant/i.test(text)) return 'DENSE_RETRIEVAL';
  if (/embeddinggemma|semantic_768|embedding representation|mrl/i.test(text)) return 'EMBEDDING_REPRESENTATION_ALIGNMENT';
  return 'OTHER';
}

function sourceRefsIn(text) {
  return [...new Set(text.match(/(?:[\w.-]+\/)+(?:[\w.-]+\.[A-Za-z0-9]+|[\w.-]+\/)/g) ?? [])];
}

export function extractOpenTodosV1(text, sourceRef = DEFAULT_INPUT) {
  const bytes = Buffer.from(text, 'utf8');
  const sourceFileChecksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const lines = text.split(/\r?\n/);
  const newlineBytes = text.includes('\r\n') ? 2 : 1;
  const headings = [];
  const occurrences = new Map();
  const tasks = [];
  let byteOffset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      headings[heading[1].length - 1] = heading[2].trim();
      headings.length = heading[1].length;
    }

    const item = line.match(/^(\s*)-\s+\[ \]\s+(.+?)\s*$/);
    if (item) {
      const task = item[2].trim();
      const parent = headings.filter(Boolean).join(' > ');
      const normalized = `${parent}\n${task}`.toLowerCase().replace(/\s+/g, ' ').trim();
      const occurrence = occurrences.get(normalized) ?? 0;
      occurrences.set(normalized, occurrence + 1);
      const taskId = crypto.createHash('sha256').update(`${normalized}\n${occurrence}`).digest('hex').slice(0, 20);
      const taskText = item[2].trim();
      const taskStartIndex = line.indexOf(taskText);
      const taskStartByte = byteOffset + Buffer.byteLength(line.slice(0, taskStartIndex), 'utf8');
      const sourceRefs = sourceRefsIn(taskText);
      tasks.push({
        taskId,
        task,
        section: parent || null,
        sourceRef,
        lineNumber: index + 1,
        startByte: taskStartByte,
        endByte: taskStartByte + Buffer.byteLength(taskText, 'utf8'),
        sourceFileChecksum,
        domain: assignDomain(taskText),
        featureLabel: assignFeatureLabel(taskText),
        ownerArea: ownerArea(sourceRef),
        workstream: classifyWorkstream(taskText),
        sourceRefs,
        errorFixingEligibility: 'NOT_ESTABLISHED_FROM_TODO_TEXT',
        canonicalAuthority: false,
      });
    }
    byteOffset += Buffer.byteLength(line, 'utf8') + (index < lines.length - 1 ? newlineBytes : 0);
  }

  return {
    schema: 'atlas.master-open-todo-extract.v1',
    input: { sourceRef, sourceFileChecksum, workspaceRevision: null },
    openCount: tasks.length,
    workstreamCounts: Object.fromEntries(
      [...new Set(tasks.map((task) => task.workstream))].sort().map((key) => [key, tasks.filter((task) => task.workstream === key).length]),
    ),
    tasks,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

async function main() {
  const inputArg = process.argv.find((arg) => arg.startsWith('--input='))?.slice('--input='.length) ?? DEFAULT_INPUT;
  const absoluteInput = path.resolve(ROOT, inputArg);
  const text = await fs.readFile(absoluteInput, 'utf8');
  const report = extractOpenTodosV1(text, inputArg.replace(/\\/g, '/'));
  const focus = process.argv.find((arg) => arg.startsWith('--focus='))?.slice('--focus='.length);
  const filteredTasks = focus
    ? report.tasks.filter((task) => new RegExp(focus, 'i').test(`${task.task} ${task.section ?? ''} ${task.workstream}`))
    : report.tasks;
  const workstreamCounts = Object.fromEntries(
    [...new Set(filteredTasks.map((task) => task.workstream))].sort().map((key) => [key, filteredTasks.filter((task) => task.workstream === key).length]),
  );
  console.log(JSON.stringify({
    ...report,
    totalOpenCount: report.openCount,
    openCount: filteredTasks.length,
    workstreamCounts,
    tasks: filteredTasks,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}

#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
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
  return [...new Set(text.match(/(?:[\p{L}\p{N}_.@+()\[\]-]+\/)+(?:[\p{L}\p{N}_.@+()\[\]-]+\.[A-Za-z0-9]+)?/gu) ?? [])];
}

export function extractOpenTodosV1(text, sourceRef = DEFAULT_INPUT, options = {}) {
  const bytes = Buffer.from(text, 'utf8');
  const sourceFileChecksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const lines = text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g).filter((line) => line.length > 0);
  const headings = [];
  const sections = [];
  let sectionLineNumber = null;
  const occurrences = new Map();
  const tasks = [];
  let byteOffset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.replace(/[\r\n]+$/, '');
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      headings[heading[1].length - 1] = heading[2].trim();
      headings.length = heading[1].length;
      sectionLineNumber = index + 1;
      sections.push({ title: heading[2].trim(), level: heading[1].length, lineNumber: sectionLineNumber });
    }

    const item = line.match(/^(\s*)[-*]\s+\[([ xX~])\]\s+(.+?)\s*$/);
    if (item && (options.includeChecked || item[2] === ' ')) {
      const task = item[3].trim();
      const parent = headings.filter(Boolean).join(' > ');
      const normalized = `${parent}\n${task}`.toLowerCase().replace(/\s+/g, ' ').trim();
      const occurrence = occurrences.get(normalized) ?? 0;
      occurrences.set(normalized, occurrence + 1);
      const taskId = crypto.createHash('sha256').update(`${normalized}\n${occurrence}`).digest('hex').slice(0, 20);
      const taskText = item[3].trim();
      const taskStartIndex = line.indexOf(taskText);
      const taskStartByte = byteOffset + Buffer.byteLength(line.slice(0, taskStartIndex), 'utf8');
      const sourceRefs = sourceRefsIn(taskText);
      tasks.push({
        taskId,
        task,
        recordedState: item[2].toLowerCase() === 'x' ? 'CHECKED_CLAIM' : item[2] === '~' ? 'PARTIAL_CLAIM' : 'OPEN_CLAIM',
        qualification: 'NOT_VERIFIED_BY_CHECKLIST',
        section: parent || null,
        sectionLineNumber,
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
    byteOffset += Buffer.byteLength(rawLine, 'utf8');
  }

  return {
    schema: 'atlas.master-open-todo-extract.v1',
    input: { sourceRef, sourceFileChecksum, workspaceRevision: null },
    openCount: tasks.filter((task) => task.recordedState === 'OPEN_CLAIM').length,
    claimCount: tasks.length,
    checkedClaimCount: tasks.filter((task) => task.recordedState === 'CHECKED_CLAIM').length,
    partialClaimCount: tasks.filter((task) => task.recordedState === 'PARTIAL_CLAIM').length,
    sections,
    workstreamCounts: Object.fromEntries(
      [...new Set(tasks.map((task) => task.workstream))].sort().map((key) => [key, tasks.filter((task) => task.workstream === key).length]),
    ),
    tasks,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export async function inspectMasterReferencesV1(report, root, trackedPaths = null) {
  const rootReal = await fs.realpath(root);
  const tracked = new Set((trackedPaths ?? []).map((value) => value.replaceAll('\\', '/')));
  const references = [...new Set(report.tasks.flatMap((task) => task.sourceRefs))].sort();
  if (references.length > 1000) throw new Error('MASTER_REFERENCE_BUDGET_EXCEEDED');
  const inspections = [];
  for (const reference of references) {
    const normalized = reference.replaceAll('\\', '/');
    if (path.isAbsolute(normalized) || /^[a-z]:/i.test(normalized)
      || normalized.includes('\0') || normalized.split('/').includes('..')) {
      inspections.push({ reference, status: 'UNSAFE_REFERENCE_REJECTED', matches: [] });
      continue;
    }
    if (/^[^/]+\.(com|org|net|io|dev)\//i.test(normalized)) {
      inspections.push({ reference, status: 'EXTERNAL_REFERENCE_NOT_FETCHED', matches: [] });
      continue;
    }
    const paths = normalized.startsWith('sveltekit-frontend/')
      ? [normalized] : [normalized, `sveltekit-frontend/${normalized}`];
    const matches = [];
    const errors = [];
    for (const candidate of paths) {
      const absolute = path.resolve(rootReal, candidate);
      try {
        const resolved = await fs.realpath(absolute);
        const relative = path.relative(rootReal, resolved);
        if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
          errors.push({ path: candidate, reason: 'OUTSIDE_WORKSPACE' });
          continue;
        }
        const stat = await fs.stat(resolved);
        matches.push({
          path: candidate,
          resolvedPath: relative.replaceAll('\\', '/'),
          kind: stat.isFile() ? 'FILE' : stat.isDirectory() ? 'DIRECTORY' : 'OTHER',
          bytes: stat.isFile() ? stat.size : null,
          tracked: stat.isFile() && trackedPaths ? tracked.has(candidate) : null,
        });
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error.code)) errors.push({ path: candidate, reason: error.code ?? 'INSPECTION_FAILED' });
      }
    }
    const status = errors.length ? 'REFERENCE_INSPECTION_INCOMPLETE'
      : matches.length > 1 ? 'AMBIGUOUS_REFERENCE'
      : matches.length === 1 ? 'EXACT_REFERENCE_PRESENT'
      : normalized.endsWith('/') ? 'DIRECTORY_OR_SYMBOLIC_REFERENCE_UNRESOLVED' : 'MISSING_EXACT_REFERENCE';
    inspections.push({ reference, status, matches, errors });
  }
  const byReference = new Map(inspections.map((inspection) => [inspection.reference, inspection]));
  const claims = report.tasks.map((task) => ({
    taskId: task.taskId,
    lineNumber: task.lineNumber,
    section: task.section,
    sectionLineNumber: task.sectionLineNumber,
    recordedState: task.recordedState,
    explicitReferenceCount: task.sourceRefs.length,
    references: task.sourceRefs.map((reference) => byReference.get(reference)),
    qualification: 'IMPLEMENTATION_AND_ACCEPTANCE_NOT_PROVEN_BY_PATH_PRESENCE',
  }));
  return {
    schema: 'atlas.master-reference-inspection.v1',
    input: report.input,
    candidateRoots: ['repository root', 'sveltekit-frontend'],
    trackedInventoryProvided: Array.isArray(trackedPaths),
    uniqueReferenceCount: inspections.length,
    referenceStatusCounts: Object.fromEntries([...new Set(inspections.map((item) => item.status))].sort()
      .map((status) => [status, inspections.filter((item) => item.status === status).length])),
    claimsWithoutExplicitReferences: claims.filter((claim) => claim.explicitReferenceCount === 0).length,
    sections: report.sections.map((section) => {
      const sectionClaims = claims.filter((claim) => claim.sectionLineNumber === section.lineNumber);
      return { ...section, claimCount: sectionClaims.length,
        checkedClaims: sectionClaims.filter((claim) => claim.recordedState === 'CHECKED_CLAIM').length,
        claimsWithoutExplicitReferences: sectionClaims.filter((claim) => claim.explicitReferenceCount === 0).length,
        acceptanceQualification: 'OWNER_AND_RECEIPT_REVIEW_REQUIRED' };
    }),
    unsectionedClaimCount: claims.filter((claim) => claim.sectionLineNumber == null).length,
    claims,
    canonicalAuthority: false,
    productionReadinessEstablished: false,
    writesPerformed: false,
    limits: ['Only literal source references extracted from checkbox text are inspected',
      'Missing paths can indicate moved files or shorthand, not missing capability',
      'Untracked paths are not automatically classified as ignored',
      'No file contents, dependencies, services, tests or receipt assertions were evaluated',
      'No recursive directory enumeration; ambiguous root/frontend references remain unresolved'],
  };
}

async function main() {
  const inputArg = process.argv.find((arg) => arg.startsWith('--input='))?.slice('--input='.length) ?? DEFAULT_INPUT;
  const absoluteInput = path.resolve(ROOT, inputArg);
  const text = await fs.readFile(absoluteInput, 'utf8');
  const report = extractOpenTodosV1(text, inputArg.replace(/\\/g, '/'), {
    includeChecked: process.argv.includes('--all'),
  });
  const focus = process.argv.find((arg) => arg.startsWith('--focus='))?.slice('--focus='.length);
  const filteredTasks = focus
    ? report.tasks.filter((task) => new RegExp(focus, 'i').test(`${task.task} ${task.section ?? ''} ${task.workstream}`))
    : report.tasks;
  const workstreamCounts = Object.fromEntries(
    [...new Set(filteredTasks.map((task) => task.workstream))].sort().map((key) => [key, filteredTasks.filter((task) => task.workstream === key).length]),
  );
  const referenceInspection = process.argv.includes('--inspect-references')
    ? await inspectMasterReferencesV1({ ...report, tasks: filteredTasks }, ROOT,
      execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\0').filter(Boolean))
    : undefined;
  console.log(JSON.stringify({
    ...report,
    totalOpenCount: report.openCount,
    totalClaimCount: report.claimCount,
    openCount: filteredTasks.filter((task) => task.recordedState === 'OPEN_CLAIM').length,
    claimCount: filteredTasks.length,
    checkedClaimCount: filteredTasks.filter((task) => task.recordedState === 'CHECKED_CLAIM').length,
    partialClaimCount: filteredTasks.filter((task) => task.recordedState === 'PARTIAL_CLAIM').length,
    workstreamCounts,
    tasks: filteredTasks,
    ...(referenceInspection ? { referenceInspection } : {}),
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const root = process.cwd();
const inventoryPath = path.resolve(process.argv[2] ?? 'docs/reports/wfu09-ns9-identity-lane-metadata-review-v1.json');
const controllerPath = path.resolve(process.argv[3] ?? '.tmp/atlas/wfu09-controller-refresh2/openspec-execution-controller-v1.json');
const reportPath = path.resolve(process.argv[4] ?? 'docs/reports/wfu09-ns9-dependency-text-candidates-v1.json');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash = (file) => hash(fs.readFileSync(file));
const rel = (file) => path.relative(root, file).replaceAll(path.sep, '/');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trimEnd();

const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const controller = JSON.parse(fs.readFileSync(controllerPath, 'utf8'));
if (inventory.schema !== 'atlas.wfu09-ns9-identity-lane-metadata-review.v1'
  || controller.schema !== 'atlas.openspec-execution-controller.v1') {
  throw new Error('Unexpected NS-9 inventory or controller schema.');
}

const byLogical = new Map();
const byChangeAndId = new Map();
const byId = new Map();
for (const row of controller.allTasks ?? []) {
  const logical = typeof row.logicalTaskKey === 'string' ? row.logicalTaskKey : '';
  const sep = logical.indexOf(':');
  if (sep < 1) continue;
  const change = logical.slice(0, sep);
  const id = logical.slice(sep + 1);
  const baseId = id.split('@', 1)[0];
  (byLogical.get(logical) ?? byLogical.set(logical, []).get(logical)).push(row);
  for (const candidateId of new Set([id, baseId])) {
    const globalKey = `${candidateId}`;
    (byId.get(globalKey) ?? byId.set(globalKey, []).get(globalKey)).push(row);
    const scopedKey = `${change}:${candidateId}`;
    (byChangeAndId.get(scopedKey) ?? byChangeAndId.set(scopedKey, []).get(scopedKey)).push(row);
  }
}

const cue = /(?:\bdepends?\s+on\b|\brequires?\b|\bafter\b|\bblocked\s+by\b|\bonly\s+after\b|\bprerequisite\s+for\b|\bgated?\s+(?:behind|on|by)\b)/ig;
const taskId = /\b(?:WFU-\d+[a-z]?|NS-\d+[a-z]?|TOPO-\d+[a-z]?|[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+[a-z]?)(?:\/\d+[a-z]?)*\b/g;
const expandIdToken = (token) => {
  const [first, ...suffixes] = token.split('/');
  const prefix = first.replace(/-\d+[a-z]?$/i, '-');
  return [first, ...suffixes.map((suffix) => `${prefix}${suffix}`)];
};
// These labels can occur in checkbox text and satisfy the broad legacy ID
// shape, but they name encodings/checksums rather than work items.
const nonTaskIdLabels = new Set(['SHA-256', 'UTF-8', 'UTF-16']);
const sourceCache = new Map();
const candidates = [];
const failures = [];
for (const inventoryTask of inventory.tasks ?? []) {
  const sourceRef = String(inventoryTask.sourceRef ?? '').replaceAll('\\', '/');
  const sourcePath = path.resolve(root, sourceRef);
  const relative = path.relative(root, sourcePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    failures.push({ taskKey: inventoryTask.taskKey, reason: 'SOURCE_PATH_ESCAPES_REPOSITORY' });
    continue;
  }
  try {
    if (!sourceCache.has(sourceRef)) {
      const bytes = fs.readFileSync(sourcePath);
      const lines = bytes.toString('utf8').split(/\r?\n/);
      sourceCache.set(sourceRef, { lines, sha256: hash(bytes) });
    }
    const source = sourceCache.get(sourceRef);
    if (source.sha256 !== inventoryTask.sourceFileSha256) {
      failures.push({ taskKey: inventoryTask.taskKey, sourceRef, reason: 'SOURCE_FILE_REVISION_DRIFT' });
      continue;
    }
    const block = taskBlock(source.lines, inventoryTask.sourceLine - 1);
    const observedBlockHash = blockHash(block);
    if (observedBlockHash !== inventoryTask.sourceBlockHash) {
      failures.push({ taskKey: inventoryTask.taskKey, sourceRef, reason: 'SOURCE_BLOCK_HASH_DRIFT' });
      continue;
    }
    const text = block.join('\n');
    const sourceChange = inventoryTask.logicalTaskKey?.split(':')[0]
      ?? /^openspec\/changes\/([^/]+)\/tasks\.md$/.exec(sourceRef)?.[1]
      ?? null;
    const found = new Map();
    for (const cueMatch of text.matchAll(cue)) {
      const contextBeforeCue = text.slice(Math.max(0, cueMatch.index - 48), cueMatch.index);
      if (/\b(?:does|do|did)\s+not\s*$/i.test(contextBeforeCue)) continue;
      if (/^after$/i.test(cueMatch[0]) && /\bno\s+live\s+consumer\s*$/i.test(contextBeforeCue)) continue;
      const cueEnd = cueMatch.index + cueMatch[0].length;
      const tail = text.slice(cueEnd, cueEnd + 56);
      for (const refMatch of tail.matchAll(taskId)) {
        const prefix = tail.slice(0, refMatch.index);
        if (/[.!?;\n]/.test(prefix)) break;
        if (/\b(?:candidates?|files?|generated|changed|list|baseline|report)\b/i.test(prefix)) continue;
        if (/^\s*(?:closing|completing|completion\s+of)\b/i.test(prefix)
          && /^prerequisite\s+for$/i.test(cueMatch[0])) continue;
        const ids = expandIdToken(refMatch[0]);
        for (const id of ids) {
          if (nonTaskIdLabels.has(id)) continue;
          if (id === inventoryTask.logicalTaskKey?.split(':').slice(1).join(':')) continue;
          const local = sourceChange ? byChangeAndId.get(`${sourceChange}:${id}`) ?? [] : [];
          const localSuffix = !local.length && sourceChange
            ? (controller.allTasks ?? []).filter((row) => {
              const logical = typeof row.logicalTaskKey === 'string' ? row.logicalTaskKey : '';
              const separator = logical.indexOf(':');
              if (separator < 1 || logical.slice(0, separator) !== sourceChange) return false;
              const taskIdValue = logical.slice(separator + 1).split('@', 1)[0];
              return taskIdValue.endsWith(`-${id}`);
            })
            : [];
          const global = byId.get(id) ?? [];
          const resolved = local.length === 1 ? local
            : local.length > 1 ? local
              : localSuffix.length ? localSuffix : global;
          const resolution = resolved.length === 1 ? 'UNIQUE_CANDIDATE'
            : resolved.length > 1 ? 'AMBIGUOUS_CANDIDATE' : 'UNRESOLVED_CANDIDATE';
          const resolutionScope = local.length ? 'SAME_CHANGE'
            : localSuffix.length ? 'SAME_CHANGE_SUFFIX' : 'GLOBAL_FALLBACK';
          const start = Math.max(0, cueMatch.index - 56);
          const idEnd = cueEnd + refMatch.index + refMatch[0].length;
          const end = Math.min(text.length, idEnd + 56);
          const key = `${cueMatch.index}:${id}`;
          found.set(key, {
            referencedId: id,
            cue: cueMatch[0],
            resolution,
            resolutionScope,
            candidateTaskKeys: resolved.slice(0, 8).map((row) => row.taskKey).sort(),
            sourceQuote: text.slice(start, end).replace(/\s+/g, ' ').trim(),
            sourceRef,
            sourceLine: inventoryTask.sourceLine,
            sourceBlockHash: observedBlockHash,
            sourceFileSha256: source.sha256,
            decision: null,
            reviewerNotes: null,
            executable: false,
          });
        }
      }
    }
    if (found.size) candidates.push({ taskKey: inventoryTask.taskKey, logicalTaskKey: inventoryTask.logicalTaskKey, candidates: [...found.values()] });
  } catch (error) {
    failures.push({ taskKey: inventoryTask.taskKey, sourceRef, reason: 'SOURCE_READ_FAILED', detail: String(error.message).slice(0, 160) });
  }
}

const refs = candidates.flatMap((row) => row.candidates);
const report = {
  schema: 'atlas.wfu09-ns9-dependency-text-candidates.v1',
  generatedAt: new Date().toISOString(),
  workspaceRevision: git('rev-parse', 'HEAD'),
  authority: 'HUMAN_REVIEW_TEXT_CANDIDATES_ONLY',
  canonicalAuthority: false,
  declarationsWritten: false,
  taskIdsCreatedOrReplaced: 0,
  writes: { database: 0, cache: 0, taskSource: 0, localReport: true },
  scope: inventory.cohort ?? (inventory.counts?.actionable != null ? 'CURRENT_ACTIONABLE_TASKS' : 'IDENTITY_LANE_REVIEW'),
  inputs: {
    taskSourceInventory: { path: rel(inventoryPath), sha256: fileHash(inventoryPath) },
    executionController: { path: rel(controllerPath), sha256: fileHash(controllerPath) },
    generator: { path: rel(fileURLToPath(import.meta.url)), sha256: fileHash(fileURLToPath(import.meta.url)) },
  },
  counts: {
    sourceTasksChecked: inventory.tasks?.length ?? 0,
    sourceTasksWithDependencyCues: candidates.length,
    textReferenceCandidates: refs.length,
    uniquelyResolvable: refs.filter((row) => row.resolution === 'UNIQUE_CANDIDATE').length,
    ambiguous: refs.filter((row) => row.resolution === 'AMBIGUOUS_CANDIDATE').length,
    unresolved: refs.filter((row) => row.resolution === 'UNRESOLVED_CANDIDATE').length,
    sameChangeResolved: refs.filter((row) => ['SAME_CHANGE', 'SAME_CHANGE_SUFFIX'].includes(row.resolutionScope) && row.resolution === 'UNIQUE_CANDIDATE').length,
    failures: failures.length,
  },
  rule: 'A cue plus an ID mention is only a review candidate. It is not a declared dependency and cannot affect scheduling, ranking, readiness, or task execution until a human approves and the owning task ledger receives a source-backed wfu declaration.',
  failures,
  tasks: candidates,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: rel(reportPath), ...report.counts, status: failures.length ? 'PARTIAL_SOURCE_AUDIT' : 'PASS_REVIEW_CANDIDATES' }, null, 2));

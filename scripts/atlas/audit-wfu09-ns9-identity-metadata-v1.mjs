#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { blockHash, parseWfu, taskBlock } from './lib/wfu-metadata.mjs';

const root = process.cwd();
const actionablePath = path.resolve(process.argv[2] ?? '.tmp/atlas/wfu09-history-actionable-v3.json');
const controllerPath = path.resolve(process.argv[3] ?? '.tmp/atlas/wfu09-controller-refresh2/openspec-execution-controller-v1.json');
const reportPath = path.resolve(process.argv[4] ?? 'docs/reports/wfu09-ns9-identity-lane-metadata-review-v1.json');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = (file) => sha256(fs.readFileSync(file));
const rel = (file) => path.relative(root, file).replaceAll(path.sep, '/');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trimEnd();

const actionable = JSON.parse(fs.readFileSync(actionablePath, 'utf8'));
const controller = JSON.parse(fs.readFileSync(controllerPath, 'utf8'));
const generatorPath = fileURLToPath(import.meta.url);
if (actionable.schema !== 'atlas.actionable-workboard.v3' || controller.schema !== 'atlas.openspec-execution-controller.v1') {
  throw new Error('Expected atlas.actionable-workboard.v3 and atlas.openspec-execution-controller.v1 inputs.');
}
const controllerByKey = new Map((controller.allTasks ?? []).map((row) => [row.taskKey, row]));
const textCache = new Map();
const status = new Set(git('status', '--porcelain=v1', '-z', '--untracked-files=no').split('\0').filter(Boolean).map((entry) => entry.slice(3).replaceAll('\\', '/')));
const candidates = actionable.tasks.filter((task) => task.lane === 'IDENTITY_AUTHORITY');
const seen = new Set();
const bindings = [];
const failures = [];
for (const task of candidates) {
  const taskKey = String(task.id ?? '');
  const source = controllerByKey.get(taskKey);
  if (!taskKey || seen.has(taskKey)) {
    failures.push({ taskKey: taskKey || null, reason: taskKey ? 'DUPLICATE_ACTIONABLE_TASK_KEY' : 'MISSING_ACTIONABLE_TASK_KEY' });
    continue;
  }
  seen.add(taskKey);
  if (!source?.source || !Number.isInteger(Number(source.line)) || !source.blockHash) {
    failures.push({ taskKey, reason: 'CONTROLLER_SOURCE_BINDING_MISSING' });
    continue;
  }
  const sourceRef = String(source.source).replaceAll('\\', '/');
  const absoluteSource = path.resolve(root, sourceRef);
  const relativeSource = path.relative(root, absoluteSource);
  if (relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) {
    failures.push({ taskKey, sourceRef, reason: 'SOURCE_PATH_ESCAPES_REPOSITORY' });
    continue;
  }
  try {
    if (!textCache.has(sourceRef)) {
      const bytes = fs.readFileSync(absoluteSource);
      const text = bytes.toString('utf8');
      textCache.set(sourceRef, { bytes, text, lines: text.split(/\r?\n/), sha256: sha256(bytes) });
    }
    const sourceFile = textCache.get(sourceRef);
    const block = taskBlock(sourceFile.lines, Number(source.line) - 1);
    const observedBlockHash = blockHash(block);
    if (observedBlockHash !== source.blockHash) {
      failures.push({ taskKey, sourceRef, line: Number(source.line), expectedBlockHash: source.blockHash, observedBlockHash, reason: 'SOURCE_BLOCK_HASH_MISMATCH' });
      continue;
    }
    const declaration = parseWfu(block.join('\n'));
    bindings.push({
      taskKey,
      logicalTaskKey: source.logicalTaskKey ?? null,
      stableKey: source.stableKey ?? null,
      title: String(source.text ?? task.title ?? ''),
      sourceRef,
      sourceLine: Number(source.line),
      sourceBlockHash: observedBlockHash,
      sourceFileSha256: sourceFile.sha256,
      sourceFileDirty: status.has(sourceRef),
      declarations: declaration ? {
        depends: declaration.dependsOn,
        estimatedMinutes: declaration.est,
        reads: declaration.reads,
        writes: declaration.writes,
        warnings: declaration.warnings,
      } : null,
      reviewerDecision: null,
      reviewerNotes: null,
      canonicalAuthority: false,
    });
  } catch (error) {
    failures.push({ taskKey, sourceRef, reason: 'SOURCE_READ_FAILED', detail: String(error.message).slice(0, 160) });
  }
}

const declarations = bindings.map((row) => row.declarations).filter(Boolean);
const counts = {
  actionableIdentityLaneRows: candidates.length,
  uniqueTaskKeys: seen.size,
  rowsWithLogicalTaskKey: bindings.filter((row) => row.logicalTaskKey).length,
  rowsWithStableKey: bindings.filter((row) => row.stableKey).length,
  exactCurrentSourceBindings: bindings.length,
  sourceBindingFailures: failures.length,
  rowsWithAnyWfuDeclaration: declarations.length,
  rowsWithDependsDeclaration: declarations.filter((row) => row.depends !== null).length,
  declaredDependencyEdges: declarations.reduce((n, row) => n + (row.depends?.length ?? 0), 0),
  rowsWithEstimate: declarations.filter((row) => row.estimatedMinutes !== null).length,
  rowsWithReadsDeclaration: declarations.filter((row) => row.reads !== null).length,
  rowsWithWritesDeclaration: declarations.filter((row) => row.writes !== null).length,
  rowsOnDirtySourceFiles: bindings.filter((row) => row.sourceFileDirty).length,
};
const report = {
  schema: 'atlas.wfu09-ns9-identity-lane-metadata-review.v1',
  generatedAt: new Date().toISOString(),
  workspaceRevision: git('rev-parse', 'HEAD'),
  authority: 'HUMAN_REVIEW_INVENTORY_ONLY',
  canonicalAuthority: false,
  taskMetadataMutationAuthorized: false,
  taskIdsCreatedOrReplaced: 0,
  writes: { database: 0, cache: 0, taskSource: 0, localReport: true },
  inputs: {
    actionableWorkboard: { path: rel(actionablePath), sha256: fileHash(actionablePath) },
    executionController: { path: rel(controllerPath), sha256: fileHash(controllerPath) },
    generator: { path: rel(generatorPath), sha256: fileHash(generatorPath) },
  },
  counts,
  reviewContract: {
    fields: ['depends', 'estimatedMinutes', 'reads', 'writes'],
    rule: 'Blank reviewer decisions are intentional. Existing task keys and source block hashes are review anchors; the inventory proposes no metadata values.',
    provenance: 'Every row is bound to the controller task key, source reference, exact line, current task-block SHA-256, and current source-file SHA-256.',
  },
  failures,
  tasks: bindings,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: rel(reportPath), ...counts, status: failures.length ? 'PARTIAL_SOURCE_BINDING' : 'PASS_REVIEW_INVENTORY' }, null, 2));

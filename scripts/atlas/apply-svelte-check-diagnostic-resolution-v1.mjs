#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDiagnosticResolutionReceiptV1,
  verifyCaptureArtifactsV1,
} from '../../sveltekit-frontend/scripts/svelte-check-capture.mjs';
import { projectDiagnosticResolutionOnBoardV1 } from './lib/svelte-check-diagnostic-resolution-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultBoard = 'docs/reports/atlas/atlas-kanban-tasks.json';

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function readJsonFile(relativePath, code) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) throw new Error(code);
  const absolutePath = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, absolutePath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(code);
  if (!existsSync(absolutePath) || lstatSync(absolutePath).isSymbolicLink() || !lstatSync(absolutePath).isFile()) throw new Error(code);
  const real = realpathSync(absolutePath);
  const realRelative = path.relative(repoRoot, real);
  if (!realRelative || realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error(code);
  const bytes = readFileSync(real);
  return { absolutePath: real, value: JSON.parse(bytes.toString('utf8')), bytes };
}

function readRepoFile(relativePath, code) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) throw new Error(code);
  const absolutePath = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, absolutePath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(code);
  if (!existsSync(absolutePath) || lstatSync(absolutePath).isSymbolicLink() || !lstatSync(absolutePath).isFile()) throw new Error(code);
  const real = realpathSync(absolutePath);
  const realRelative = path.relative(repoRoot, real);
  if (!realRelative || realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error(code);
  return { absolutePath: real, bytes: readFileSync(real) };
}

function readArtifactSet(refs) {
  if (!refs || typeof refs !== 'object') throw new Error('DIAGNOSTIC_RESOLUTION_ARTIFACT_REFS_MISSING');
  for (const name of ['summary', 'todos', 'diagnostics', 'log']) {
    if (typeof refs[name] !== 'string') throw new Error('DIAGNOSTIC_RESOLUTION_ARTIFACT_REF_INVALID');
  }
  const summaryArtifact = readJsonFile(refs.summary, 'DIAGNOSTIC_RESOLUTION_SUMMARY_PATH_INVALID');
  const todosArtifact = readJsonFile(refs.todos, 'DIAGNOSTIC_RESOLUTION_TODOS_PATH_INVALID');
  for (const name of ['summary', 'todos', 'diagnostics', 'log']) {
    const expected = path.relative(repoRoot, path.resolve(repoRoot, 'sveltekit-frontend', summaryArtifact.value.outputs?.[name] ?? '')).replace(/\\/g, '/');
    if (expected !== refs[name]) throw new Error('DIAGNOSTIC_RESOLUTION_ARTIFACT_REF_MISMATCH');
  }
  // Read every referenced artifact under the repository boundary. Summary verification checks bytes and hashes.
  readRepoFile(refs.diagnostics, 'DIAGNOSTIC_RESOLUTION_DIAGNOSTICS_PATH_INVALID');
  readRepoFile(refs.log, 'DIAGNOSTIC_RESOLUTION_LOG_PATH_INVALID');
  return { summaryArtifact, todosArtifact };
}

function parseArgs(args) {
  let receiptPath;
  let boardPath = defaultBoard;
  let write = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--receipt') receiptPath = args[++index];
    else if (args[index] === '--board') boardPath = args[++index];
    else if (args[index] === '--write') write = true;
    else throw new Error(`UNKNOWN_ARGUMENT:${args[index]}`);
  }
  if (!receiptPath) throw new Error('RECEIPT_REQUIRED: --receipt <repo-relative-path>');
  return { receiptPath, boardPath, write };
}

export function verifyAndProjectDiagnosticResolutionV1({ receiptPath, boardPath = defaultBoard, write = false }) {
  const receiptArtifact = readJsonFile(receiptPath, 'DIAGNOSTIC_RESOLUTION_RECEIPT_PATH_INVALID');
  const { value: receipt } = receiptArtifact;
  const previous = readArtifactSet(receipt.artifacts?.previous);
  const current = readArtifactSet(receipt.artifacts?.current);
  const previousVerified = verifyCaptureArtifactsV1(previous.summaryArtifact, previous.todosArtifact);
  const currentVerified = verifyCaptureArtifactsV1(current.summaryArtifact, current.todosArtifact);
  if (!previousVerified || !currentVerified) throw new Error('DIAGNOSTIC_RESOLUTION_ARTIFACT_READBACK_FAILED');

  const recomputed = buildDiagnosticResolutionReceiptV1(
    previous.summaryArtifact.value,
    previous.todosArtifact.value,
    current.summaryArtifact.value,
    current.todosArtifact.value,
    { previousArtifactsVerified: previousVerified, currentArtifactsVerified: currentVerified },
  );
  const { artifacts: _artifacts, ...providedCore } = receipt;
  if (JSON.stringify(recomputed) !== JSON.stringify(providedCore)) throw new Error('DIAGNOSTIC_RESOLUTION_RECEIPT_RECOMPUTE_MISMATCH');

  const boardArtifact = readJsonFile(boardPath, 'DIAGNOSTIC_RESOLUTION_BOARD_PATH_INVALID');
  const projected = projectDiagnosticResolutionOnBoardV1({
    board: boardArtifact.value,
    receipt,
    receiptSha256: sha256(receiptArtifact.bytes),
    artifactReadbackVerified: true,
  });
  let boardWrite = { performed: false, verified: false };
  if (write && projected.matchedCount > 0) {
    const output = Buffer.from(`${JSON.stringify(projected.board, null, 2)}\n`, 'utf8');
    const tempPath = `${boardArtifact.absolutePath}.resolution-${process.pid}.tmp`;
    writeFileSync(tempPath, output, { flag: 'wx' });
    renameSync(tempPath, boardArtifact.absolutePath);
    const readback = readFileSync(boardArtifact.absolutePath);
    if (sha256(readback) !== sha256(output)) throw new Error('DIAGNOSTIC_RESOLUTION_BOARD_READBACK_FAILED');
    boardWrite = { performed: true, verified: true };
  }
  return {
    schema: 'atlas.svelte-check-diagnostic-board-projection.v1',
    mode: write ? 'EXPLICIT_LOCAL_JSON_WRITE' : 'DRY_RUN',
    receiptSha256: sha256(receiptArtifact.bytes),
    resolvedCandidateCount: projected.resolvedCandidateCount,
    matchedCount: projected.matchedCount,
    unmatchedFingerprints: projected.unmatchedFingerprints,
    boardWrite,
    boardTaskStatusesChanged: false,
    canonicalTaskStatusesChanged: false,
    completionAuthorized: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(verifyAndProjectDiagnosticResolutionV1(args), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  }
}

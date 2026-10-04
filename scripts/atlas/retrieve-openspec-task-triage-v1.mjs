#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectOpenSpecTaskCardsV1 } from './lib/openspec-report-manifest-v1.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpusPath = resolve(root, 'docs/reports/openspec-task-triage-corpus-v1.json');

function repoPath(relativePath) {
  return resolve(root, relativePath.split('/').join(sep));
}

function verifyCurrentTaskLedgers(corpus) {
  const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (corpus.workspaceHead !== currentHead) throw new Error('TRIAGE_CORPUS_WORKSPACE_STALE');
  const hashes = corpus.taskCardCorpus?.source?.taskFileHashes;
  if (!hashes || typeof hashes !== 'object') throw new Error('TRIAGE_TASK_FILE_HASHES_MISSING');
  for (const [relativePath, expected] of Object.entries(hashes)) {
    const actual = `sha256:${createHash('sha256').update(readFileSync(repoPath(relativePath), 'utf8')).digest('hex')}`;
    if (actual !== expected) throw new Error(`TRIAGE_TASK_FILE_REVISION_MISMATCH:${relativePath}`);
  }
}

function parseArgs(argv) {
  const args = { includeHistory: false, limit: 100 };
  for (const value of argv) {
    if (value === '--history') args.includeHistory = true;
    else if (value.startsWith('--limit=')) args.limit = Number(value.slice('--limit='.length));
    else throw new Error(`UNKNOWN_ARGUMENT:${value}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
  verifyCurrentTaskLedgers(corpus);
  const result = selectOpenSpecTaskCardsV1({ corpus, ...args });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';
const sourcePath = 'openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md';
const sheetPath = 'docs/reports/openspec-cohort-6527-identity-review-sheet-v1.json';
const remoteRef = option('remote-ref');
const remoteBlobSha = option('remote-blob-sha').toLowerCase();
const reportPath = option('report');

if (remoteRef !== 'main' || !/^[0-9a-f]{40}$/.test(remoteBlobSha) || !reportPath) {
  throw new Error('REQUIRES --remote-ref=main --remote-blob-sha=<40-hex> --report=<path>');
}

const sourceBytes = readFileSync(path.join(root, sourcePath));
const sourceText = sourceBytes.toString('utf8');
const lines = sourceText.split(/\r?\n/);
const sheet = JSON.parse(readFileSync(path.join(root, sheetPath), 'utf8'));
if (sheet.rows.length !== 241) throw new Error(`REVIEW_SHEET_ROW_COUNT_MISMATCH:${sheet.rows.length}`);
const rows = sheet.rows.filter((row) => row.sourceTask.sourceRef.startsWith(`${sourcePath}#L`));
if (rows.length !== 29) throw new Error(`SOURCE_ROW_COUNT_MISMATCH:${rows.length}`);
const pendingReviewCount = sheet.rows.filter((row) => row.review?.decision === 'PENDING_HUMAN_REVIEW').length;
if (pendingReviewCount !== 241) throw new Error(`REVIEW_DECISION_STATE_MISMATCH:${pendingReviewCount}`);

const verifiedRows = rows.map((row) => {
  const sourceRef = row.sourceTask.sourceRef;
  const lineNumber = Number(sourceRef.slice(sourceRef.lastIndexOf('#L') + 2));
  if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) {
    throw new Error(`SOURCE_LINE_OUT_OF_RANGE:${sourceRef}`);
  }
  const lineText = lines[lineNumber - 1];
  if (lineText !== row.sourceTask.taskLine) throw new Error(`SOURCE_LINE_TEXT_MISMATCH:${sourceRef}`);
  const observedBlockSha256 = blockHash(taskBlock(lines, lineNumber - 1));
  if (observedBlockSha256 !== row.sourceTask.sourceBlockSha256) {
    throw new Error(`SOURCE_BLOCK_HASH_MISMATCH:${sourceRef}`);
  }
  return {
    reviewIndex: row.reviewIndex,
    identityBasis: row.identityBasis,
    sourceRef,
    sourceTaskKey: row.sourceTask.existingCanonicalTaskKey,
    candidateTaskKey: row.workboardCandidate.existingTaskKey,
    blockSha256: observedBlockSha256,
  };
});

const gitBlobSha = execFileSync('git', ['hash-object', sourcePath], { cwd: root, encoding: 'utf8' }).trim();
if (gitBlobSha !== remoteBlobSha) throw new Error(`GITHUB_MAIN_BLOB_MISMATCH:${gitBlobSha}:${remoteBlobSha}`);
const sourceSha256 = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const report = {
  schema: 'atlas.openspec-cohort-6527-source-recovery.v1',
  generatedAt: new Date().toISOString(),
  status: 'PASS_REMOTE_BLOB_AND_29_SOURCE_BINDINGS_MATCH',
  canonicalAuthority: false,
  reviewerDecisionsChanged: false,
  taskIdsReplaced: false,
  kanbanRowsCreated: false,
  databaseWritesPerformed: false,
  reviewSheet: { path: sheetPath, rows: sheet.rows.length, sourceBindingRevision: sheet.sourceBindingRevision },
  remote: {
    provider: 'GitHub contents file fetch',
    ref: remoteRef,
    path: sourcePath,
    returnedContentFieldEmpty: true,
    reportedBlobSha: remoteBlobSha,
    displayUrl: `https://github.com/semaj90/deeds_web_app/blob/${remoteRef}/${sourcePath}`,
  },
  local: {
    head,
    path: sourcePath,
    gitBlobSha,
    fileSha256: sourceSha256,
    bytes: sourceBytes.byteLength,
    lines: lines.length,
  },
  verification: {
    rowsChecked: rows.length,
    exactSourceLines: verifiedRows.length,
    exactTaskBlockHashes: verifiedRows.length,
    remoteBlobMatchesLocalGitBlob: true,
  },
  reviewQueueTriage: {
    reviewerDecisions: { total: sheet.rows.length, pending: pendingReviewCount },
    sourceUnavailableP0: 0,
    identityBasisCounts: sheet.rows.reduce((counts, row) => {
      counts[row.identityBasis] = (counts[row.identityBasis] ?? 0) + 1;
      return counts;
    }, {}),
    refreshedPriorities: {
      p0MissingSource: 0,
      p1MigrationTitleHash: sheet.rows.filter((row) => row.identityBasis === 'MIGRATION_TITLE_HASH_REQUIRES_REVIEW').length,
      p2SectionQualified: sheet.rows.filter((row) => row.identityBasis === 'DECLARED_ID_SECTION_QUALIFIED_UNIQUE').length,
      p3DeclaredUnique: sheet.rows.filter((row) => row.identityBasis === 'DECLARED_ID_UNIQUE').length,
    },
    recoveredRowsByIdentityBasis: verifiedRows.reduce((counts, row) => {
      counts[row.identityBasis] = (counts[row.identityBasis] ?? 0) + 1;
      return counts;
    }, {}),
    approvalsOrTaskMappingsCreated: false,
  },
  rows: verifiedRows,
};

const target = path.resolve(root, reportPath);
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, rowsChecked: rows.length, sourceSha256, gitBlobSha, reportPath: path.relative(root, target).replace(/\\/g, '/') }, null, 2));

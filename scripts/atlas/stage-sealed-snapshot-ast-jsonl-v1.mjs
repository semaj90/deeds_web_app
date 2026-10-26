#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageSealedSnapshotSourceV1, validateSealedSnapshotInventoryPlanV1 } from './lib/sealed-snapshot-ast-jsonl-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] ?? '';
};
const hashFile = (filePath) => createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

function resolveTmpPath(relativePath, allowExisting = false) {
  const absolute = path.resolve(repoRoot, relativePath);
  const relative = path.relative(path.join(repoRoot, '.tmp'), absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('OUTPUT_MUST_BE_UNDER_REPO_TMP');
  if (!allowExisting && fs.existsSync(absolute)) throw new Error('OUTPUT_ALREADY_EXISTS');
  if (allowExisting && !fs.existsSync(absolute)) throw new Error('RESUME_OUTPUT_MISSING');
  return absolute;
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Usage: node scripts/atlas/stage-sealed-snapshot-ast-jsonl-v1.mjs --plan <plan.json> --snapshot-root <path> --output <.tmp/path.jsonl> [--limit <n>]\n');
    return;
  }
  const planPath = path.resolve(repoRoot, value('--plan', '.tmp/atlas/sealed-inventory-first-seen-20261017.plan.json'));
  const snapshotRoot = path.resolve(repoRoot, value('--snapshot-root', '.tmp/workspace-source-snapshots/6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b'));
  const resume = args.includes('--resume');
  const outputPath = resolveTmpPath(value('--output', `.tmp/atlas/staged-ast-${Date.now()}.jsonl`), resume);
  const limit = Number(value('--limit', '0'));
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('LIMIT_INVALID');
  const planBytes = fs.readFileSync(planPath);
  const plan = validateSealedSnapshotInventoryPlanV1(JSON.parse(planBytes.toString('utf8')));
  if (plan.snapshotRevision.slice('sha256:'.length) !== path.basename(snapshotRoot)) throw new Error('SNAPSHOT_ROOT_REVISION_MISMATCH');
  const rows = limit > 0 ? plan.rows.slice(0, limit) : plan.rows;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const receiptPath = `${outputPath}.receipt.json`;
  if (fs.existsSync(receiptPath)) throw new Error('STAGING_RECEIPT_ALREADY_EXISTS');
  const existingLines = resume ? fs.readFileSync(outputPath, 'utf8').split('\n') : [];
  if (resume && existingLines.at(-1) !== '') throw new Error('RESUME_OUTPUT_HAS_PARTIAL_FINAL_LINE');
  const stagedCount = resume ? existingLines.length - 1 : 0;
  if (stagedCount < 0 || stagedCount > rows.length) throw new Error('RESUME_ROW_COUNT_INVALID');
  const statusCounts = {};
  let observationCount = 0;
  const outputHash = createHash('sha256');
  if (resume) {
    const existingBytes = fs.readFileSync(outputPath);
    outputHash.update(existingBytes);
    for (let index = 0; index < stagedCount; index += 1) {
      const staged = JSON.parse(existingLines[index]);
      const expected = rows[index];
      if (staged.schema !== 'atlas.staged-ast-source.v1'
        || staged.sourceRef !== expected.sourceRef
        || staged.sourceRevision !== expected.codeSourceRevision
        || staged.workspaceRevision !== expected.workspaceRevision
        || staged.snapshotRevision !== plan.snapshotRevision
        || staged.contentSha256 !== expected.contentHash
        || staged.byteLength !== expected.byteLength
        || staged.canonicalAuthority !== false
        || staged.databaseWrites !== false) throw new Error(`RESUME_PREFIX_MISMATCH:${index}`);
      statusCounts[staged.status] = (statusCounts[staged.status] ?? 0) + 1;
      observationCount += staged.observations?.length ?? 0;
    }
  }
  const output = fs.openSync(outputPath, resume ? 'a' : 'wx');
  try {
    for (let index = stagedCount; index < rows.length; index += 1) {
      const input = rows[index];
      const staged = stageSealedSnapshotSourceV1({ row: input, snapshotRoot, plan });
      const line = `${JSON.stringify(staged)}\n`;
      fs.writeSync(output, line);
      outputHash.update(line);
      statusCounts[staged.status] = (statusCounts[staged.status] ?? 0) + 1;
      observationCount += staged.observations?.length ?? 0;
      if ((index + 1) % 500 === 0 || index + 1 === rows.length) {
        process.stderr.write(`staged ${index + 1}/${rows.length}\n`);
      }
    }
  } finally {
    fs.closeSync(output);
  }
  const receipt = {
    schema: 'atlas.staged-ast-jsonl-receipt.v1',
    inputPlan: path.relative(repoRoot, planPath).replaceAll('\\', '/'),
    inputPlanSha256: hashFile(planPath),
    workspaceRevision: plan.workspaceRevision,
    snapshotRevision: plan.snapshotRevision,
    requestedSourceCount: rows.length,
    stagedSourceCount: rows.length,
    resumedSourceCount: stagedCount,
    statusCounts,
    observationCount,
    outputPath: path.relative(repoRoot, outputPath).replaceAll('\\', '/'),
    outputSha256: outputHash.digest('hex'),
    canonicalAuthority: false,
    databaseWrites: false,
    projectionWrites: false,
  };
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ ...receipt, receiptPath: path.relative(repoRoot, receiptPath).replaceAll('\\', '/') }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

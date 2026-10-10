import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPortfolioCensus } from './audit-openspec-evidence-fabric-v1.mjs';
import { buildOpenSpecTaskCardReportV1, evaluateTaskEvidenceAdmissionV1 } from './lib/openspec-task-card-v1.mjs';
import { verifyProofChainV1 } from './lib/proof-chain-verifier-v1.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactKeys = ['taskCard', 'evidenceTask', 'evidenceCard', 'receipt', 'receiptBindings', 'ontologyTuple', 'contextManifest'] as const;
type ArtifactKey = typeof artifactKeys[number];

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function readArtifact(file: string): Promise<{ value: unknown; rawChecksum: string }> {
  const absolutePath = path.resolve(ROOT, file);
  const resolvedPath = await realpath(absolutePath);
  const relativePath = path.relative(ROOT, resolvedPath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`ARTIFACT_OUTSIDE_REPOSITORY:${file}`);
  }
  const bytes = await readFile(resolvedPath);
  return { value: JSON.parse(bytes.toString('utf8')), rawChecksum: sha256(bytes) };
}

function independentlyReadArtifacts(files: Record<string, string>): Record<string, { rawChecksum: string; canonicalChecksum: string }> {
  const reader = [
    "const fs = require('node:fs');",
    "const crypto = require('node:crypto');",
    "const input = JSON.parse(process.argv[1]);",
    "const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value !== null && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);",
    "const digest = value => 'sha256:' + crypto.createHash('sha256').update(value).digest('hex');",
    "const output = Object.fromEntries(Object.entries(input).map(([key, file]) => { const bytes = fs.readFileSync(file); const value = JSON.parse(bytes.toString('utf8')); return [key, { rawChecksum: digest(bytes), canonicalChecksum: digest(canonical(value)) }]; }));",
    "process.stdout.write(JSON.stringify(output));",
  ].join('\n');
  const child = spawnSync(process.execPath, ['-e', reader, JSON.stringify(files)], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (child.status !== 0) throw new Error(`INDEPENDENT_READBACK_PROCESS_FAILED:${child.stderr.trim()}`);
  return JSON.parse(child.stdout);
}

async function runCurrentTask(changeId: string, taskId: string, tuplePath?: string, manifestPath?: string): Promise<void> {
  const workboardProcess = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/atlas/build-openspec-workboard-v1.mjs'),
    '--task-snapshot-stdout',
  ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (workboardProcess.status !== 0) throw new Error(`WORKBOARD_SNAPSHOT_FAILED:${workboardProcess.stderr.trim()}`);
  const workboard = JSON.parse(workboardProcess.stdout);
  const census = buildPortfolioCensus(ROOT);
  const taskReport = buildOpenSpecTaskCardReportV1({
    workboard,
    evidenceCensus: census,
    head: census.source.gitCommit,
    taskFileHashes: workboard.sourceFileHashes,
  });
  const cards = taskReport.cards.filter((card: Record<string, any>) => card.changeId === changeId && card.declaredTaskId === taskId);
  if (cards.length !== 1) throw new Error(`CURRENT_TASK_CARDINALITY_INVALID:${cards.length}`);
  const taskCard = cards[0];
  const evidenceTasks = census.tasks.filter((task: Record<string, any>) => task.taskRef === taskCard.taskRef && !task.archived);
  const evidenceCards = census.evidenceCards.filter((card: Record<string, any>) => card.taskRef === taskCard.taskRef);
  if (evidenceTasks.length !== 1 || evidenceCards.length !== 1) throw new Error('CURRENT_TASK_EVIDENCE_CARD_CARDINALITY_INVALID');
  const evidenceTask = evidenceTasks[0];
  const evidenceCard = evidenceCards[0];
  const receiptBindings = census.evidenceMatches.filter((binding: Record<string, any>) => evidenceCard.evidenceIds?.includes(binding.evidenceId));
  const admission = evaluateTaskEvidenceAdmissionV1({ taskCard, evidenceTask, evidenceCard, receiptBindings });
  const receiptId = admission.evidenceRefs[0] ?? evidenceCard.evidenceIds?.[0] ?? null;
  const receiptIndex = receiptId
    ? census.evidenceReceipts.find((candidate: Record<string, any>) => candidate.evidenceId === receiptId)
    : null;
  let receipt: Record<string, any> = {};
  if (receiptIndex?.uri) {
    const receiptPath = path.resolve(ROOT, receiptIndex.uri);
    const resolvedReceiptPath = await realpath(receiptPath);
    const relativeReceiptPath = path.relative(ROOT, resolvedReceiptPath);
    if (!relativeReceiptPath || relativeReceiptPath.startsWith('..') || path.isAbsolute(relativeReceiptPath)) {
      throw new Error('EVIDENCE_RECEIPT_OUTSIDE_REPOSITORY');
    }
    receipt = JSON.parse(await readFile(resolvedReceiptPath, 'utf8'));
  }
  const tuple = tuplePath ? (await readArtifact(tuplePath)).value as Record<string, any> : null;
  const manifest = manifestPath ? (await readArtifact(manifestPath)).value as Record<string, any> : null;
  const scratchDirectory = path.join(ROOT, '.tmp', 'atlas', `proof-chain-current-${Date.now()}`);
  await mkdir(scratchDirectory, { recursive: true });
  const values: Record<string, unknown> = {
    taskCard,
    evidenceTask,
    evidenceCard,
    receipt,
    receiptBindings,
    ontologyTuple: tuple,
    contextManifest: manifest,
  };
  const fileByKey = new Map<string, string>();
  for (const [key, value] of Object.entries(values)) {
    const file = path.join(scratchDirectory, `${key}.json`);
    await writeFile(file, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'wx' });
    fileByKey.set(key, path.relative(ROOT, file));
  }
  const reread = await Promise.all(Object.entries(values).map(async ([key]) => [key, await readArtifact(fileByKey.get(key)!)] as const));
  const readbackValues: Record<string, any> = Object.fromEntries(reread.map(([key, result]) => [key, result.value]));
  const independentChecksums = independentlyReadArtifacts(Object.fromEntries(fileByKey));
  const readbackArtifacts = [
    ['task-card', readbackValues.taskCard],
    ['evidence-card', readbackValues.evidenceCard],
    ['evidence-receipt', readbackValues.receipt],
    ['receipt-bindings', readbackValues.receiptBindings],
    ['ontology-tuple', readbackValues.ontologyTuple],
    ['context-manifest', readbackValues.contextManifest],
  ] as const;
  const readbackStable = reread.every(([key, first]) => first.rawChecksum === independentChecksums[key]?.rawChecksum
    && independentChecksums[key]?.canonicalChecksum === `sha256:${createHash('sha256').update(canonicalJson(first.value)).digest('hex')}`);
  const result = verifyProofChainV1({
    taskCard: readbackValues.taskCard,
    evidenceTask: readbackValues.evidenceTask,
    evidenceCard: readbackValues.evidenceCard,
    receipt: readbackValues.receipt,
    receiptBindings: readbackValues.receiptBindings,
    ontologyTuple: readbackValues.ontologyTuple,
    contextManifest: readbackValues.contextManifest,
    artifactReadback: {
      source: 'FIXTURE',
      independentlyReopened: readbackStable,
      artifacts: readbackArtifacts.map(([artifactId, value]) => ({
        artifactId,
        checksum: independentChecksums[artifactId === 'task-card' ? 'taskCard'
          : artifactId === 'evidence-card' ? 'evidenceCard'
            : artifactId === 'evidence-receipt' ? 'receipt'
              : artifactId === 'receipt-bindings' ? 'receiptBindings'
                : artifactId === 'ontology-tuple' ? 'ontologyTuple' : 'contextManifest']?.canonicalChecksum ?? '',
      })),
    },
  });
  process.stdout.write(`${JSON.stringify({
    ...result,
    taskRef: taskCard.taskRef,
    taskAdmissionStatus: admission.admitted ? 'ADMITTED_TASK_CLAIM_ONLY' : 'BLOCKED',
    evidenceId: receiptId,
    workspaceRevision: census.source.workspaceRevision,
    taskCardWorkspaceRevision: taskCard.workspaceRevision,
    taskSourceRevision: taskCard.sourceRevision,
    tupleProvided: Boolean(tuplePath),
    contextManifestProvided: Boolean(manifestPath),
    scratchReadbackDirectory: path.relative(ROOT, scratchDirectory).replaceAll(path.sep, '/'),
    scratchArtifactRawChecksums: Object.fromEntries(Object.entries(independentChecksums).map(([key, value]) => [key, value.rawChecksum])),
  }, null, 2)}\n`);
  if (result.status === 'BLOCKED') process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Usage: npm run atlas:proof-chain:verify -- --bundle=<repo-relative-json>\n       npm run atlas:proof-chain:verify -- --change-id=<id> --task-id=<id> [--ontology-tuple=<json>] [--context-manifest=<json>]\nCurrent-task mode reads existing TaskCard/receipt owners, writes bounded scratch projections under .tmp, and always reports fixture-only status.\n');
    return;
  }
  const changeId = args.find((arg) => arg.startsWith('--change-id='))?.slice('--change-id='.length);
  const taskId = args.find((arg) => arg.startsWith('--task-id='))?.slice('--task-id='.length);
  if (changeId || taskId) {
    if (!changeId || !taskId) throw new Error('CURRENT_TASK_MODE_REQUIRES_CHANGE_ID_AND_TASK_ID');
    await runCurrentTask(
      changeId,
      taskId,
      args.find((arg) => arg.startsWith('--ontology-tuple='))?.slice('--ontology-tuple='.length),
      args.find((arg) => arg.startsWith('--context-manifest='))?.slice('--context-manifest='.length),
    );
    return;
  }
  const bundleArg = args.find((arg) => arg.startsWith('--bundle='))?.slice('--bundle='.length);
  if (!bundleArg) throw new Error('REQUIRED: --bundle=<repo-relative-json>');
  const bundle = (await readArtifact(bundleArg)).value as Record<string, unknown>;
  if (bundle?.schema !== 'atlas.proof-chain-input-bundle.v1') throw new Error('PROOF_CHAIN_BUNDLE_SCHEMA_INVALID');
  const paths = bundle.artifactPaths as Record<ArtifactKey, string> | undefined;
  if (!paths || artifactKeys.some((key) => typeof paths[key] !== 'string' || paths[key].length === 0)) {
    throw new Error('PROOF_CHAIN_BUNDLE_ARTIFACT_PATHS_INCOMPLETE');
  }

  const firstRead = Object.fromEntries(await Promise.all(artifactKeys.map(async (key) => [key, await readArtifact(paths[key])]))) as Record<ArtifactKey, { value: any; rawChecksum: string }>;
  const secondRead = Object.fromEntries(await Promise.all(artifactKeys.map(async (key) => [key, await readArtifact(paths[key])]))) as Record<ArtifactKey, { value: any; rawChecksum: string }>;
  const independentChecksums = independentlyReadArtifacts(Object.fromEntries(artifactKeys.map((key) => [key, path.resolve(ROOT, paths[key])])));
  const rereadMismatch = artifactKeys.filter((key) => firstRead[key].rawChecksum !== secondRead[key].rawChecksum
    || secondRead[key].rawChecksum !== independentChecksums[key]?.rawChecksum
    || independentChecksums[key]?.canonicalChecksum !== `sha256:${createHash('sha256').update(canonicalJson(secondRead[key].value)).digest('hex')}`);
  if (rereadMismatch.length) throw new Error(`INDEPENDENT_FILE_READBACK_MISMATCH:${rereadMismatch.join(',')}`);
  if (!Array.isArray(firstRead.receiptBindings.value)) throw new Error('RECEIPT_BINDINGS_MUST_BE_ARRAY');

  const values = Object.fromEntries(artifactKeys.map((key) => [key, secondRead[key].value])) as Record<ArtifactKey, any>;
  const readbackArtifacts = [
    ['task-card', 'taskCard'],
    ['evidence-card', 'evidenceCard'],
    ['evidence-receipt', 'receipt'],
    ['receipt-bindings', 'receiptBindings'],
    ['ontology-tuple', 'ontologyTuple'],
    ['context-manifest', 'contextManifest'],
  ] as const;
  const result = verifyProofChainV1({
    taskCard: values.taskCard,
    evidenceTask: values.evidenceTask,
    evidenceCard: values.evidenceCard,
    receipt: values.receipt,
    receiptBindings: values.receiptBindings,
    ontologyTuple: values.ontologyTuple,
    contextManifest: values.contextManifest,
    artifactReadback: {
      source: 'FIXTURE',
      independentlyReopened: true,
      artifacts: readbackArtifacts.map(([artifactId, key]) => ({
        artifactId,
        checksum: independentChecksums[key].canonicalChecksum,
      })),
    },
  });
  process.stdout.write(`${JSON.stringify({ ...result, bundleRawChecksum: sha256(Buffer.from(canonicalJson(bundle))), artifactRawChecksums: Object.fromEntries(artifactKeys.map((key) => [key, independentChecksums[key].rawChecksum])) }, null, 2)}\n`);
  if (result.status === 'BLOCKED') process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

#!/usr/bin/env node

/**
 * Normalize a bounded svelte-check machine-JSONL artifact into evidence.
 * This is intentionally an input-file adapter: it does not execute a checker,
 * parse terminal prose, mutate source, or persist to a canonical datastore.
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, parseMachineJsonl } from './typescript-error-evidence-v1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argument = (name) => {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

const inputPath = argument('--input');
if (!inputPath) {
  console.error('Usage: node scripts/atlas/capture-typescript-error-evidence-v1.mjs --input <machine-jsonl> [--output <report.json>] [--limit N]');
  process.exit(2);
}

const absoluteInput = resolve(ROOT, inputPath);
const outputPath = resolve(ROOT, argument('--output') ?? 'docs/reports/typescript-error-evidence-v1.json');
const requestedLimit = Number(argument('--limit') ?? 100000);
const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 100000;
if (!existsSync(absoluteInput)) {
  console.error(`Input artifact not found: ${inputPath}`);
  process.exit(2);
}

const sourceRevision = process.env.ATLAS_SOURCE_REVISION?.trim() || null;
const workspaceRevision = process.env.ATLAS_EXPECTED_GRAPHIFY_WORKSPACE_REVISION?.trim() || null;

const batchLineCount = Math.max(1, Number(argument('--batch-lines') ?? 5000) || 5000);
const streamErrorsInput = argument('--stream-errors');
const streamErrorsPath = streamErrorsInput ? resolve(ROOT, streamErrorsInput) : null;

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return `sha256:${hash.digest('hex')}`;
}

async function parseBoundedFile(filePath, onErrors = null) {
  const errors = [];
  const malformedLines = [];
  const excludedLines = [];
  const protocolLines = [];
  let malformedLineCount = 0;
  let excludedLineCount = 0;
  let protocolLineCount = 0;
  let captured = 0;
  let batch = [];
  let batchStartLine = 1;
  let lineNumber = 0;
  const consume = async () => {
    if (batch.length === 0 || captured >= limit) return;
    const parsed = parseMachineJsonl(batch.join('\n'), {
      limit: limit - captured,
      workspaceRevision,
      sourceRevision,
    });
    captured += parsed.errors.length;
    if (onErrors) await onErrors(parsed.errors);
    else errors.push(...parsed.errors);
    malformedLineCount += parsed.malformedLines.length;
    excludedLineCount += parsed.excludedLines.length;
    protocolLineCount += parsed.protocolLines.length;
    if (malformedLines.length < 100) malformedLines.push(...parsed.malformedLines.map((line) => line + batchStartLine - 1).slice(0, 100 - malformedLines.length));
    if (excludedLines.length < 100) excludedLines.push(...parsed.excludedLines.map((line) => line + batchStartLine - 1).slice(0, 100 - excludedLines.length));
    if (protocolLines.length < 100) protocolLines.push(...parsed.protocolLines.map((line) => line + batchStartLine - 1).slice(0, 100 - protocolLines.length));
    batch = [];
    batchStartLine = lineNumber + 1;
  };
  const input = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of input) {
    lineNumber += 1;
    if (batch.length === 0) batchStartLine = lineNumber;
    batch.push(line);
    if (batch.length >= batchLineCount) await consume();
    if (captured >= limit) break;
  }
  await consume();
  return { errors, captured, malformedLines, excludedLines, protocolLines,
    malformedLineCount, excludedLineCount, protocolLineCount, lineCount: lineNumber };
}

const inputChecksum = await hashFile(absoluteInput);
const byCode = {};
const bySeverity = { error: 0, warning: 0 };
let errorStream = null;
if (streamErrorsPath) {
  mkdirSync(dirname(streamErrorsPath), { recursive: true });
  errorStream = createWriteStream(streamErrorsPath, { encoding: 'utf8' });
}
const parsed = await parseBoundedFile(absoluteInput, errorStream ? async (errors) => {
  if (!errors.length) return;
  for (const error of errors) {
    const key = error.code ?? 'UNCODED';
    byCode[key] = (byCode[key] ?? 0) + 1;
    bySeverity[error.severity] += 1;
  }
  if (!errorStream.write(errors.map((error) => `${JSON.stringify(error)}\n`).join(''))) await once(errorStream, 'drain');
} : null);
if (errorStream) await new Promise((resolve, reject) => { errorStream.end(resolve); errorStream.on('error', reject); });
for (const error of parsed.errors) {
  const key = error.code ?? 'UNCODED';
  byCode[key] = (byCode[key] ?? 0) + 1;
  bySeverity[error.severity] += 1;
}
const report = {
  schema: 'atlas.typescript-error-evidence.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_MACHINE_JSONL_CAPTURE',
  input: { artifactChecksum: inputChecksum, limit, batchLineCount },
  lineage: { workspaceRevision, sourceRevision },
  errors: parsed.errors,
  ...(streamErrorsPath ? { errorsPath: streamErrorsInput, streamedErrors: true } : {}),
  summary: {
    captured: parsed.captured,
    truncated: parsed.captured >= limit,
    malformedLineCount: parsed.malformedLineCount,
    malformedLineNumbers: parsed.malformedLines.slice(0, 100),
    excludedLineCount: parsed.excludedLineCount,
    excludedLineNumbers: parsed.excludedLines.slice(0, 100),
    protocolLineCount: parsed.protocolLineCount,
    inputLineCount: parsed.lineCount,
    byCode,
    bySeverity,
  },
  promotion: { taskCandidateEligible: false, mutationAuthorized: false, governedEventRequired: true, independentValidationRequired: true },
  writesPerformed: false,
  safeToApply: false,
};
report.input.path = inputPath;

mkdirSync(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
renameSync(temporaryPath, outputPath);
console.log(JSON.stringify({
  schema: report.schema,
  status: 'EVIDENCE_CAPTURED_NO_MUTATION',
  captured: report.summary.captured,
  malformedLineCount: report.summary.malformedLineCount,
  writesPerformed: false,
  safeToApply: false,
  reportPath: outputPath.replace(`${ROOT}/`, '').replaceAll('\\', '/'),
}));

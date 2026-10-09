import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { projectAstPrefillRowToObservationV1 } from './lib/ast-prefill-observation-bridge-v1.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const inputPath = path.resolve(ROOT, args.get('input') ?? '');
const outputPath = path.resolve(ROOT, args.get('output') ?? '.tmp/atlas/ast-prefill-observations-v1.jsonl');
const receiptPath = path.resolve(ROOT, args.get('receipt') ?? '.tmp/atlas/ast-prefill-observations-v1.receipt.json');

function assertScratchPath(value: string): void {
  const relativePath = path.relative(path.join(ROOT, '.tmp', 'atlas'), value);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`OUTPUT_MUST_BE_NEW_FILE_UNDER_TMP_ATLAS:${value}`);
  }
}

async function sha256File(value: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(value)) hash.update(chunk);
  return hash.digest('hex');
}

if (!args.has('input')) throw new Error('INPUT_REQUIRED:--input=<prefill-jsonl>');
assertScratchPath(outputPath);
assertScratchPath(receiptPath);
if (outputPath === receiptPath) throw new Error('OUTPUT_AND_RECEIPT_MUST_DIFFER');

const inputRealPath = await realpath(inputPath);
const inputChecksum = await sha256File(inputRealPath);
await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(path.dirname(receiptPath), { recursive: true });
const scratchRoot = await realpath(path.join(ROOT, '.tmp', 'atlas'));
for (const target of [outputPath, receiptPath]) {
  const parent = await realpath(path.dirname(target));
  const relativeParent = path.relative(scratchRoot, parent);
  if (relativeParent.startsWith('..') || path.isAbsolute(relativeParent)) {
    throw new Error(`OUTPUT_PARENT_ESCAPES_TMP_ATLAS:${target}`);
  }
}

const output = createWriteStream(outputPath, { flags: 'wx' });
const rejectionCounts: Record<string, number> = {};
const rejectionSamples: Array<{ line: number; packetKey: string | null; sourceRef: string | null; reason: string }> = [];
let inputRows = 0;
let projectedRows = 0;
let lineNumber = 0;
const lines = readline.createInterface({ input: createReadStream(inputRealPath), crlfDelay: Infinity });

for await (const line of lines) {
  lineNumber += 1;
  if (!line.trim()) continue;
  inputRows += 1;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    const reason = 'INPUT_JSON_INVALID';
    rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
    if (rejectionSamples.length < 20) rejectionSamples.push({ line: lineNumber, packetKey: null, sourceRef: null, reason });
    continue;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const reason = 'INPUT_ROW_NOT_OBJECT';
    rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
    if (rejectionSamples.length < 20) rejectionSamples.push({ line: lineNumber, packetKey: null, sourceRef: null, reason });
    continue;
  }
  const projected = await projectAstPrefillRowToObservationV1({ row: parsed as Record<string, unknown>, repoRoot: ROOT });
  if ('rejection' in projected) {
    const reason = projected.rejection.reason;
    rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
    if (rejectionSamples.length < 20) rejectionSamples.push({ line: lineNumber, ...projected.rejection });
    continue;
  }
  if (!output.write(`${JSON.stringify(projected.row)}\n`)) await once(output, 'drain');
  projectedRows += 1;
}

output.end();
await once(output, 'close');
const outputChecksum = await sha256File(outputPath);
const readbackChecksum = await sha256File(outputPath);
const inputReadbackChecksum = await sha256File(inputRealPath);
const readbackMatched = outputChecksum === readbackChecksum;
const inputReadbackMatched = inputChecksum === inputReadbackChecksum;
const receipt = {
  schema: 'atlas.ast-prefill-observation-bridge-receipt.v1',
  status: !inputReadbackMatched ? 'INPUT_CHANGED_DURING_READ'
    : !readbackMatched ? 'READBACK_MISMATCH'
      : inputRows === 0 ? 'EMPTY_INPUT'
        : Object.keys(rejectionCounts).length ? 'PARTIAL_PROPOSAL' : 'PROPOSAL_PROJECTION_COMPLETE',
  inputPath: path.relative(ROOT, inputRealPath).replaceAll('\\', '/'),
  inputChecksum,
  inputReadbackChecksum,
  inputReadbackMatched,
  inputRows,
  projectedRows,
  rejectedRows: Object.values(rejectionCounts).reduce((sum, count) => sum + count, 0),
  rejectionCounts,
  rejectionSamples,
  outputPath: path.relative(ROOT, outputPath).replaceAll('\\', '/'),
  outputChecksum,
  readbackChecksum,
  readbackMatched,
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
  scratchArtifactWritten: true,
};
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ ...receipt, receiptPath: path.relative(ROOT, receiptPath).replaceAll('\\', '/') }, null, 2)}\n`);
if (!readbackMatched || !inputReadbackMatched) process.exitCode = 1;

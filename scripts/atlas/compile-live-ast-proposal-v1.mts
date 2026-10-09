import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { compileLiveAstObservationProposalV1 } from './lib/compile-live-ast-proposal-v1.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratchRoot = path.join(root, '.tmp', 'atlas') + path.sep;
const inputPath = path.resolve(root, process.argv[2] ?? '');
const outputPath = path.resolve(root, process.argv[3] ?? `.tmp/atlas/orf-live-ast-proposal-compile-${Date.now()}.json`);
if (!inputPath.startsWith(scratchRoot)) throw new Error('INPUT_MUST_BE_UNDER_TMP_ATLAS');
if (!outputPath.startsWith(scratchRoot)) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');

const result = compileLiveAstObservationProposalV1(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
const checksum = createHash('sha256').update(JSON.stringify(result), 'utf8').digest('hex');
const artifact = { ...result, checksum };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
const { checksum: readbackChecksum, ...readbackPayload } = readback;
if (createHash('sha256').update(JSON.stringify(readbackPayload), 'utf8').digest('hex') !== readbackChecksum) {
  throw new Error('PROPOSAL_COMPILE_READBACK_CHECKSUM_MISMATCH');
}
console.log(JSON.stringify({ ...readback, readback: 'MATCH', reportPath: path.relative(root, outputPath) }, null, 2));

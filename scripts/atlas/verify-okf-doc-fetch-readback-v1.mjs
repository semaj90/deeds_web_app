import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyOkfDocFetchReadbackV1 } from './lib/okf-doc-fetch-readback-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratchRoot = `${path.join(root, '.tmp', 'atlas')}${path.sep}`;
const corpusPath = path.resolve(root, process.argv[2] ?? '');
const receiptPath = path.resolve(root, process.argv[3] ?? '');
if (!corpusPath.startsWith(scratchRoot) || !receiptPath.startsWith(scratchRoot)) {
  throw new Error('CORPUS_AND_RECEIPT_MUST_BE_UNDER_TMP_ATLAS');
}
if (!process.argv[2] || !process.argv[3]) throw new Error('USAGE: <corpus.jsonl> <receipt.json>');

const outputRoot = path.dirname(corpusPath);
const receipt = verifyOkfDocFetchReadbackV1({ corpusPath, outputRoot });
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
const { receiptChecksum, ...payload } = readback;
if (crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex') !== receiptChecksum) {
  throw new Error('OKF_READBACK_RECEIPT_CHECKSUM_MISMATCH');
}
console.log(JSON.stringify({
  status: readback.status,
  recordCount: readback.recordCount,
  corpusChecksum: readback.corpusChecksum,
  receiptChecksum,
  receiptReadback: 'MATCH',
  canonicalAuthority: readback.canonicalAuthority,
  datastoreWritesPerformed: readback.datastoreWritesPerformed,
  reportPath: path.relative(root, receiptPath).replaceAll('\\', '/'),
}, null, 2));

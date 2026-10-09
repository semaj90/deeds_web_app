import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildOkfGroundedNlpAlignmentV1 } from './lib/okf-grounded-nlp-alignment-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaPath = path.join(root, 'docs/.okf/schema.yaml');
const indexPath = path.join(root, '.okf/indexes/code-capability-knowledge-v1.yaml');
const pydanticSchemaPath = path.join(root, '.tmp/atlas/schema/grounded-nlp-fact-v1.schema.json');
const outputRelativePath = process.argv[2]
  ?? `.tmp/atlas/okf-grounded-nlp-alignment-v1-${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}.json`;
const outputPath = path.resolve(root, outputRelativePath);
const scratchRoot = `${path.resolve(root, '.tmp/atlas')}${path.sep}`;
if (!outputPath.startsWith(scratchRoot)) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
const inputHashes = {
  okfSchema: createHash('sha256').update(readFileSync(schemaPath)).digest('hex'),
  okfIndex: createHash('sha256').update(readFileSync(indexPath)).digest('hex'),
  pydanticSchema: createHash('sha256').update(readFileSync(pydanticSchemaPath)).digest('hex'),
};
const result = buildOkfGroundedNlpAlignmentV1({
  okfSchema: parse(readFileSync(schemaPath, 'utf8')),
  okfIndex: parse(readFileSync(indexPath, 'utf8')),
  pydanticSchema: JSON.parse(readFileSync(pydanticSchemaPath, 'utf8')),
});
const payload = {
  ...result,
  inputs: {
    schemaPath: 'docs/.okf/schema.yaml',
    indexPath: '.okf/indexes/code-capability-knowledge-v1.yaml',
    pydanticSchemaPath: '.tmp/atlas/schema/grounded-nlp-fact-v1.schema.json',
    inputHashes,
  },
};
const receiptChecksum = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const receipt = { ...payload, receiptChecksum };
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(readFileSync(outputPath, 'utf8'));
const { receiptChecksum: readbackChecksum, ...readbackPayload } = readback;
if (readbackChecksum !== createHash('sha256').update(JSON.stringify(readbackPayload)).digest('hex')) {
  throw new Error('OKF_GROUNDED_NLP_RECEIPT_READBACK_MISMATCH');
}
process.stdout.write(`${JSON.stringify({ status: readback.status, authorityAligned: readback.authorityAligned, mismatches: readback.mismatches, semanticCrosswalks: readback.semanticCrosswalks, receiptChecksum, readback: 'MATCH', runtimeAdmission: false, outputPath: path.relative(root, outputPath) }, null, 2)}\n`);

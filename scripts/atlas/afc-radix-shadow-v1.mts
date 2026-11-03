#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { runAfcRadixShadowV1 } from '../../sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/radix-shadow-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const separator = arg.indexOf('=');
  return separator < 0 ? [arg.slice(2), ''] : [arg.slice(2, separator), arg.slice(separator + 1)];
}));
const inputPath = args.get('input');
const vocabularyPath = args.get('vocabulary');
const outputPath = args.get('out');
if (!inputPath || !vocabularyPath || !outputPath) {
  console.error('Usage: npx tsx scripts/atlas/afc-radix-shadow-v1.mts --input=<frozen-input.json> --vocabulary=<compiled-vocabulary.json> --out=.tmp/atlas/afc-radix-shadow-v1/<run>.json');
  process.exit(2);
}

const resolvedOutput = path.resolve(root, outputPath);
const relativeOutput = path.relative(path.join(root, '.tmp'), resolvedOutput);
if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) throw new Error('AFC_RADIX_SHADOW_OUTPUT_MUST_BE_UNDER_TMP');

const readJson = (value: string) => JSON.parse(fs.readFileSync(path.resolve(root, value), 'utf8'));
const input = readJson(inputPath);
const vocabulary = readJson(vocabularyPath);
const sourceFiles = [
  'scripts/atlas/afc-radix-shadow-v1.mts',
  'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/radix-shadow-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/query-classifier.ts',
  'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/query-expansion-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/radix-index-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/taxonomy-scope-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/vocabulary-v1.ts',
].map((file) => ({ path: file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') }));
const sourceRevision = crypto.createHash('sha256').update(JSON.stringify(sourceFiles)).digest('hex');
const startedAt = performance.now();
const receipt = runAfcRadixShadowV1(input, vocabulary, sourceRevision);
const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
const output = { ...receipt, sourceFiles, diagnostics: { elapsedMs, timingExcludedFromChecksum: true } };

fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
fs.writeFileSync(resolvedOutput, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: output.status, runId: output.runId, receipt: path.relative(root, resolvedOutput).split(path.sep).join('/'), checksum: output.checksum, writesToDatastores: 0, promotionAuthorized: false }, null, 2));

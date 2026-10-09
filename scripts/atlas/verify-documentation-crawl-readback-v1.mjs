#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDocumentationCrawlReadbackV1 } from './lib/documentation-crawl-readback-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const allowlistPath = path.resolve(root, args.get('allowlist') ?? '');
const corpusPath = path.resolve(root, args.get('corpus') ?? '');
const outputPath = path.resolve(root, args.get('output') ?? '.tmp/atlas/documentation-crawl-readback-v1.json');
const scratchRoot = path.resolve(root, '.tmp', 'atlas');
const relativeOutput = path.relative(scratchRoot, outputPath);
const relativeCorpus = path.relative(scratchRoot, corpusPath);
if (!args.has('allowlist') || !args.has('corpus')) throw new Error('ALLOWLIST_AND_CORPUS_REQUIRED');
if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
if (!relativeCorpus || relativeCorpus.startsWith('..') || path.isAbsolute(relativeCorpus)) throw new Error('CORPUS_MUST_BE_UNDER_TMP_ATLAS');
const unknown = [...args.keys()].filter((key) => !['allowlist', 'corpus', 'output'].includes(key));
if (unknown.length) throw new Error(`UNKNOWN_ARGUMENTS:${unknown.join(',')}`);

const allowlist = JSON.parse(await fs.readFile(allowlistPath, 'utf8'));
const corpusBytes = await fs.readFile(corpusPath);
const entries = corpusBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const outputRoot = path.dirname(corpusPath);
const receipt = await verifyDocumentationCrawlReadbackV1({
  allowlist,
  entries,
  readArtifacts: async (entry) => {
    const markdownPath = path.resolve(root, entry.markdown_path);
    const relativeMarkdown = path.relative(outputRoot, markdownPath);
    if (!relativeMarkdown || relativeMarkdown.startsWith('..') || path.isAbsolute(relativeMarkdown)) throw new Error('CRAWL_MARKDOWN_PATH_OUTSIDE_OUTPUT_ROOT');
    const markdownBytes = await fs.readFile(markdownPath);
    const sidecarPath = `${markdownPath.slice(0, -path.extname(markdownPath).length)}.json`;
    const sidecar = JSON.parse(await fs.readFile(sidecarPath, 'utf8'));
    return { markdownBytes, sidecar };
  },
});
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const reopened = JSON.parse(await fs.readFile(outputPath, 'utf8'));
const { checksum, ...payload } = reopened;
if (crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex') !== checksum) throw new Error('CRAWL_READBACK_RECEIPT_CHECKSUM_MISMATCH');
process.stdout.write(`${JSON.stringify({ status: reopened.status, expectedPageCount: reopened.expectedPageCount, readbackPageCount: reopened.readbackPageCount, missingPageCount: reopened.missingPages.length, checksum: reopened.checksum, independentReceiptReadback: 'MATCH', outputPath: path.relative(root, outputPath).replaceAll('\\', '/') }, null, 2)}\n`);

#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDocumentationCrawlReadbackV1 } from './lib/documentation-crawl-readback-v1.mjs';
import { resolveOkfDevPublishedCorpusV1 } from '../docs-atlas/lib/okf-dev-publication-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const allowlistPath = path.resolve(root, args.get('allowlist') ?? '');
const corpusRoot = path.resolve(root, 'docs/.okf/dev');
const publishedCorpus = args.has('corpus') ? null : resolveOkfDevPublishedCorpusV1(corpusRoot);
const corpusPath = path.resolve(root, args.get('corpus') ?? publishedCorpus?.corpusPath ?? 'docs/.okf/dev/corpus.jsonl');
const outputPath = path.resolve(root, args.get('output') ?? '.tmp/atlas/okf-dev-corpus-append-readback-v1.json');
const tmpRoot = path.resolve(root, '.tmp/atlas');
const isWithin = (base, candidate) => {
  const relative = path.relative(base, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
};
const unknown = [...args.keys()].filter((key) => !['allowlist', 'corpus', 'output'].includes(key));
if (unknown.length) throw new Error(`UNKNOWN_ARGUMENTS:${unknown.join(',')}`);
if (!args.has('allowlist') || !isWithin(tmpRoot, allowlistPath)) throw new Error('ALLOWLIST_MUST_BE_UNDER_TMP_ATLAS');
if (!isWithin(corpusRoot, corpusPath)) throw new Error('CORPUS_MUST_BE_UNDER_OKF_DEV');
if (!isWithin(tmpRoot, outputPath)) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');

const allowlistBytes = await fs.readFile(allowlistPath);
const corpusBytes = await fs.readFile(corpusPath);
const allowlist = JSON.parse(allowlistBytes.toString('utf8'));
const corpusEntries = corpusBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const expectedKeys = new Set(allowlist.sources.flatMap((source) => source.pages.map((url) => `${source.source_id}\0${url}`)));
const selectedEntries = corpusEntries.filter((entry) => expectedKeys.has(`${entry.source_id}\0${entry.url}`));
const verification = await verifyDocumentationCrawlReadbackV1({
  allowlist,
  entries: selectedEntries,
  readArtifacts: async (entry) => {
    const markdownPath = path.resolve(root, entry.markdown_path);
    if (!isWithin(corpusRoot, markdownPath)) throw new Error('CRAWL_MARKDOWN_PATH_OUTSIDE_OKF_DEV');
    const markdownBytes = await fs.readFile(markdownPath);
    const sidecarPath = `${markdownPath.slice(0, -path.extname(markdownPath).length)}.json`;
    const sidecar = JSON.parse(await fs.readFile(sidecarPath, 'utf8'));
    return { markdownBytes, sidecar };
  },
});
const payload = {
  schema: 'atlas.okf-dev-corpus-append-readback.v1',
  status: verification.status,
  verification,
  corpusPath: path.relative(root, corpusPath).replaceAll('\\', '/'),
  corpusChecksum: crypto.createHash('sha256').update(corpusBytes).digest('hex'),
  allowlistChecksum: crypto.createHash('sha256').update(allowlistBytes).digest('hex'),
  canonicalAuthority: false,
  writesPerformed: false,
};
const receipt = { ...payload, receiptChecksum: crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex') };
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(await fs.readFile(outputPath, 'utf8'));
const { receiptChecksum, ...readbackPayload } = readback;
if (crypto.createHash('sha256').update(JSON.stringify(readbackPayload), 'utf8').digest('hex') !== receiptChecksum) throw new Error('APPEND_READBACK_RECEIPT_CHECKSUM_MISMATCH');
process.stdout.write(`${JSON.stringify({ status: readback.status, expectedPageCount: verification.expectedPageCount, readbackPageCount: verification.readbackPageCount, missingPageCount: verification.missingPages.length, receiptReadback: 'MATCH', canonicalAuthority: false, writesPerformed: false, reportPath: path.relative(root, outputPath).replaceAll('\\', '/') }, null, 2)}\n`);

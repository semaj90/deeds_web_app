#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocumentationCrawlAllowlistV1 } from './lib/documentation-crawl-allowlist-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const demandPath = path.resolve(root, args.get('demand-plan') ?? '');
const manifestPath = path.resolve(root, args.get('manifest') ?? 'docs/.okf/dev/manifest.json');
const outputPath = path.resolve(root, args.get('output') ?? '.tmp/atlas/documentation-crawl-allowlist-v1.json');
const maxSources = Number(args.get('max-sources') ?? 10);
const scratchRoot = `${path.resolve(root, '.tmp', 'atlas')}${path.sep}`;
if (!args.has('demand-plan')) throw new Error('DEMAND_PLAN_REQUIRED');
if (!outputPath.toLowerCase().startsWith(scratchRoot.toLowerCase())) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
const unknown = [...args.keys()].filter((key) => !['demand-plan', 'manifest', 'output', 'max-sources'].includes(key));
if (unknown.length) throw new Error(`UNKNOWN_ARGUMENTS:${unknown.join(',')}`);

const demandPlan = JSON.parse(fs.readFileSync(demandPath, 'utf8'));
const crawlerManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const allowlist = buildDocumentationCrawlAllowlistV1({ demandPlan, crawlerManifest, maxSources });
const replay = buildDocumentationCrawlAllowlistV1({ demandPlan, crawlerManifest, maxSources });
const serialize = (value) => JSON.stringify(value);
if (serialize(allowlist) !== serialize(replay)) throw new Error('ALLOWLIST_REPLAY_MISMATCH');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(allowlist, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
if (crypto.createHash('sha256').update(JSON.stringify(readback), 'utf8').digest('hex')
  !== crypto.createHash('sha256').update(JSON.stringify(allowlist), 'utf8').digest('hex')) {
  throw new Error('ALLOWLIST_READBACK_MISMATCH');
}
process.stdout.write(`${JSON.stringify({
  status: readback.atlasDocumentationDemand.selectedSources.length ? 'ALLOWLIST_READY' : 'NO_MATCHING_CRAWLER_PAGES',
  selectedSourceCount: readback.sources.length,
  selectedSources: readback.atlasDocumentationDemand.selectedSources.map(({ sourceId, rank, relevanceScore, pages }) => ({ sourceId, rank, relevanceScore, pageCount: pages.length })),
  skippedCount: readback.atlasDocumentationDemand.skipped.length,
  replay: 'MATCH',
  independentReadback: 'MATCH',
  fetchPerformed: false,
  datastoreWritesPerformed: false,
  canonicalAuthority: false,
  outputPath: path.relative(root, outputPath).replaceAll('\\', '/'),
}, null, 2)}\n`);

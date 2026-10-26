#!/usr/bin/env node
import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'docs/.okf/ldr');
const runId = randomUUID();
const commit = '8239c68';
const sources = [
  { id: 'ldr-api-quickstart', url: `https://github.com/LearningCircuit/local-deep-research/blob/${commit}/docs/api-quickstart.md`, title: 'LearningCircuit LDR API quickstart' },
  { id: 'ldr-mcp-server', url: `https://github.com/LearningCircuit/local-deep-research/blob/${commit}/docs/mcp-server.md`, title: 'LearningCircuit LDR MCP server guide' },
  { id: 'firecrawl-scrape-api', url: 'https://docs.firecrawl.dev/api-reference/endpoint/scrape', title: 'Firecrawl v2 scrape API' },
  { id: 'beautifulsoup-docs', url: 'https://beautiful-soup-4.readthedocs.io/en/latest/', title: 'Beautiful Soup documentation' },
];
const digest = (value) => createHash('sha256').update(value).digest('hex');
const selectedFetchers = process.argv.includes('--beautifulsoup-only')
  ? ['beautifulsoup']
  : ['firecrawl', 'beautifulsoup'];

async function fetchOne(source, fetcher) {
  const helper = resolve(root, `scripts/docs-atlas/fetch-${fetcher}.py`);
  const { stdout } = await execFileAsync(process.env.PYTHON_BIN || 'python', [helper, source.url], {
    cwd: root, windowsHide: true, maxBuffer: 12 * 1024 * 1024, timeout: 75000,
    env: process.env,
  });
  const result = JSON.parse(stdout.trim());
  if (result.error) throw new Error(`${result.error}:${result.message || ''}`);
  if (result.canonical_authority !== false || !result.markdown || !result.raw_checksum || !result.normalized_checksum) throw new Error('INVALID_OR_CANONICAL_CAPTURE');
  return result;
}

async function main() {
  if (!process.env.FIRECRAWL_API_KEY) throw new Error('FIRECRAWL_API_KEY_REQUIRED');
  await mkdir(resolve(output, 'raw'), { recursive: true });
  const manifest = {
    schema: 'atlas.okf.ldr.documentation-capture.v1', runId,
    createdAt: new Date().toISOString(), upstream: 'LearningCircuit/local-deep-research',
    upstreamCheckoutCommit: commit, fetchers: selectedFetchers.map((fetcher) => fetcher === 'firecrawl' ? 'FIRECRAWL_V2' : 'BEAUTIFULSOUP_HTTP'),
    canonicalAuthority: false, datastoreWrites: false, ldrResearchJobExecuted: false,
    sources: [],
  };
  const failures = [];
  for (const source of sources) {
    const entry = { ...source, canonicalAuthority: false, captures: [] };
    for (const fetcher of selectedFetchers) {
      try {
        const result = await fetchOne(source, fetcher);
        const markdownPath = resolve(output, 'raw', `${source.id}.${fetcher}.md`);
        const metadataPath = resolve(output, 'raw', `${source.id}.${fetcher}.json`);
        await writeFile(markdownPath, result.markdown, { flag: 'wx' });
        const metadata = { schema: 'atlas.okf.ldr.capture.v1', runId, sourceId: source.id, requestedUrl: source.url, resolvedUrl: result.resolved_url, title: result.title, fetcher: result.fetcher, rawChecksum: result.raw_checksum, normalizedChecksum: result.normalized_checksum, capturedMarkdownSha256: digest(result.markdown), capturedAt: new Date().toISOString(), parser: result.metadata?.parser ?? null, parserVersion: result.metadata?.parserVersion ?? null, canonicalAuthority: false };
        await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
        entry.captures.push({ fetcher: result.fetcher, markdown: relativeToRoot(markdownPath), metadata: relativeToRoot(metadataPath), checksum: metadata.capturedMarkdownSha256 });
      } catch (error) {
        failures.push({ sourceId: source.id, fetcher, message: error instanceof Error ? error.message : String(error) });
        entry.captures.push({ fetcher, status: 'FAILED' });
      }
    }
    manifest.sources.push(entry);
  }
  manifest.status = failures.length ? 'PARTIAL' : 'CAPTURED';
  manifest.failures = failures;
  const manifestPath = resolve(output, `manifest-${runId}.json`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ status: manifest.status, runId, manifest: relativeToRoot(manifestPath), captured: manifest.sources.reduce((sum, source) => sum + source.captures.filter((capture) => capture.checksum).length, 0), failed: failures.length }, null, 2));
  if (failures.length) process.exitCode = 1;
}

function relativeToRoot(path) { return path.slice(root.length + 1).replaceAll('\\', '/'); }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}

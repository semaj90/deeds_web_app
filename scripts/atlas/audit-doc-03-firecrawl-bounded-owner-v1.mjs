#!/usr/bin/env node

/** DOC-03 read-only owner audit; never calls Firecrawl and never writes data. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const reportPath = resolve(root, 'docs/reports/parent-atlas/doc-03-firecrawl-bounded-owner-v1.json');
const read = async (file) => readFile(resolve(root, file), 'utf8');

const pipeline = await read('python/atlas_okf_docs_pipeline.py');
const manifest = await read('python/atlas_doc_manifest.py');
const capture = await read('sveltekit-frontend/src/lib/server/atlas/docs/firecrawl-v2-capture.ts');
const envExample = await read('.env.example');
const liveReceiptPath = 'docs/reports/parent-atlas/doc-03-firecrawl-live-bounded-v1.json';
let liveReceipt = null;
try { liveReceipt = JSON.parse(await read(liveReceiptPath)); } catch { /* no live receipt yet */ }

const checks = [
  { name: 'manifest maximum_pages exists', pass: /maximum_pages:\s*int/.test(manifest) },
  { name: 'manifest maximum_depth exists', pass: /maximum_depth:\s*int/.test(manifest) },
  { name: 'canonical request builder maps maximum_pages to Firecrawl limit', pass: /"limit":\s*source\.maximum_pages/.test(pipeline) && /body = build_firecrawl_crawl_v2_request\(source\)/.test(pipeline) },
  { name: 'canonical request builder maps maximum_depth to Firecrawl depth', pass: /"maxDiscoveryDepth":\s*source\.maximum_depth/.test(pipeline) && /body = build_firecrawl_crawl_v2_request\(source\)/.test(pipeline) },
  { name: 'manifest sitemap policy maps to Firecrawl v2 sitemap enum', pass: /follow_sitemap:\s*bool/.test(manifest) && /"sitemap":\s*"include" if source\.follow_sitemap else "skip"/.test(pipeline) },
  { name: 'external links are disabled', pass: /"allowExternalLinks":\s*False/.test(pipeline) },
  { name: 'subdomains are disabled', pass: /"allowSubdomains":\s*False/.test(pipeline) },
  { name: 'domain scope is validated', pass: /enforce_allowed_domain/.test(pipeline) },
  { name: 'Firecrawl API key is configuration-backed', pass: /FIRECRAWL_API_KEY/.test(envExample) && /requireFirecrawlKey/.test(capture) },
  { name: 'global MCP registration is not represented as repository-owned config', pass: !/firecrawl/i.test(await read('.mcp.json').catch(() => '')) },
  { name: 'live bounded-crawl receipt is valid and non-persistent', pass: liveReceipt?.status === 'DOC_03_LIVE_BOUNDED_CRAWL_PROVEN' && liveReceipt.apiKeyRecorded === false && liveReceipt.pageBodiesRecorded === false && liveReceipt.postgresWritesPerformed === false && liveReceipt.canonicalPromotion === false },
];

const report = {
  schema: 'atlas.doc-03.firecrawl-bounded-owner-audit.v1',
  gate: 'DOC-03',
  status: checks.every((check) => check.pass) ? 'DOC_03_LIVE_BOUNDED_CRAWL_PROVEN' : 'DOC_03_OWNER_AUDIT_FAILED',
  owner: 'python/atlas_okf_docs_pipeline.py::firecrawl_crawl_v2',
  captureOwner: 'sveltekit-frontend/src/lib/server/atlas/docs/firecrawl-v2-capture.ts',
  bounds: { maximumPages: 'manifest.maximum_pages -> Firecrawl.limit', maximumDepth: 'manifest.maximum_depth -> Firecrawl.maxDiscoveryDepth', followSitemap: 'manifest.follow_sitemap -> Firecrawl v2 sitemap=include|skip', externalLinks: false, subdomains: false },
  checks,
  liveReceiptPath,
  crawlerCalled: liveReceipt?.status === 'DOC_03_LIVE_BOUNDED_CRAWL_PROVEN',
  apiKeyValueRecorded: false,
  datastoreWrites: false,
  canonicalPromotion: false,
  remainingBlocker: checks.every((check) => check.pass) ? null : 'A live bounded-crawl receipt is required; global MCP registration and credentials are outside repository ownership.',
  generatedAt: new Date().toISOString(),
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.status === 'DOC_03_OWNER_AUDIT_FAILED') process.exitCode = 1;

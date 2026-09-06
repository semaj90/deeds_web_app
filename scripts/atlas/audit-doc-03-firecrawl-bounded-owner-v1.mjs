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

const checks = [
  { name: 'manifest maximum_pages exists', pass: /maximum_pages:\s*int/.test(manifest) },
  { name: 'manifest maximum_depth exists', pass: /maximum_depth:\s*int/.test(manifest) },
  { name: 'Firecrawl limit receives maximum_pages', pass: /"limit":\s*source\.maximum_pages/.test(pipeline) },
  { name: 'Firecrawl depth receives maximum_depth', pass: /"maxDiscoveryDepth":\s*source\.maximum_depth/.test(pipeline) },
  { name: 'manifest sitemap policy maps to Firecrawl ignoreSitemap', pass: /follow_sitemap:\s*bool/.test(manifest) && /"ignoreSitemap":\s*not source\.follow_sitemap/.test(pipeline) },
  { name: 'external links are disabled', pass: /"allowExternalLinks":\s*False/.test(pipeline) },
  { name: 'subdomains are disabled', pass: /"allowSubdomains":\s*False/.test(pipeline) },
  { name: 'domain scope is validated', pass: /enforce_allowed_domain/.test(pipeline) },
  { name: 'Firecrawl API key is configuration-backed', pass: /FIRECRAWL_API_KEY/.test(envExample) && /requireFirecrawlKey/.test(capture) },
  { name: 'live registration/API key proof is intentionally absent', pass: !/firecrawl/i.test(await read('.mcp.json').catch(() => '')) },
];

const report = {
  schema: 'atlas.doc-03.firecrawl-bounded-owner-audit.v1',
  gate: 'DOC-03',
  status: checks.every((check) => check.pass) ? 'DOC_03_OWNER_BOUNDED_IMPLEMENTED_EXTERNAL_PROOF_OPEN' : 'DOC_03_OWNER_AUDIT_FAILED',
  owner: 'python/atlas_okf_docs_pipeline.py::firecrawl_crawl_v2',
  captureOwner: 'sveltekit-frontend/src/lib/server/atlas/docs/firecrawl-v2-capture.ts',
  bounds: { maximumPages: 'manifest.maximum_pages -> Firecrawl.limit', maximumDepth: 'manifest.maximum_depth -> Firecrawl.maxDiscoveryDepth', followSitemap: 'manifest.follow_sitemap -> Firecrawl.ignoreSitemap inverse', externalLinks: false, subdomains: false },
  checks,
  crawlerCalled: false,
  apiKeyRead: false,
  datastoreWrites: false,
  canonicalPromotion: false,
  remainingBlocker: 'Firecrawl registration/API key and live bounded-crawl readback are external prerequisites.',
  generatedAt: new Date().toISOString(),
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.status === 'DOC_03_OWNER_AUDIT_FAILED') process.exitCode = 1;

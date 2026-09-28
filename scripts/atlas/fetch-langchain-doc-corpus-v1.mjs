#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG_PATH = path.join(ROOT, 'docs/.okf/topics/langchain/corpus.json');
const ARTIFACT_ROOT = path.join(ROOT, '.tmp/atlas/langchain-doc-corpus-v1');
const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function parseArgs(argv) {
  const args = Object.fromEntries(argv.filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const split = arg.indexOf('=');
      return split < 0 ? [arg.slice(2), true] : [arg.slice(2, split), arg.slice(split + 1)];
    }));
  const concurrency = Number(args.concurrency ?? 4);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error('CONCURRENCY_MUST_BE_INTEGER_1_TO_8');
  }
  if (Object.keys(args).some((key) => !['concurrency', 'out'].includes(key))) {
    throw new Error('UNKNOWN_ARGUMENT');
  }
  return { concurrency, out: args.out ?? null };
}

function validateConfig(config) {
  if (config?.schema !== 'atlas.external-doc-corpus-discovery.v1'
    || config.canonicalAuthority !== false
    || config.artifactOnly !== true
    || config.sections?.length !== 3) {
    throw new Error('CORPUS_CONFIG_INVALID');
  }
  const ids = new Set();
  for (const section of config.sections) {
    const index = new URL(section.indexUrl);
    if (index.origin !== config.authority || !index.pathname.endsWith('/llms.txt')) {
      throw new Error(`SECTION_INDEX_OUTSIDE_AUTHORITY:${section.id}`);
    }
    if (!section.allowedPathPrefix.startsWith('/') || !section.allowedPathPrefix.endsWith('/')) {
      throw new Error(`SECTION_PREFIX_INVALID:${section.id}`);
    }
    if (ids.has(section.id)) throw new Error(`DUPLICATE_SECTION_ID:${section.id}`);
    ids.add(section.id);
  }
  return config;
}

async function fetchBytes(url, maxBytes) {
  const response = await fetch(url, {
    headers: { accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1', 'user-agent': 'ParentAtlas-ExternalDocs/1.0' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const resolved = new URL(response.url);
  if (resolved.origin !== 'https://docs.langchain.com') throw new Error('REDIRECT_OUTSIDE_ALLOWED_ORIGIN');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) {
      await response.body.cancel();
      throw new Error(`RESPONSE_TOO_LARGE:${maxBytes}`);
    }
    chunks.push(Buffer.from(chunk));
  }
  return {
    bytes: Buffer.concat(chunks),
    contentType: response.headers.get('content-type') ?? 'unknown',
    resolvedUrl: response.url,
  };
}

export function extractScopedMarkdownUrls(markdown, section, authority = 'https://docs.langchain.com') {
  const found = [];
  const linkPattern = /\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const url = new URL(match[1]);
    if (url.origin !== authority) continue;
    if (!url.pathname.startsWith(section.allowedPathPrefix)) continue;
    if (!url.pathname.toLowerCase().endsWith('.md')) continue;
    if (url.search || url.hash) throw new Error(`NON_CANONICAL_DOC_URL:${url.href}`);
    found.push(url.href);
  }
  return [...new Set(found)].sort((a, b) => a.localeCompare(b, 'en'));
}

function normalizeMarkdown(bytes) {
  let text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n');
}

function safeOutputPath(value, runId) {
  const output = path.resolve(ROOT, value ?? path.join('.tmp/atlas/langchain-doc-corpus-v1', runId));
  const rel = path.relative(ARTIFACT_ROOT, output);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel === '') {
    throw new Error('OUTPUT_MUST_BE_NEW_CHILD_OF_LANGCHAIN_ARTIFACT_ROOT');
  }
  return output;
}

async function fetchWithWorkers(rows, concurrency, fn) {
  const results = new Array(rows.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= rows.length) return;
      try {
        results[index] = await fn(rows[index]);
      } catch (error) {
        results[index] = { status: 'FAILED', error: error instanceof Error ? error.message : String(error) };
      }
    }
  }));
  return results;
}

async function main() {
  const { concurrency, out } = parseArgs(process.argv.slice(2));
  const config = validateConfig(JSON.parse(await readFile(CONFIG_PATH, 'utf8')));
  const runId = new Date().toISOString().replaceAll(/[-:.]/g, '').replace('Z', 'Z');
  const outputDir = safeOutputPath(out, runId);
  await mkdir(ARTIFACT_ROOT, { recursive: true });
  await mkdir(outputDir, { recursive: false });

  const rootIndex = await fetchBytes(config.discoveryIndex, MAX_INDEX_BYTES);
  const rootText = normalizeMarkdown(rootIndex.bytes);
  const rootIndexLinks = new Set([...rootText.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)]
    .map((match) => new URL(match[1], config.discoveryIndex).href));
  const missingRootSections = config.sections.filter((section) => !rootIndexLinks.has(section.indexUrl));
  if (missingRootSections.length > 0) {
    throw new Error(`SECTION_INDEX_NOT_ADVERTISED_BY_ROOT:${missingRootSections.map((x) => x.id).join(',')}`);
  }
  await writeFile(path.join(outputDir, 'root.llms.txt'), rootIndex.bytes, { flag: 'wx' });

  const indexResults = [];
  const discovered = [];
  for (const section of config.sections) {
    const fetched = await fetchBytes(section.indexUrl, MAX_INDEX_BYTES);
    const indexText = normalizeMarkdown(fetched.bytes);
    const urls = extractScopedMarkdownUrls(indexText, section, config.authority);
    if (urls.length === 0) throw new Error(`EMPTY_SECTION_INDEX:${section.id}`);
    await writeFile(path.join(outputDir, `${section.id}.llms.txt`), fetched.bytes, { flag: 'wx' });
    const urlSetBytes = Buffer.from(`${urls.join('\n')}\n`, 'utf8');
    indexResults.push({
      sectionId: section.id,
      indexUrl: section.indexUrl,
      status: 'FETCHED',
      byteLength: fetched.bytes.length,
      indexSha256: sha256(fetched.bytes),
      urlCount: urls.length,
      sortedUrlSetSha256: sha256(urlSetBytes),
    });
    for (const url of urls) discovered.push({ section, url });
  }

  const seen = new Set();
  for (const row of discovered) {
    if (seen.has(row.url)) throw new Error(`URL_CLAIMED_BY_MULTIPLE_SECTIONS:${row.url}`);
    seen.add(row.url);
  }
  const pages = await fetchWithWorkers(discovered, concurrency, async ({ section, url }) => {
    const fetched = await fetchBytes(url, MAX_PAGE_BYTES);
    if (!/^(text\/markdown|text\/plain|application\/octet-stream)(;|$)/i.test(fetched.contentType)) {
      throw new Error(`DIRECT_MARKDOWN_CONTENT_TYPE_UNEXPECTED:${fetched.contentType}`);
    }
    const normalized = normalizeMarkdown(fetched.bytes);
    if (!normalized.trim()) throw new Error('DIRECT_MARKDOWN_EMPTY');
    const rawUrlDigest = createHash('sha256').update(url).digest('hex');
    const artifactPath = `pages/${rawUrlDigest}.md`;
    const pagePath = path.join(outputDir, artifactPath);
    await mkdir(path.dirname(pagePath), { recursive: true });
    await writeFile(pagePath, normalized, { flag: 'wx' });
    return {
      status: 'FETCHED', sectionId: section.id, product: section.product,
      canonicalUrl: url, resolvedUrl: fetched.resolvedUrl, fetchMethod: 'DIRECT_MARKDOWN',
      contentType: fetched.contentType, rawSha256: sha256(fetched.bytes),
      normalizedSha256: sha256(Buffer.from(normalized, 'utf8')),
      byteLength: Buffer.byteLength(normalized, 'utf8'), artifactPath,
      fallbackStatus: 'NOT_NEEDED', canonicalAuthority: false,
    };
  });

  const successPages = pages.filter((page) => page.status === 'FETCHED');
  const failures = pages.map((page, i) => page.status === 'FAILED'
    ? { canonicalUrl: discovered[i].url, sectionId: discovered[i].section.id, status: 'FETCH_FAILED', reason: page.error, fallbackStatus: 'NOT_CONFIGURED' }
    : null).filter(Boolean);
  const orderedPageRows = successPages.sort((a, b) => a.canonicalUrl.localeCompare(b.canonicalUrl, 'en'));
  const pageManifestBytes = Buffer.from(orderedPageRows.map((row) => JSON.stringify(row)).join('\n') + (orderedPageRows.length ? '\n' : ''), 'utf8');
  await writeFile(path.join(outputDir, 'pages.jsonl'), pageManifestBytes, { flag: 'wx' });
  const urlSet = [...seen].sort((a, b) => a.localeCompare(b, 'en'));
  const receipt = {
    schema: 'atlas.langchain-doc-fetch-receipt.v1', corpusId: config.corpusId,
    generatedAt: new Date().toISOString(), outputDir: path.relative(ROOT, outputDir).replaceAll('\\', '/'),
    rootIndex: { url: config.discoveryIndex, status: 'FETCHED', byteLength: rootIndex.bytes.length, sha256: sha256(rootIndex.bytes), advertisedSectionIndexes: config.sections.length },
    indexes: indexResults, discoveredUrlCount: urlSet.length,
    discoveredUrlSetSha256: sha256(Buffer.from(`${urlSet.join('\n')}\n`, 'utf8')),
    fetchedPageCount: orderedPageRows.length, failedPageCount: failures.length,
    pagesManifestSha256: sha256(pageManifestBytes), failures,
    fallbackPolicy: 'DIRECT_MARKDOWN_ONLY; fallback tools are recorded NOT_CONFIGURED and never escape the section prefix',
    writes: { localArtifacts: true, postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, neo4j: 0, graphify: 0 },
    canonicalAuthority: false, admittedToCanonicalCorpus: false,
  };
  await writeFile(path.join(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    outputDir: receipt.outputDir, discoveredUrlCount: receipt.discoveredUrlCount,
    fetchedPageCount: receipt.fetchedPageCount, failedPageCount: receipt.failedPageCount,
    discoveredUrlSetSha256: receipt.discoveredUrlSetSha256,
    pagesManifestSha256: receipt.pagesManifestSha256,
    receiptPath: `${receipt.outputDir}/receipt.json`, writes: receipt.writes,
  }, null, 2));
  if (failures.length > 0) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}

export { normalizeMarkdown, parseArgs, validateConfig };

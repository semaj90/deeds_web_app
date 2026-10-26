import { createHash } from 'node:crypto';
import path from 'node:path';

const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function pageSlugFromRawPath(rawPath) {
  const base = path.posix.basename(rawPath);
  const match = /^svelte\.dev-docs-kit-(.+)\.md$/.exec(base);
  if (!match) throw new Error(`SVELTEKIT_DOCS_RAW_PATH_UNRECOGNIZED:${base}`);
  return match[1];
}

function pageSlugFromChunkUrl(sourceUrl) {
  let url;
  try { url = new URL(sourceUrl); }
  catch { throw new Error('SVELTEKIT_DOCS_CHUNK_URL_INVALID'); }
  if (url.hostname !== 'svelte.dev' || url.pathname.split('/').length !== 4 ||
      !url.pathname.startsWith('/docs/kit/')) throw new Error('SVELTEKIT_DOCS_CHUNK_URL_OUT_OF_SCOPE');
  const slug = url.pathname.slice('/docs/kit/'.length);
  if (!slug || slug.includes('/')) throw new Error('SVELTEKIT_DOCS_CHUNK_PAGE_INVALID');
  return slug;
}

export function buildSveltekitDocsCorpusManifestV1({ rawFiles, chunksFileBytes }) {
  if (!Array.isArray(rawFiles) || !Buffer.isBuffer(chunksFileBytes)) throw new Error('SVELTEKIT_DOCS_MANIFEST_INPUT_INVALID');
  const files = rawFiles.map(file => {
    if (typeof file?.path !== 'string' || !Buffer.isBuffer(file.bytes)) throw new Error('SVELTEKIT_DOCS_RAW_FILE_INVALID');
    return { path: file.path.replaceAll('\\', '/'), page: pageSlugFromRawPath(file.path.replaceAll('\\', '/')),
      bytes: file.bytes.length, sha256: sha256(file.bytes) };
  }).sort((left, right) => left.path.localeCompare(right.path, 'en'));
  if (new Set(files.map(file => file.page)).size !== files.length) throw new Error('SVELTEKIT_DOCS_RAW_PAGE_DUPLICATE');

  let chunks;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(chunksFileBytes);
    chunks = text.split(/\r?\n/u).filter(line => line.trim()).map(line => JSON.parse(line));
  } catch { throw new Error('SVELTEKIT_DOCS_CHUNKS_JSONL_INVALID'); }
  const chunksByPage = new Map();
  for (const chunk of chunks) {
    if (typeof chunk?.chunk_id !== 'string' || !chunk.chunk_id || typeof chunk.source_url !== 'string' ||
        typeof chunk.document_checksum !== 'string') throw new Error('SVELTEKIT_DOCS_CHUNK_RECORD_INVALID');
    const page = pageSlugFromChunkUrl(chunk.source_url);
    const entry = chunksByPage.get(page) ?? { page, chunkCount: 0, documentChecksums: new Set(), sourceUrls: new Set() };
    entry.chunkCount += 1;
    entry.documentChecksums.add(chunk.document_checksum);
    entry.sourceUrls.add(chunk.source_url);
    chunksByPage.set(page, entry);
  }
  const rawPages = new Set(files.map(file => file.page));
  const chunkPages = new Set(chunksByPage.keys());
  const missingFromChunks = [...rawPages].filter(page => !chunkPages.has(page)).sort();
  const missingFromRaw = [...chunkPages].filter(page => !rawPages.has(page)).sort();
  const chunkCoverage = [...chunksByPage.values()].map(entry => ({ page: entry.page, chunkCount: entry.chunkCount,
    documentChecksums: [...entry.documentChecksums].sort(), sourceUrls: [...entry.sourceUrls].sort() }))
    .sort((left, right) => left.page.localeCompare(right.page, 'en'));
  const corpusSha256 = sha256(Buffer.from(JSON.stringify(files), 'utf8'));
  return {
    schema: 'atlas.sveltekit-docs-corpus-manifest.v1',
    status: missingFromChunks.length || missingFromRaw.length ? 'PAGE_COVERAGE_MISMATCH' : 'MANIFEST_VALID',
    source: 'docs/.okf/pinned/sveltekit/raw',
    files,
    corpusSha256,
    chunks: { path: 'docs/.okf/pinned/sveltekit/chunks.jsonl', bytes: chunksFileBytes.length,
      sha256: sha256(chunksFileBytes), recordCount: chunks.length, pageCount: chunkPages.size },
    chunkCoverage,
    coverage: { rawPageCount: files.length, chunkPageCount: chunkPages.size, missingFromChunks, missingFromRaw },
    canonicalAuthority: false,
    datastoreWritesCommitted: 0,
  };
}

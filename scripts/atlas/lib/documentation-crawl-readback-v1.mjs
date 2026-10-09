import crypto from 'node:crypto';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sha256Json = (value) => sha256(Buffer.from(JSON.stringify(value), 'utf8'));

export async function verifyDocumentationCrawlReadbackV1({ allowlist, entries, readArtifacts }) {
  const metadata = allowlist?.atlasDocumentationDemand;
  if (metadata?.schema !== 'atlas.documentation-crawl-allowlist.v1'
    || metadata.canonicalAuthority !== false
    || metadata.fetchPerformed !== false
    || metadata.datastoreWritesPerformed !== false
    || !Array.isArray(metadata.selectedSources)
    || !Array.isArray(allowlist.sources)) throw new Error('CRAWL_ALLOWLIST_INVALID');
  const { checksum, ...metadataBody } = metadata;
  if (checksum !== sha256Json(metadataBody)) throw new Error('CRAWL_ALLOWLIST_CHECKSUM_MISMATCH');
  if (metadata.selectedSources.length !== allowlist.sources.length) throw new Error('CRAWL_ALLOWLIST_SOURCE_COUNT_MISMATCH');
  for (let index = 0; index < allowlist.sources.length; index += 1) {
    const source = allowlist.sources[index];
    const selected = metadata.selectedSources[index];
    if (selected?.sourceId !== source?.source_id
      || JSON.stringify(selected.pages) !== JSON.stringify(source.pages)
      || selected.sourceChecksum !== sha256Json(source)) throw new Error('CRAWL_ALLOWLIST_SOURCE_BINDING_MISMATCH');
  }
  if (!Array.isArray(entries) || typeof readArtifacts !== 'function') throw new Error('CRAWL_READBACK_INPUT_INVALID');

  const expected = new Map();
  for (const source of allowlist.sources) {
    if (typeof source.source_id !== 'string' || !Array.isArray(source.pages)) throw new Error('CRAWL_ALLOWLIST_SOURCE_INVALID');
    for (const url of source.pages) expected.set(`${source.source_id}\0${url}`, { sourceId: source.source_id, url });
  }

  const seen = new Set();
  const verified = [];
  for (const entry of entries) {
    if (entry?.schema_version !== 'okf.dev.corpus.v1'
      || typeof entry.source_id !== 'string'
      || typeof entry.source_ref !== 'string'
      || typeof entry.url !== 'string'
      || typeof entry.content_hash !== 'string'
      || typeof entry.markdown_path !== 'string') throw new Error('CRAWL_CORPUS_ENTRY_INVALID');
    const key = `${entry.source_id}\0${entry.url}`;
    if (!expected.has(key)) throw new Error('CRAWL_ENTRY_OUTSIDE_ALLOWLIST');
    if (seen.has(key)) throw new Error('CRAWL_ENTRY_DUPLICATE');
    seen.add(key);
    const { markdownBytes, sidecar } = await readArtifacts(entry);
    if (!Buffer.isBuffer(markdownBytes) && !(markdownBytes instanceof Uint8Array)) throw new Error('CRAWL_MARKDOWN_BYTES_INVALID');
    const markdownChecksum = sha256(markdownBytes);
    if (entry.content_hash !== markdownChecksum) throw new Error('CRAWL_MARKDOWN_CHECKSUM_MISMATCH');
    if (sidecar?.source_id !== entry.source_id
      || sidecar?.source_ref !== entry.source_ref
      || sidecar?.url !== entry.url
      || sidecar?.content_hash !== entry.content_hash
      || sidecar?.markdown_path !== entry.markdown_path
      || sidecar?.raw_path !== entry.markdown_path) throw new Error('CRAWL_SIDECAR_BINDING_MISMATCH');
    verified.push({ sourceId: entry.source_id, sourceRef: entry.source_ref, url: entry.url, contentHash: markdownChecksum });
  }

  const missing = [...expected.values()].filter((item) => !seen.has(`${item.sourceId}\0${item.url}`));
  const payload = {
    schema: 'atlas.documentation-crawl-readback.v1',
    status: entries.length === 0 ? 'EMPTY_READBACK' : missing.length ? 'PARTIAL_ALLOWED_PAGE_READBACK' : 'ALLOWLIST_READBACK_MATCH',
    allowlistChecksum: checksum,
    expectedPageCount: expected.size,
    readbackPageCount: verified.length,
    missingPages: missing,
    verified,
    fetchPerformed: true,
    datastoreWritesPerformed: false,
    canonicalAuthority: false,
  };
  return { ...payload, checksum: sha256Json(payload) };
}

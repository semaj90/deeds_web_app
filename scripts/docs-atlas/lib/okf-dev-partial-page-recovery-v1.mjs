import crypto from 'node:crypto';

export function recoverOkfDevPartialPageV1({ sidecar, markdown, sourceId, sourceRef, url, markdownPath }) {
  const entry = sidecar && typeof sidecar === 'object' ? sidecar : null;
  if (!entry || entry.schema_version !== 'okf.dev.corpus.v1') {
    throw new Error('PARTIAL_PAGE_SIDECAR_SCHEMA_INVALID');
  }
  if (entry.source_id !== sourceId || entry.source_ref !== sourceRef || entry.url !== url) {
    throw new Error('PARTIAL_PAGE_IDENTITY_MISMATCH');
  }
  if (entry.markdown_path !== markdownPath || entry.raw_path !== markdownPath) {
    throw new Error('PARTIAL_PAGE_PATH_MISMATCH');
  }
  const actualHash = crypto.createHash('sha256').update(markdown, 'utf8').digest('hex');
  if (entry.content_hash !== actualHash) {
    throw new Error('PARTIAL_PAGE_CONTENT_CHECKSUM_MISMATCH');
  }
  const corpusEntry = { ...entry };
  delete corpusEntry.raw_path;
  return corpusEntry;
}

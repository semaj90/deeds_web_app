import { createHash } from 'node:crypto';
import path from 'node:path';

const ARCHIVE_SEGMENT = /^(?:\.?archives?|\.?archived|historical|history|backups?)$/i;
const TEXT_EXTENSION = new Set(['.md', '.txt']);

export function buildArchiveTextDocumentProposalV1({ sourceRef, bytes, expectedDigest }) {
  if (typeof sourceRef !== 'string' || !sourceRef.trim() || path.isAbsolute(sourceRef)) {
    throw new Error('ARCHIVE_TEXT_SOURCE_REF_INVALID');
  }
  const normalizedRef = sourceRef.replace(/\\/g, '/');
  const segments = normalizedRef.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('ARCHIVE_TEXT_SOURCE_REF_NOT_NORMALIZED');
  }
  const extension = path.posix.extname(normalizedRef).toLowerCase();
  if (!TEXT_EXTENSION.has(extension)) throw new Error('ARCHIVE_TEXT_EXTENSION_UNSUPPORTED');
  if (!segments.slice(0, -1).some((segment) => ARCHIVE_SEGMENT.test(segment))) {
    throw new Error('ARCHIVE_TEXT_PATH_NOT_ARCHIVED');
  }
  if (!Buffer.isBuffer(bytes)) throw new Error('ARCHIVE_TEXT_BYTES_REQUIRED');

  let content;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('ARCHIVE_TEXT_UTF8_INVALID');
  }
  const contentDigest = createHash('sha256').update(bytes).digest('hex');
  if (expectedDigest !== contentDigest) throw new Error('ARCHIVE_TEXT_DIGEST_MISMATCH');

  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const markdownHeadingCount = extension === '.md'
    ? lines.filter((line) => /^\s{0,3}#{1,6}\s+\S/.test(line)).length
    : null;

  return {
    schema: 'atlas.archive-text-document-proposal.v1',
    sourceRef: normalizedRef,
    extension,
    sourceTypeProposal: 'docs',
    archived: true,
    indexingEligible: false,
    admission: 'NOT_ADMITTED',
    byteLength: bytes.byteLength,
    contentDigest,
    lineCount: lines.length,
    markdownHeadingCount,
    status: 'ARCHIVE_TEXT_REVIEW_ONLY',
  };
}

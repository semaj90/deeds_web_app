import { createHash } from 'node:crypto';
import { verifyChunkSourceSpanReadbackV1 } from './chunk-source-span-v1.mjs';
import {
  chunkLargeTextAtSourceV1,
  chunkTextAtUtf8BoundariesV1,
} from './source-span-aware-chunk-metadata-v1.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function indexerQdrantId(sourceRef, ordinal) {
  const clean = sha256(`fullrepo:${sourceRef}:${ordinal}`).replace(/[^a-f0-9]/gi, '').padEnd(32, '0').slice(0, 32).split('');
  clean[12] = '4';
  clean[16] = ((parseInt(clean[16], 16) & 0x3) | 0x8).toString(16);
  return [
    clean.slice(0, 8).join(''),
    clean.slice(8, 12).join(''),
    clean.slice(12, 16).join(''),
    clean.slice(16, 20).join(''),
    clean.slice(20).join(''),
  ].join('-');
}

function countExactOccurrences(source, content) {
  if (content.length === 0) return 0;
  let count = 0;
  let offset = 0;
  while (offset <= source.length - content.length) {
    const found = source.indexOf(content, offset);
    if (found < 0) break;
    count += 1;
    if (count > 1) return count;
    offset = found + 1;
  }
  return count;
}

function uniqueOccurrenceRange(source, content) {
  if (!content.length) return null;
  const start = source.indexOf(content);
  if (start < 0 || source.indexOf(content, start + 1) >= 0) return null;
  return {
    startChar: start,
    endChar: start + content.length,
    startByte: Buffer.byteLength(source.slice(0, start), 'utf8'),
    endByte: Buffer.byteLength(source.slice(0, start + content.length), 'utf8'),
  };
}

export function inspectChunkSourceAttributionV1({ sourceRef, expectedSourceRevision, sourceBytes, rows }) {
  if (typeof sourceRef !== 'string' || !sourceRef.trim()
    || !/^sha256:[a-f0-9]{64}$/i.test(expectedSourceRevision ?? '')
    || !(Buffer.isBuffer(sourceBytes) || sourceBytes instanceof Uint8Array)
    || !Array.isArray(rows)) {
    return { status: 'BLOCKED', reason: 'ATTRIBUTION_INPUT_INVALID', canonicalAuthority: false, evidenceAdmitted: false };
  }

  const source = Buffer.from(sourceBytes);
  const sourceText = source.toString('utf8');
  const actualSourceRevision = `sha256:${sha256(source)}`;
  if (actualSourceRevision.toLowerCase() !== expectedSourceRevision.toLowerCase()) {
    return {
      status: 'BLOCKED',
      reason: 'SOURCE_REVISION_MISMATCH',
      actualSourceRevision,
      expectedSourceRevision,
      canonicalAuthority: false,
      evidenceAdmitted: false,
    };
  }

  const inspectedRows = rows.map((row) => {
    const canonicalChunkId = typeof row?.canonicalChunkId === 'string' ? row.canonicalChunkId : '';
    const content = typeof row?.content === 'string' ? Buffer.from(row.content, 'utf8') : Buffer.alloc(0);
    const contentText = content.toString('utf8');
    const occurrenceRange = uniqueOccurrenceRange(sourceText, contentText);
    const expectedPrefix = `fullrepo:${sourceRef}:`;
    const ordinalText = canonicalChunkId.startsWith(expectedPrefix)
      ? canonicalChunkId.slice(expectedPrefix.length)
      : '';
    const ordinal = /^\d+$/.test(ordinalText) ? Number(ordinalText) : null;
    const storedContentHash = String(row?.contentHash ?? '').replace(/^sha256:/i, '').toLowerCase();
    const expectedContentHash = ordinal === null ? null : sha256(`${sourceRef}:${ordinal}:${content.toString('utf8')}`);
    const sourceSpan = row?.metadata && typeof row.metadata === 'object' ? row.metadata.source_span : null;
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const spanReadback = sourceSpan
      ? verifyChunkSourceSpanReadbackV1({
          descriptor: sourceSpan,
          sourceBytes: source,
          chunkBytes: content,
          expectedSourceRef: sourceRef,
          expectedSourceRevision,
        })
      : null;

    return {
      canonicalChunkId: canonicalChunkId || null,
      chunkRowId: typeof row?.chunkRowId === 'string' ? row.chunkRowId : null,
      revisionStatus: typeof row?.revisionStatus === 'string' ? row.revisionStatus : null,
      sourceRevisionMatches: row?.sourceRevision === expectedSourceRevision,
      lineageProducerRevision: typeof row?.lineageProducerRevision === 'string' ? row.lineageProducerRevision : null,
      metadataKeys: Object.keys(metadata).sort(),
      chunkSource: typeof metadata.chunk_source === 'string' ? metadata.chunk_source : null,
      astStatus: typeof metadata.ast_status === 'string' ? metadata.ast_status : null,
      nodeKind: typeof metadata.node_kind === 'string' ? metadata.node_kind : null,
      symbolName: typeof metadata.symbol_name === 'string' ? metadata.symbol_name : null,
      treeNodeId: typeof metadata.tree_node_id === 'string' ? metadata.tree_node_id : null,
      symbolVersionId: typeof metadata.symbol_version_id === 'string' ? metadata.symbol_version_id : null,
      contentBytes: content.length,
      contentCharacterLength: contentText.length,
      unicodeReplacementCharacterCount: [...contentText].filter((character) => character === '\ufffd').length,
      contentSha256: `sha256:${sha256(content)}`,
      exactSourceOccurrenceCount: countExactOccurrences(source, content),
      uniqueSourceByteRange: occurrenceRange,
      indexerContentHashFormulaMatch: expectedContentHash !== null && storedContentHash === expectedContentHash,
      indexerQdrantIdFormulaMatch: ordinal !== null
        && String(row?.qdrantId ?? '').toLowerCase() === indexerQdrantId(sourceRef, ordinal).toLowerCase(),
      storedSourceSpanPresent: Boolean(sourceSpan),
      storedSourceSpanReadback: spanReadback?.verified === true ? 'MATCH_NOT_ADMITTED' : spanReadback?.reason ?? 'NOT_PRESENT',
      canonicalAuthority: false,
      evidenceAdmitted: false,
    };
  });

  return {
    status: inspectedRows.every((row) => row.sourceRevisionMatches && row.exactSourceOccurrenceCount === 1)
      ? 'SOURCE_CHUNK_BYTES_MATCH_NOT_ADMITTED'
      : 'CHUNK_SOURCE_ATTRIBUTION_INCOMPLETE',
    sourceRef,
    expectedSourceRevision,
    actualSourceRevision,
    sourceByteLength: source.length,
    rowCount: inspectedRows.length,
    rows: inspectedRows,
    contentProducerAttribution: 'NOT_PROVEN_BY_LINEAGE_PRODUCER_REVISION',
    canonicalAuthority: false,
    evidenceAdmitted: false,
  };
}

export function compareCurrentChunkingV1({
  sourceRef,
  sourceText,
  rows,
  size = 800,
  overlap = 100,
  maxChunks = 50,
  largeFileBytes = 200_000,
  strategy = 'AUTO',
}) {
  if (typeof sourceRef !== 'string' || !sourceRef.trim() || typeof sourceText !== 'string' || !Array.isArray(rows)) {
    return { status: 'BLOCKED', reason: 'CURRENT_CHUNKING_INPUT_INVALID', canonicalAuthority: false };
  }

  const sourceByteLength = Buffer.byteLength(sourceText, 'utf8');
  const resolvedStrategy = strategy === 'AUTO'
    ? (sourceByteLength > largeFileBytes ? 'LARGE_TEXT' : 'SLIDING_WINDOW')
    : strategy;
  const generated = resolvedStrategy === 'LARGE_TEXT'
    ? chunkLargeTextAtSourceV1(sourceText, { size, overlap, maxChunks })
    : resolvedStrategy === 'SLIDING_WINDOW'
      ? chunkTextAtUtf8BoundariesV1(sourceText, size, overlap).slice(0, maxChunks)
      : resolvedStrategy === 'LEGACY_SLIDING_WINDOW'
        ? legacySlidingWindows(sourceText, size, overlap, maxChunks)
      : null;
  if (!generated) return { status: 'BLOCKED', reason: 'CHUNKING_STRATEGY_UNSUPPORTED', canonicalAuthority: false };
  const expectedPrefix = `fullrepo:${sourceRef}:`;
  const comparedRows = rows.map((row) => {
    const chunkId = typeof row?.canonicalChunkId === 'string' ? row.canonicalChunkId : '';
    const suffix = chunkId.startsWith(expectedPrefix) ? chunkId.slice(expectedPrefix.length) : '';
    const ordinal = /^\d+$/.test(suffix) ? Number(suffix) : null;
    const expected = ordinal === null ? null : generated[ordinal];
    const content = typeof row?.content === 'string' ? row.content : null;
    const exactTextMatch = expected !== null && expected !== undefined && expected.text === content;

    return {
      canonicalChunkId: chunkId || null,
      ordinal,
      currentChunkExists: Boolean(expected),
      exactTextMatch,
      currentChunkSourceSpanPresent: Number.isSafeInteger(expected?.sourceByteStart)
        && Number.isSafeInteger(expected?.sourceByteEnd),
      status: exactTextMatch ? 'CURRENT_CHUNKER_TEXT_MATCH' : 'CURRENT_CHUNKER_TEXT_MISMATCH',
    };
  });

  return {
    status: comparedRows.every((row) => row.exactTextMatch) ? 'CURRENT_CHUNKER_REPRODUCTION_MATCH' : 'CURRENT_CHUNKER_REPRODUCTION_MISMATCH',
    algorithm: `INDEX_FULL_REPO_${resolvedStrategy}_V1`,
    generatedChunkCount: generated.length,
    rows: comparedRows,
    producerAttribution: 'NOT_ESTABLISHED_BY_REPRODUCTION',
    canonicalAuthority: false,
    evidenceAdmitted: false,
  };
}

function legacySlidingWindows(sourceText, size, overlap, maxChunks) {
  const chunks = [];
  let start = 0;
  while (start < sourceText.length && chunks.length < maxChunks) {
    const end = Math.min(start + size, sourceText.length);
    chunks.push({ text: sourceText.slice(start, end), start, end });
    if (end === sourceText.length) break;
    start += size - overlap;
  }
  return chunks;
}

function utf16OffsetToUtf8Byte(sourceText, offset) {
  if (!Number.isInteger(offset) || offset < 0 || offset > sourceText.length) return null;
  if (offset > 0 && offset < sourceText.length) {
    const before = sourceText.charCodeAt(offset - 1);
    const after = sourceText.charCodeAt(offset);
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) return null;
  }
  return Buffer.byteLength(sourceText.slice(0, offset), 'utf8');
}

function intervalRelation(left, right) {
  if (left.start === right.start && left.end === right.end) return 'EXACT';
  if (left.end <= right.start || right.end <= left.start) return 'DISJOINT';
  if (left.start <= right.start && left.end >= right.end) return 'STORED_CONTAINS_OBSERVED';
  if (right.start <= left.start && right.end >= left.end) return 'OBSERVED_CONTAINS_STORED';
  return 'OVERLAP';
}

export function buildSymbolSpanDiagnosticV1({ stored, observed, sourceBytes, sourceText }) {
  const storedSpan = { start: stored.start, end: stored.end };
  const observedSpan = { start: observed.start, end: observed.end };
  const validStored = Number.isInteger(stored.start) && Number.isInteger(stored.end)
    && stored.start >= 0 && stored.end > stored.start && stored.end <= sourceBytes.length;
  const validObserved = Number.isInteger(observed.start) && Number.isInteger(observed.end)
    && observed.start >= 0 && observed.end > observed.start && observed.end <= sourceBytes.length;
  const storedBytes = validStored ? sourceBytes.subarray(stored.start, stored.end) : null;
  const observedBytes = validObserved ? sourceBytes.subarray(observed.start, observed.end) : null;
  const storedUtf8Start = utf16OffsetToUtf8Byte(sourceText, stored.start);
  const storedUtf8End = utf16OffsetToUtf8Byte(sourceText, stored.end);
  const utf16ConversionMatches = storedUtf8Start === observed.start && storedUtf8End === observed.end;
  const sameName = stored.name === observed.name
    || (typeof stored.name === 'string' && typeof observed.name === 'string'
      && (stored.name.endsWith(`.${observed.name}`) || observed.name.endsWith(`.${stored.name}`)));
  const sameExtractedBytes = Boolean(storedBytes && observedBytes && storedBytes.equals(observedBytes));
  const relation = validStored && validObserved ? intervalRelation(storedSpan, observedSpan) : 'INVALID_SPAN';
  const verdict = !validStored || !validObserved ? 'UNRESOLVED'
    : stored.start === observed.start && stored.end === observed.end ? 'EXACT_MATCH'
    : sameName && utf16ConversionMatches ? 'COORDINATE_ENCODING_MISMATCH'
    : sameName && stored.nodeKind != null && stored.nodeKind === observed.nodeKind
      && stored.spanSemantic === 'DECLARATION_NODE' && relation !== 'DISJOINT' ? 'NODE_BOUNDARY_MISMATCH'
    : 'UNRESOLVED';

  return {
    packetKey: stored.packetKey,
    symbolVersionId: stored.symbolVersionId,
    sourceRef: stored.sourceRef,
    sourceDigest: stored.sourceRevision,
    stored: {
      start: stored.start,
      end: stored.end,
      producerRevision: stored.producerRevision ?? null,
      name: stored.name ?? null,
      sourceKind: stored.sourceKind ?? null,
      sourceLanguage: stored.sourceLanguage ?? null,
      sourceExtractor: stored.sourceExtractor ?? null,
      nominationId: stored.nominationId ?? null,
      coordinateEncoding: stored.coordinateEncoding ?? null,
      nodeKind: stored.nodeKind ?? null,
      spanSemantic: stored.spanSemantic ?? null,
      text: storedBytes?.toString('utf8') ?? null,
    },
    observed: {
      startByte: observed.start,
      endByte: observed.end,
      grammarId: observed.grammarId,
      nodeKind: observed.nodeKind,
      producerRevision: observed.producerRevision,
      name: observed.name,
      coordinateEncoding: 'UTF8_BYTE_OFFSETS',
      spanSemantic: 'DECLARATION_NODE',
      text: observedBytes?.toString('utf8') ?? null,
    },
    comparison: {
      startDelta: stored.start - observed.start,
      endDelta: stored.end - observed.end,
      sameName,
      sameNodeKind: stored.nodeKind == null ? null : stored.nodeKind === observed.nodeKind,
      sameExtractedBytes,
      intervalRelation: relation,
      utf16ToUtf8ConversionMatches: utf16ConversionMatches,
      convertedStoredSpan: storedUtf8Start == null || storedUtf8End == null
        ? null : { startByte: storedUtf8Start, endByte: storedUtf8End },
    },
    verdict,
  };
}

export function compareCurrentNominationSpanV1({ stored, observed, nominationRows }) {
  const matches = nominationRows.filter((row) => row.source_ref === stored.sourceRef
    && row.qualified_name === stored.name
    && row.source_revision === stored.sourceRevision);
  const currentRows = matches.map((row) => ({
    nominationId: row.nomination_id ?? null,
    sourceRevision: row.source_revision ?? null,
    workspaceRevision: row.workspace_revision ?? null,
    extractor: row.extractor ?? null,
    extractorRevision: row.extractor_revision ?? null,
    startByte: Number.isInteger(row.byte_start) ? row.byte_start : null,
    endByte: Number.isInteger(row.byte_end) ? row.byte_end : null,
    matchesObservedSpan: row.byte_start === observed.start && row.byte_end === observed.end,
    matchesStoredSpan: row.byte_start === stored.start && row.byte_end === stored.end,
    nominationIdMatchesStored: (row.nomination_id ?? null) === (stored.nominationId ?? null),
  }));
  const status = matches.length === 0 ? 'NO_CURRENT_ARTIFACT_MATCH'
    : currentRows.some((row) => row.matchesObservedSpan && !row.matchesStoredSpan)
      ? 'CURRENT_ARTIFACT_MATCHES_OBSERVED_NOT_STORED'
      : currentRows.some((row) => row.matchesStoredSpan) ? 'CURRENT_ARTIFACT_MATCHES_STORED'
        : 'CURRENT_ARTIFACT_SPAN_DIFFERS_FROM_BOTH';
  return { authority: 'DIAGNOSTIC_ONLY', status, currentRows };
}

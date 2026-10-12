const SHA256_REVISION = /^sha256:[a-f0-9]{64}$/;

function parseByteOffset(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function matchPacketAstObservationsToCanonicalSymbolsV1({
  observations,
  symbols,
  packetKey,
  sourceRef,
  sourceRevision,
  workspaceRevision,
}) {
  if (!Array.isArray(observations) || !Array.isArray(symbols)
    || typeof packetKey !== 'string' || !packetKey.trim()
    || typeof sourceRef !== 'string' || !sourceRef.trim()
    || !SHA256_REVISION.test(sourceRevision ?? '')
    || !SHA256_REVISION.test(workspaceRevision ?? '')) {
    throw new Error('CROSSWALK_INPUT_REQUIRED');
  }

  const claimedSymbolVersions = new Set();
  const claimedObservationIds = new Set();
  const matches = [];
  const unmatched = [];
  const ambiguous = [];
  const invalid = [];
  const invalidSymbols = [];
  const validSymbols = [];
  for (const symbol of symbols) {
    const byteStart = parseByteOffset(symbol?.byteStart);
    const byteEnd = parseByteOffset(symbol?.byteEnd);
    if (!symbol || symbol.packetKey !== packetKey || symbol.sourceRef !== sourceRef
      || symbol.sourceRevision !== sourceRevision || symbol.workspaceRevision !== workspaceRevision
      || !SHA256_REVISION.test(symbol.sourceRevision ?? '')
      || !SHA256_REVISION.test(symbol.workspaceRevision ?? '')
      || typeof symbol.symbolVersionId !== 'string' || !symbol.symbolVersionId.trim()
      || typeof symbol.stableSymbolId !== 'string' || !symbol.stableSymbolId.trim()
      || typeof symbol.qualifiedName !== 'string' || !symbol.qualifiedName.trim()
      || typeof symbol.registryStatus !== 'string' || !symbol.registryStatus.trim()
      || byteStart === null || byteEnd === null || byteEnd <= byteStart) {
      invalidSymbols.push({
        symbolVersionId: symbol?.symbolVersionId ?? null,
        reason: 'CANONICAL_SYMBOL_IDENTITY_REVISION_OR_SPAN_INVALID',
      });
      continue;
    }
    validSymbols.push({ symbol, byteStart, byteEnd });
  }

  for (const item of observations) {
    const observation = item?.observation;
    const name = observation?.captures?.name;
    const observationId = observation?.observation_id;
    if (typeof observationId !== 'string' || !observationId.trim()
      || claimedObservationIds.has(observationId)
      || observation?.source_ref !== sourceRef
      || observation?.source_revision !== sourceRevision
      || observation?.canonical_authority !== false
      || !Number.isSafeInteger(observation?.byte_start)
      || !Number.isSafeInteger(observation?.byte_end)
      || observation.byte_start < 0
      || observation.byte_end <= observation.byte_start
      || typeof name !== 'string' || !name.trim()) {
      invalid.push({ observationId: observationId ?? null, reason: 'OBSERVATION_IDENTITY_REVISION_OR_SPAN_INVALID' });
      continue;
    }
    claimedObservationIds.add(observationId);
    const candidates = validSymbols.filter(({ symbol, byteStart, byteEnd }) => symbol.packetKey === packetKey
      && symbol.sourceRef === sourceRef
      && symbol.sourceRevision === sourceRevision
      && symbol.workspaceRevision === workspaceRevision
      && symbol.registryStatus === 'active'
      && byteStart === observation?.byte_start
      && byteEnd === observation?.byte_end
      && String(symbol.qualifiedName).split('::').at(-1) === name);

    if (candidates.length === 0) {
      unmatched.push({ observationId, name });
      continue;
    }
    if (candidates.length !== 1 || claimedSymbolVersions.has(candidates[0].symbol.symbolVersionId)) {
      ambiguous.push({ observationId, name, candidateCount: candidates.length });
      continue;
    }
    claimedSymbolVersions.add(candidates[0].symbol.symbolVersionId);
    matches.push({
      observationId,
      name,
      syntaxKind: observation.captures.syntax_kind ?? null,
      byteStart: observation.byte_start,
      byteEnd: observation.byte_end,
      symbolVersionId: candidates[0].symbol.symbolVersionId,
      stableSymbolId: candidates[0].symbol.stableSymbolId,
      qualifiedName: candidates[0].symbol.qualifiedName,
    });
  }

  invalid.sort((a, b) => String(a.observationId).localeCompare(String(b.observationId)) || a.reason.localeCompare(b.reason));
  invalidSymbols.sort((a, b) => String(a.symbolVersionId).localeCompare(String(b.symbolVersionId)) || a.reason.localeCompare(b.reason));
  unmatched.sort((a, b) => String(a.observationId).localeCompare(String(b.observationId)));
  ambiguous.sort((a, b) => String(a.observationId).localeCompare(String(b.observationId)));
  matches.sort((a, b) => a.byteStart - b.byteStart || a.symbolVersionId.localeCompare(b.symbolVersionId));
  const activeSymbols = validSymbols.filter(({ symbol }) => symbol.registryStatus === 'active');
  const uniqueMatchedSymbolVersions = new Set(matches.map((item) => item.symbolVersionId)).size === matches.length;
  const exactCanonicalSymbolCoverage = invalidSymbols.length === 0 && ambiguous.length === 0
    && activeSymbols.length > 0 && matches.length === activeSymbols.length && uniqueMatchedSymbolVersions;

  return {
    matches,
    unmatched,
    ambiguous,
    invalid,
    invalidSymbols,
    allStoredVersionsMatched: exactCanonicalSymbolCoverage,
    exactCanonicalSymbolCoverage,
    exactOneToOne: invalid.length === 0 && invalidSymbols.length === 0 && unmatched.length === 0 && ambiguous.length === 0
      && exactCanonicalSymbolCoverage
      && new Set(matches.map((item) => item.observationId)).size === matches.length
      && uniqueMatchedSymbolVersions,
  };
}

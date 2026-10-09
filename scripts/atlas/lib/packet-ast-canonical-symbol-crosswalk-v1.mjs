export function matchPacketAstObservationsToCanonicalSymbolsV1({
  observations,
  symbols,
  packetKey,
  sourceRef,
  sourceRevision,
  workspaceRevision,
}) {
  if (!Array.isArray(observations) || !Array.isArray(symbols)
    || !packetKey || !sourceRef || !sourceRevision || !workspaceRevision) {
    throw new Error('CROSSWALK_INPUT_REQUIRED');
  }

  const claimedSymbolVersions = new Set();
  const matches = [];
  const unmatched = [];
  const ambiguous = [];
  for (const item of observations) {
    const observation = item.observation;
    const name = observation?.captures?.name;
    const candidates = symbols.filter((symbol) => symbol.packetKey === packetKey
      && symbol.sourceRef === sourceRef
      && symbol.sourceRevision === sourceRevision
      && symbol.workspaceRevision === workspaceRevision
      && symbol.registryStatus === 'active'
      && Number(symbol.byteStart) === observation?.byte_start
      && Number(symbol.byteEnd) === observation?.byte_end
      && typeof name === 'string'
      && String(symbol.qualifiedName).split('::').at(-1) === name);

    if (candidates.length === 0) {
      unmatched.push({ observationId: observation?.observation_id ?? null, name: name ?? null });
      continue;
    }
    if (candidates.length !== 1 || claimedSymbolVersions.has(candidates[0].symbolVersionId)) {
      ambiguous.push({ observationId: observation?.observation_id ?? null, name, candidateCount: candidates.length });
      continue;
    }
    claimedSymbolVersions.add(candidates[0].symbolVersionId);
    matches.push({
      observationId: observation.observation_id,
      name,
      syntaxKind: observation.captures.syntax_kind ?? null,
      byteStart: observation.byte_start,
      byteEnd: observation.byte_end,
      symbolVersionId: candidates[0].symbolVersionId,
      stableSymbolId: candidates[0].stableSymbolId,
      qualifiedName: candidates[0].qualifiedName,
    });
  }

  return {
    matches,
    unmatched,
    ambiguous,
    allStoredVersionsMatched: symbols.length > 0 && matches.length === symbols.length,
    exactOneToOne: ambiguous.length === 0
      && new Set(matches.map((item) => item.observationId)).size === matches.length
      && new Set(matches.map((item) => item.symbolVersionId)).size === matches.length,
  };
}

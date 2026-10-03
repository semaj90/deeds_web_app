const text = (value) => typeof value === 'string' ? value.trim() : '';
const sha256Revision = (value) => /^sha256:[0-9a-f]{64}$/i.test(text(value));

/** Exact documentation-to-code symbol join. Documentation and code revisions
 * are separate artifacts; never compare them or infer one from the other. */
export function matchApiRuleToSymbols(rule, symbols) {
  const apiSymbol = text(rule.apiSymbol ?? rule.api_symbol);
  const documentationSourceRevision = text(
    rule.evidenceSpan?.sourceRevision ?? rule.evidence_span?.source_revision ?? rule.sourceRevision,
  );
  const targetCodeSourceRevision = text(rule.targetSourceRevision ?? rule.target_source_revision);

  if (!apiSymbol) return { status: 'UNRESOLVED', reason: 'MISSING_API_SYMBOL', matches: [] };
  if (!sha256Revision(documentationSourceRevision)) {
    return { status: 'UNRESOLVED', reason: 'INVALID_DOCUMENTATION_SOURCE_REVISION', matches: [] };
  }

  const candidates = symbols.filter((symbol) => {
    const names = [symbol.canonicalQualifiedName, symbol.canonical_qualified_name,
      symbol.canonicalName, symbol.canonical_name, symbol.canonicalKey,
      symbol.canonical_key, symbol.name].map(text).filter(Boolean);
    return names.includes(apiSymbol);
  });
  if (!candidates.length) return { status: 'UNRESOLVED', reason: 'SYMBOL_NOT_FOUND', matches: [] };

  if (!targetCodeSourceRevision) {
    return {
      status: 'UNRESOLVED',
      reason: 'TARGET_CODE_SOURCE_REVISION_MISSING',
      candidateCount: candidates.length,
      matches: [],
    };
  }
  if (!sha256Revision(targetCodeSourceRevision)) {
    return { status: 'UNRESOLVED', reason: 'INVALID_TARGET_CODE_SOURCE_REVISION', matches: [] };
  }

  const revisionMatches = candidates.filter((symbol) =>
    text(symbol.sourceRevision ?? symbol.source_revision) === targetCodeSourceRevision,
  );
  if (!revisionMatches.length) {
    return { status: 'STALE_CODE_SOURCE', reason: 'NO_TARGET_CODE_REVISION_MATCH', candidateCount: candidates.length, matches: [] };
  }
  if (revisionMatches.length > 1) {
    return { status: 'AMBIGUOUS', reason: 'MULTIPLE_EXACT_CODE_REVISION_MATCHES', matches: revisionMatches };
  }

  const symbol = revisionMatches[0];
  const stableSymbolId = text(symbol.stableSymbolId ?? symbol.stable_symbol_id);
  const symbolVersionId = text(symbol.symbolVersionId ?? symbol.symbol_version_id);
  if (!stableSymbolId || !symbolVersionId) return { status: 'UNRESOLVED', reason: 'SYMBOL_ID_INCOMPLETE', matches: [] };

  return {
    status: 'MATCHED',
    reason: 'EXACT_NAME_AND_TARGET_CODE_SOURCE_REVISION',
    matches: [{
      stableSymbolId,
      symbolVersionId,
      sourceRef: text(symbol.sourceRef ?? symbol.source_ref),
      documentationSourceRevision,
      codeSourceRevision: targetCodeSourceRevision,
    }],
  };
}

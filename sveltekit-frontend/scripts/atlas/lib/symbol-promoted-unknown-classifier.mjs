// Pure, testable classification/aggregation logic for SYMBOL-PROMOTED-UNKNOWN-01. Extracted from
// symbol-promoted-unknown-audit-v1.mjs so it can be unit-tested with vitest without a live
// Postgres connection or file I/O -- per the review's explicit test list.

/**
 * Fail-closed classification of one observation against pre-fetched registry rows for its file.
 * NO name-only joins, NO path-only joins, NO latest-symbol-version substitution, NO fuzzy
 * matching as identity, NO workspace-revision-for-source-revision substitution.
 *
 * @param {{utf8StartByte:number, utf8EndByte:number, name?:string|null}} sym
 * @param {string} sourceRevision
 * @param {Array<{symbol_version_id:string, stable_symbol_id:string, source_revision:string, byte_start:number, byte_end:number, qualified_name?:string|null}>} registryRows
 */
export function classifyObservation(sym, sourceRevision, registryRows) {
  if (registryRows.length === 0) {
    return { status: 'REGISTRY_MISSING' };
  }
  const sameRevisionRows = registryRows.filter((r) => r.source_revision === sourceRevision);
  if (sameRevisionRows.length === 0) {
    return { status: 'REVISION_MISMATCH', observedRevisions: [...new Set(registryRows.map((r) => r.source_revision))] };
  }
  const exactSpanRows = sameRevisionRows.filter(
    (r) => Number(r.byte_start) === sym.utf8StartByte && Number(r.byte_end) === sym.utf8EndByte,
  );
  if (exactSpanRows.length === 0) {
    return { status: 'SPAN_MISMATCH', sameRevisionRowCount: sameRevisionRows.length };
  }
  if (exactSpanRows.length > 1) {
    return { status: 'AMBIGUOUS', matchCount: exactSpanRows.length };
  }
  const match = exactSpanRows[0];
  if (sym.name && match.qualified_name && !String(match.qualified_name).includes(sym.name)) {
    return { status: 'NAME_OR_SIGNATURE_MISMATCH', observedName: sym.name, registryQualifiedName: match.qualified_name, symbolVersionId: match.symbol_version_id };
  }
  return { status: 'EXACT', symbolVersionId: match.symbol_version_id, stableSymbolId: match.stable_symbol_id, parentEvidenceEvaluated: false };
}

/**
 * Aggregates a list of already-classified observations into the promoted-UNKNOWN metrics,
 * distinguishing observation-level counts from distinct symbol_version/stable_symbol counts (the
 * dedup this review specifically required -- "100 UNKNOWN observations -> ... -> 3 registry rows").
 *
 * @param {Array<{symbolKind:string, classification:{status:string, symbolVersionId?:string, stableSymbolId?:string}, registrySymbolKind:string|null}>} items
 */
export function aggregatePromotedUnknown(items) {
  let exactResolvedObservations = 0;
  let exactResolvedUnknownObservations = 0;
  const exactUnknownSymbolVersionIds = new Set();
  const exactUnknownStableSymbolIds = new Set();
  const observationUnknownRegistryTyped = [];
  const typedObservationToUnknownRegistry = [];

  for (const item of items) {
    if (item.classification.status !== 'EXACT') continue;
    exactResolvedObservations += 1;

    const observationIsUnknown = item.symbolKind === 'UNKNOWN';
    const registryIsUnknown = item.registrySymbolKind === 'UNKNOWN';

    if (observationIsUnknown && registryIsUnknown) {
      exactResolvedUnknownObservations += 1;
      exactUnknownSymbolVersionIds.add(item.classification.symbolVersionId);
      exactUnknownStableSymbolIds.add(item.classification.stableSymbolId);
    } else if (observationIsUnknown && item.registrySymbolKind && !registryIsUnknown) {
      observationUnknownRegistryTyped.push(item);
    } else if (!observationIsUnknown && registryIsUnknown) {
      typedObservationToUnknownRegistry.push(item);
    }
  }

  return {
    exactResolvedObservations,
    exactResolvedUnknownObservations,
    promotedUnknown: {
      observationLevelCount: exactResolvedUnknownObservations,
      distinctSymbolVersionCount: exactUnknownSymbolVersionIds.size,
      distinctStableSymbolCount: exactUnknownStableSymbolIds.size,
      // The canonical registry-pollution count is the distinct-stable-symbol count, NOT the raw
      // observation count -- per the review's worked example (100 obs -> 17 versions -> 8
      // symbols -> 3 registry rows; pollution = 3).
      registryRowCount: exactUnknownStableSymbolIds.size,
    },
    inverseAnomalies: {
      observationUnknownRegistryTyped,
      typedObservationToUnknownRegistry,
    },
  };
}

#!/usr/bin/env node

/**
 * DOC-13 read-only documentation ↔ existing symbol-registry proof.
 * No fuzzy identity, synthetic revisions, or datastore writes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..', '..');
const reportPath = path.join(root, 'docs', 'reports', 'parent-atlas', 'doc-13-symbol-mutual-index-v1.json');

const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function matchApiRuleToSymbols(rule, symbols) {
  const apiSymbol = text(rule.apiSymbol ?? rule.api_symbol);
  const sourceRevision = text(rule.evidenceSpan?.sourceRevision ?? rule.sourceRevision);
  if (!apiSymbol || !sourceRevision) return { status: 'UNRESOLVED', reason: 'MISSING_SYMBOL_OR_SOURCE_REVISION', matches: [] };

  const candidates = symbols.filter((symbol) => {
    const names = [symbol.canonicalQualifiedName, symbol.canonicalName, symbol.canonicalKey, symbol.name]
      .map(text).filter(Boolean);
    return names.includes(apiSymbol);
  });
  if (!candidates.length) return { status: 'UNRESOLVED', reason: 'SYMBOL_NOT_FOUND', matches: [] };

  const revisionMatches = candidates.filter((symbol) => text(symbol.sourceRevision ?? symbol.source_revision) === sourceRevision);
  if (!revisionMatches.length) return { status: 'STALE_SOURCE', reason: 'NO_SOURCE_REVISION_MATCH', matches: [] };
  if (revisionMatches.length > 1) return { status: 'AMBIGUOUS', reason: 'MULTIPLE_EXACT_REVISION_MATCHES', matches: revisionMatches };

  const symbol = revisionMatches[0];
  const stableSymbolId = text(symbol.stableSymbolId ?? symbol.stable_symbol_id);
  const symbolVersionId = text(symbol.symbolVersionId ?? symbol.symbol_version_id);
  if (!stableSymbolId || !symbolVersionId) return { status: 'UNRESOLVED', reason: 'SYMBOL_ID_INCOMPLETE', matches: [] };
  return {
    status: 'MATCHED',
    reason: 'EXACT_NAME_AND_SOURCE_REVISION',
    matches: [{ stableSymbolId, symbolVersionId, sourceRef: text(symbol.sourceRef ?? symbol.source_ref), sourceRevision }],
  };
}

function fixture() {
  const sourceRevision = 'sha256:doc-fixture-revision';
  const rule = {
    apiSymbol: 'Graph.from_cudf_edgelist',
    evidenceSpan: { sourceRevision },
  };
  const symbols = [{
    canonicalQualifiedName: 'Graph.from_cudf_edgelist',
    stableSymbolId: 'symbol:graph.from_cudf_edgelist',
    symbolVersionId: 'symbol-version:graph.from_cudf_edgelist:1',
    sourceRef: 'src/graph.py',
    sourceRevision,
  }];
  const matched = matchApiRuleToSymbols(rule, symbols);
  const stale = matchApiRuleToSymbols(rule, [{ ...symbols[0], sourceRevision: 'sha256:stale' }]);
  const ambiguous = matchApiRuleToSymbols(rule, [symbols[0], { ...symbols[0], stableSymbolId: 'symbol:duplicate' }]);
  const unmapped = matchApiRuleToSymbols({ ...rule, apiSymbol: 'Missing.api' }, symbols);
  return {
    matched: matched.status === 'MATCHED',
    staleRejected: stale.status === 'STALE_SOURCE',
    ambiguousRejected: ambiguous.status === 'AMBIGUOUS',
    unmappedRejected: unmapped.status === 'UNRESOLVED',
    result: matched,
  };
}

const result = fixture();
const report = {
  schema: 'atlas.doc-symbol-mutual-index-proof.v1',
  gate: 'DOC-13',
  status: Object.values(result).slice(0, 4).every(Boolean) ? 'READ_ONLY_PROVEN' : 'FAILED',
  result,
  identityOwner: 'existing stableSymbolId/symbolVersionId registry',
  matchingPolicy: 'exact symbol name plus exact sourceRevision; no fuzzy identity',
  writesPerformed: false,
  canonicalAuthority: false,
  reportChecksum: sha256(result),
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, writesPerformed: false }, null, 2));
if (report.status !== 'READ_ONLY_PROVEN') process.exitCode = 1;

#!/usr/bin/env node

/**
 * DOC-13 read-only documentation ↔ existing symbol-registry proof.
 * No fuzzy identity, synthetic revisions, or datastore writes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { matchApiRuleToSymbols } from './lib/doc-symbol-mutual-index-v1.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const reportPath = path.join(root, 'docs', 'reports', 'parent-atlas', 'doc-13-symbol-mutual-index-v1.json');

const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fixture() {
  const documentationSourceRevision = `sha256:${'a'.repeat(64)}`;
  const targetSourceRevision = `sha256:${'b'.repeat(64)}`;
  const rule = {
    apiSymbol: 'Graph.from_cudf_edgelist',
    evidenceSpan: { sourceRevision: documentationSourceRevision },
    targetSourceRevision,
  };
  const symbols = [{
    canonicalQualifiedName: 'Graph.from_cudf_edgelist',
    stableSymbolId: 'symbol:graph.from_cudf_edgelist',
    symbolVersionId: 'symbol-version:graph.from_cudf_edgelist:1',
    sourceRef: 'src/graph.py',
    sourceRevision: targetSourceRevision,
  }];
  const matched = matchApiRuleToSymbols(rule, symbols);
  const stale = matchApiRuleToSymbols({ ...rule, targetSourceRevision: `sha256:${'c'.repeat(64)}` }, symbols);
  const ambiguous = matchApiRuleToSymbols(rule, [symbols[0], { ...symbols[0], stableSymbolId: 'symbol:duplicate' }]);
  const unmapped = matchApiRuleToSymbols({ ...rule, apiSymbol: 'Missing.api' }, symbols);
  const missingCodeRevision = matchApiRuleToSymbols({ ...rule, targetSourceRevision: undefined }, symbols);
  return {
    matched: matched.status === 'MATCHED',
    staleRejected: stale.status === 'STALE_CODE_SOURCE',
    ambiguousRejected: ambiguous.status === 'AMBIGUOUS',
    unmappedRejected: unmapped.status === 'UNRESOLVED',
    missingCodeRevisionRejected: missingCodeRevision.reason === 'TARGET_CODE_SOURCE_REVISION_MISSING',
    distinctRevisionDomainsPreserved: matched.matches[0]?.documentationSourceRevision === documentationSourceRevision
      && matched.matches[0]?.codeSourceRevision === targetSourceRevision,
    result: matched,
  };
}

const result = fixture();
const report = {
  schema: 'atlas.doc-symbol-mutual-index-proof.v1',
  gate: 'DOC-13',
  status: Object.entries(result).filter(([key]) => key !== 'result').every(([, value]) => value)
    ? 'READ_ONLY_PROVEN' : 'FAILED',
  result,
  identityOwner: 'existing stableSymbolId/symbolVersionId registry',
  matchingPolicy: 'exact symbol name plus explicit target code sourceRevision; documentation evidence sourceRevision remains separate; no fuzzy identity',
  writesPerformed: false,
  canonicalAuthority: false,
  reportChecksum: sha256(result),
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, writesPerformed: false }, null, 2));
if (report.status !== 'READ_ONLY_PROVEN') process.exitCode = 1;

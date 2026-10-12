import { createHash } from 'node:crypto';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
} from '../../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { canonicalJson } from './graph-revision-v1.mjs';
import { verifySymbolTocOwnerReadbackV1 } from './symbol-toc-owner-readback-v1.mts';
import { matchApiRuleToSymbols } from './doc-symbol-mutual-index-v1.mjs';

type SymbolRowV1 = {
  symbol_version_id: string;
  stable_symbol_id: string;
  packet_key: string;
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  symbol_kind: string;
  qualified_name: string;
  byte_start: number | string;
  byte_end: number | string;
};

type SourceBindingV1 = {
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  contentDigest: string;
  bindingChecksum: string;
  producerRevision: string | null;
  byteLength: number | null;
  canonicalAuthority: false;
};

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function compareLookupTokenV1(left: string, right: string): number {
  if (/^(0|[1-9][0-9]*)$/.test(left) && /^(0|[1-9][0-9]*)$/.test(right)) {
    return Number(left) - Number(right);
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function buildLookupTableV1(entries: Array<{ key: string; value: string }>) {
  const grouped = new Map<string, Set<string>>();
  for (const { key, value } of entries) {
    const values = grouped.get(key) ?? new Set<string>();
    values.add(value);
    grouped.set(key, values);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => compareLookupTokenV1(left, right))
    .map(([key, values]) => ({
      key,
      values: [...values].sort(compareLookupTokenV1),
    }));
}

export async function buildSymbolTocDiagnosticProjectionV1(input: {
  ordinalMap: unknown;
  symbols: SymbolRowV1[];
  sourceBindings: SourceBindingV1[];
  documentationRules?: Array<Record<string, unknown>>;
  repoRoot: string;
  maxRows?: number;
}) {
  const maxRows = input.maxRows ?? 500;
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 500) {
    return { status: 'BLOCKED', reason: 'ROW_LIMIT_INVALID', canonicalAuthority: false, published: false } as const;
  }

  let ordinalMap: ReturnType<typeof candidateOrdinalMapV1Schema.parse>;
  try {
    ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
    assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  } catch {
    return { status: 'BLOCKED', reason: 'CANDIDATE_ORDINAL_MAP_INVALID', canonicalAuthority: false, published: false } as const;
  }
  if (!Array.isArray(input.symbols) || !Array.isArray(input.sourceBindings)
    || !Array.isArray(input.documentationRules ?? []) || !input.repoRoot) {
    return { status: 'BLOCKED', reason: 'PROJECTION_INPUT_INVALID', canonicalAuthority: false, published: false } as const;
  }
  if (input.symbols.length > maxRows || (input.documentationRules?.length ?? 0) > 1000) {
    return { status: 'BLOCKED', reason: 'SYMBOL_ROW_LIMIT_EXCEEDED', canonicalAuthority: false, published: false } as const;
  }

  const validSymbols = input.symbols.filter((symbol): symbol is SymbolRowV1 =>
    typeof symbol === 'object' && symbol !== null);
  const invalidSymbols = input.symbols.length - validSymbols.length;
  const sortedSymbols = [...validSymbols].sort((left, right) =>
    String(left.source_ref ?? '').localeCompare(String(right.source_ref ?? ''))
    || Number(left.byte_start) - Number(right.byte_start)
    || String(left.symbol_version_id ?? '').localeCompare(String(right.symbol_version_id ?? '')));
  const symbolIds = new Set<string>();
  const bindingsByScope = new Map<string, SourceBindingV1[]>();
  let invalidBindings = 0;
  for (const binding of input.sourceBindings) {
    if (!binding || typeof binding !== 'object') {
      invalidBindings += 1;
      continue;
    }
    const key = `${binding.sourceRef}\0${binding.workspaceRevision}\0${binding.sourceRevision}`;
    bindingsByScope.set(key, [...(bindingsByScope.get(key) ?? []), binding]);
  }

  const rows: Array<Record<string, unknown>> = [];
  let blockedRows = invalidSymbols + invalidBindings;
  let duplicateSymbols = 0;
  if (invalidSymbols) rows.push({ status: 'BLOCKED', reason: 'SYMBOL_ROW_INVALID', count: invalidSymbols });
  if (invalidBindings) rows.push({ status: 'BLOCKED', reason: 'SOURCE_BINDING_ROW_INVALID', count: invalidBindings });
  for (const symbol of sortedSymbols) {
    if (typeof symbol.symbol_version_id !== 'string' || !symbol.symbol_version_id.trim()) {
      blockedRows += 1;
      rows.push({ status: 'BLOCKED', reason: 'SYMBOL_VERSION_ID_MISSING' });
      continue;
    }
    if (symbolIds.has(symbol.symbol_version_id)) {
      duplicateSymbols += 1;
      blockedRows += 1;
      continue;
    }
    symbolIds.add(symbol.symbol_version_id);
    const bindingKey = `${symbol.source_ref}\0${symbol.workspace_revision}\0${symbol.source_revision}`;
    const bindings = bindingsByScope.get(bindingKey) ?? [];
    if (bindings.length !== 1) {
      blockedRows += 1;
      rows.push({ symbolVersionId: symbol.symbol_version_id, status: 'BLOCKED', reason: bindings.length ? 'SOURCE_BINDING_AMBIGUOUS' : 'SOURCE_BINDING_MISSING' });
      continue;
    }
    const readback = await verifySymbolTocOwnerReadbackV1({
      ordinalMap,
      symbol,
      sourceBinding: bindings[0],
      repoRoot: input.repoRoot,
    });
    if (readback.status !== 'SOURCE_READBACK_MATCH_NOT_ADMITTED') {
      blockedRows += 1;
      rows.push({ symbolVersionId: symbol.symbol_version_id, status: 'BLOCKED', reason: readback.reason ?? readback.status });
      continue;
    }
    rows.push({
      ...readback.row,
      status: readback.status,
      candidateSnapshotRevision: readback.candidateSnapshotRevision,
      ordinalMapChecksum: readback.ordinalMapChecksum,
      sourceBindingChecksum: readback.sourceBindingChecksum,
      sourceBindingProducerRevision: readback.sourceBindingProducerRevision,
      spanChecksum: readback.spanChecksum,
      sourceReaderEvidenceRef: readback.sourceReaderEvidenceRef,
      documentationLinkStatus: 'NOT_RESOLVED',
      evidenceAdmitted: false,
    });
  }

  rows.sort((left, right) => Number(left.candidateOrdinal ?? Number.MAX_SAFE_INTEGER) - Number(right.candidateOrdinal ?? Number.MAX_SAFE_INTEGER)
    || String(left.symbolVersionId ?? '').localeCompare(String(right.symbolVersionId ?? '')));
  const readableRows = rows.filter((row) => row.status === 'SOURCE_READBACK_MATCH_NOT_ADMITTED');
  const docSymbols = readableRows.map((row) => ({
    canonicalQualifiedName: row.qualifiedName,
    stableSymbolId: row.stableSymbolId,
    symbolVersionId: row.symbolVersionId,
    sourceRef: row.sourceRef,
    sourceRevision: row.sourceRevision,
  }));
  const readableBySymbolId = new Map(readableRows.map((row) => [String(row.symbolVersionId), row]));
  const documentationLinks: Array<Record<string, unknown>> = [];
  for (const rule of input.documentationRules ?? []) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      documentationLinks.push({ status: 'UNRESOLVED', reason: 'DOCUMENTATION_RULE_INVALID' });
      continue;
    }
    const match = matchApiRuleToSymbols(rule, docSymbols);
    const matchedSymbol = match.status === 'MATCHED' ? readableBySymbolId.get(match.matches[0].symbolVersionId) : null;
    documentationLinks.push({
      status: match.status,
      reason: match.reason ?? null,
      symbolVersionId: matchedSymbol?.symbolVersionId ?? null,
      candidateOrdinal: matchedSymbol?.candidateOrdinal ?? null,
      documentationSourceRevision: match.matches[0]?.documentationSourceRevision ?? null,
      codeSourceRevision: match.matches[0]?.codeSourceRevision ?? null,
    });
  }
  const lookupTables = {
    candidateOrdinalToSymbolVersionIds: buildLookupTableV1(readableRows.map((row) => ({
      key: String(row.candidateOrdinal),
      value: String(row.symbolVersionId),
    }))),
    symbolVersionIdToCandidateOrdinals: buildLookupTableV1(readableRows.map((row) => ({
      key: String(row.symbolVersionId),
      value: String(row.candidateOrdinal),
    }))),
    qualifiedNameToCandidateOrdinals: buildLookupTableV1(readableRows.map((row) => ({
      key: String(row.qualifiedName),
      value: String(row.candidateOrdinal),
    }))),
    sourceRefToCandidateOrdinals: buildLookupTableV1(readableRows.map((row) => ({
      key: String(row.sourceRef),
      value: String(row.candidateOrdinal),
    }))),
    documentationRevisionToCandidateOrdinals: buildLookupTableV1(documentationLinks
      .filter((link) => link.status === 'MATCHED' && typeof link.documentationSourceRevision === 'string'
        && Number.isSafeInteger(link.candidateOrdinal))
      .map((link) => ({
        key: String(link.documentationSourceRevision),
        value: String(link.candidateOrdinal),
      }))),
  };
  const payload = {
    schema: 'atlas.symbol-toc-diagnostic-projection.v1',
    status: rows.some((row) => row.status === 'SOURCE_READBACK_MATCH_NOT_ADMITTED') ? 'SOURCE_READBACK_DIAGNOSTIC_ONLY' : 'BLOCKED',
    workspaceRevision: ordinalMap.workspaceRevision,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    inputSymbols: input.symbols.length,
    verifiedSourceRows: rows.filter((row) => row.status === 'SOURCE_READBACK_MATCH_NOT_ADMITTED').length,
    blockedRows,
    duplicateSymbols,
    rows,
    documentationLinks,
    lookupTables,
    canonicalAuthority: false,
    evidenceAdmitted: false,
    published: false,
    documentationLinkStatus: documentationLinks.some((link) => link.status === 'MATCHED')
      ? 'EXACT_REVISION_MATCHES_NOT_ADMITTED'
      : 'NOT_RESOLVED',
  };
  return { ...payload, diagnosticChecksum: sha256(canonicalJson(payload)) };
}

type SymbolTocDiagnosticProjectionV1 = Awaited<ReturnType<typeof buildSymbolTocDiagnosticProjectionV1>>;
export type SymbolTocDiagnosticLookupKindV1 = keyof SymbolTocDiagnosticProjectionV1['lookupTables'];

export function lookupSymbolTocDiagnosticV1(input: {
  projection: SymbolTocDiagnosticProjectionV1;
  kind: SymbolTocDiagnosticLookupKindV1;
  key: string;
  maxResults?: number;
}) {
  const maxResults = input.maxResults ?? 50;
  const projection = input.projection;
  if (!Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 500
    || !projection || projection.schema !== 'atlas.symbol-toc-diagnostic-projection.v1'
    || projection.canonicalAuthority !== false || projection.evidenceAdmitted !== false || projection.published !== false
    || !input.key.trim()) {
    return { status: 'BLOCKED', reason: 'LOOKUP_INPUT_INVALID', candidateOrdinals: [], canonicalAuthority: false } as const;
  }

  const { diagnosticChecksum, ...payload } = projection;
  if (sha256(canonicalJson(payload)) !== diagnosticChecksum) {
    return { status: 'BLOCKED', reason: 'PROJECTION_CHECKSUM_MISMATCH', candidateOrdinals: [], canonicalAuthority: false } as const;
  }
  const table = projection.lookupTables[input.kind];
  if (!Array.isArray(table)) {
    return { status: 'BLOCKED', reason: 'LOOKUP_TABLE_UNAVAILABLE', candidateOrdinals: [], canonicalAuthority: false } as const;
  }
  const matches = table.filter((entry) => entry.key === input.key.trim());
  if (matches.length > 1 || matches.some((entry) => !Array.isArray(entry.values))) {
    return { status: 'BLOCKED', reason: 'LOOKUP_KEY_AMBIGUOUS_OR_INVALID', candidateOrdinals: [], canonicalAuthority: false } as const;
  }
  const values = matches[0]?.values ?? [];
  if (values.length > maxResults) {
    return { status: 'BLOCKED', reason: 'LOOKUP_RESULT_LIMIT_EXCEEDED', candidateOrdinals: [], canonicalAuthority: false } as const;
  }
  const candidateOrdinals = input.kind === 'candidateOrdinalToSymbolVersionIds'
    ? (values.length ? [Number(input.key.trim())] : [])
    : values.map(Number);
  if (candidateOrdinals.some((ordinal) => !Number.isSafeInteger(ordinal) || ordinal < 0)) {
    return { status: 'BLOCKED', reason: 'LOOKUP_ORDINAL_INVALID', candidateOrdinals: [], canonicalAuthority: false } as const;
  }
  return {
    status: values.length > 1 ? 'AMBIGUOUS_NOT_ADMITTED' as const
      : values.length === 1 ? 'MATCH_NOT_ADMITTED' as const : 'NOT_FOUND' as const,
    reason: null,
    candidateOrdinals,
    values,
    workspaceRevision: projection.workspaceRevision,
    candidateSnapshotRevision: projection.candidateSnapshotRevision,
    ordinalMapChecksum: projection.ordinalMapChecksum,
    diagnosticChecksum,
    canonicalAuthority: false as const,
    evidenceAdmitted: false as const,
    published: false as const,
  };
}

export function resolveSymbolTocCandidatesV1(input: {
  projection: SymbolTocDiagnosticProjectionV1;
  ordinalMap: unknown;
  kind: SymbolTocDiagnosticLookupKindV1;
  key: string;
  maxResults?: number;
}) {
  let ordinalMap: ReturnType<typeof candidateOrdinalMapV1Schema.parse>;
  try {
    ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
    assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  } catch {
    return { status: 'BLOCKED', reason: 'CANDIDATE_ORDINAL_MAP_INVALID', candidates: [], canonicalAuthority: false } as const;
  }

  const lookup = lookupSymbolTocDiagnosticV1(input);
  if (lookup.status === 'BLOCKED') {
    return { status: 'BLOCKED', reason: lookup.reason, candidates: [], canonicalAuthority: false } as const;
  }
  const projection = input.projection;
  if (ordinalMap.ordinalMapChecksum !== projection.ordinalMapChecksum
    || ordinalMap.workspaceRevision !== projection.workspaceRevision
    || ordinalMap.candidateSnapshotRevision !== projection.candidateSnapshotRevision) {
    return { status: 'BLOCKED', reason: 'CANDIDATE_SNAPSHOT_MISMATCH', candidates: [], canonicalAuthority: false } as const;
  }

  if (lookup.status === 'NOT_FOUND') {
    return { status: 'NOT_FOUND', reason: null, candidates: [], canonicalAuthority: false } as const;
  }

  const candidates = [];
  for (const candidateOrdinal of lookup.candidateOrdinals) {
    const candidate = ordinalMap.candidates[candidateOrdinal];
    if (!candidate || candidate.candidateOrdinal !== candidateOrdinal || !candidate.packetKey || !candidate.sourceRef) {
      return { status: 'BLOCKED', reason: 'CANDIDATE_IDENTITY_UNAVAILABLE', candidates: [], canonicalAuthority: false } as const;
    }
    const matchedRows = projection.rows.filter((row) => row.status === 'SOURCE_READBACK_MATCH_NOT_ADMITTED'
      && row.candidateOrdinal === candidateOrdinal
      && row.packetKey === candidate.packetKey
      && row.sourceRef === candidate.sourceRef
      && row.sourceRevision === candidate.sourceRevision
      && row.workspaceRevision === candidate.workspaceRevision);
    const queryRows = matchedRows.filter((row) => {
      if (input.kind === 'qualifiedNameToCandidateOrdinals') return row.qualifiedName === input.key.trim();
      if (input.kind === 'symbolVersionIdToCandidateOrdinals') return row.symbolVersionId === input.key.trim();
      if (input.kind === 'sourceRefToCandidateOrdinals') return row.sourceRef === input.key.trim();
      if (input.kind === 'candidateOrdinalToSymbolVersionIds') return lookup.values.includes(String(row.symbolVersionId));
      if (input.kind === 'documentationRevisionToCandidateOrdinals') {
        return projection.documentationLinks.some((link) => link.status === 'MATCHED'
          && link.documentationSourceRevision === input.key.trim()
          && link.candidateOrdinal === candidateOrdinal
          && link.symbolVersionId === row.symbolVersionId);
      }
      return false;
    });
    if (queryRows.length === 0) {
      return { status: 'BLOCKED', reason: 'SYMBOL_ROW_CANDIDATE_CROSSWALK_MISMATCH', candidates: [], canonicalAuthority: false } as const;
    }
    candidates.push({
      candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
      workspaceRevision: candidate.workspaceRevision,
      symbols: queryRows.map((row) => ({
        symbolVersionId: row.symbolVersionId,
        stableSymbolId: row.stableSymbolId,
        qualifiedName: row.qualifiedName,
        byteStart: row.byteStart,
        byteEnd: row.byteEnd,
        spanChecksum: row.spanChecksum,
      })),
    });
  }
  return {
    status: lookup.status === 'AMBIGUOUS_NOT_ADMITTED' ? 'AMBIGUOUS_CANDIDATES_NOT_ADMITTED' as const
      : 'CANDIDATE_ONLY_NOT_ADMITTED' as const,
    reason: null,
    candidates,
    workspaceRevision: projection.workspaceRevision,
    candidateSnapshotRevision: projection.candidateSnapshotRevision,
    ordinalMapChecksum: projection.ordinalMapChecksum,
    diagnosticChecksum: projection.diagnosticChecksum,
    canonicalAuthority: false as const,
    evidenceAdmitted: false as const,
    published: false as const,
  };
}

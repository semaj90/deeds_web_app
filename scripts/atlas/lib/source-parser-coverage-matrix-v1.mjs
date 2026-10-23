import crypto from 'node:crypto';
import path from 'node:path';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const countBy = (rows, key) => Object.fromEntries([...new Set(rows.map((row) => row[key]))].sort().map((value) => [value, rows.filter((row) => row[key] === value).length]));
const jsonl = (rows) => `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
const sortedCounts = (counts) => JSON.stringify(Object.fromEntries(Object.entries(counts ?? {}).sort(([left], [right]) => left.localeCompare(right))));
const reconcileCounts = (rows, key, expected) => {
  const actual = countBy(rows.map((row) => ({ value: row[key] })), 'value');
  return sortedCounts(Object.fromEntries([...new Set([...Object.keys(actual), ...Object.keys(expected ?? {})])]
    .map((name) => [name, actual[name] ?? 0]))) === sortedCounts(expected);
};

function verifyUniqueRows(rows, label) {
  if (!Array.isArray(rows)) throw new TypeError(`${label}_ROWS_INVALID`);
  const refs = rows.map((row) => row?.sourceRef);
  if (refs.some((sourceRef) => typeof sourceRef !== 'string' || !sourceRef)) throw new TypeError(`${label}_SOURCE_REF_INVALID`);
  if (new Set(refs).size !== refs.length) throw new Error(`${label}_DUPLICATE_SOURCE_REF`);
  return new Map(rows.map((row) => [row.sourceRef, row]));
}

export function buildSourceParserCoverageMatrixV1({ snapshot, admittedListText, routeReport, routeRows, lineageReport, lineageRows }) {
  if (!Array.isArray(snapshot?.sources)) throw new TypeError('SOURCE_SNAPSHOT_INVALID');
  if (typeof admittedListText !== 'string') throw new TypeError('ADMITTED_LIST_INVALID');
  const { receiptChecksum: routeChecksum, ...routeBody } = routeReport ?? {};
  if (routeBody.schema !== 'atlas.source-parser-route-census.v1'
    || routeChecksum !== `sha256:${sha256(JSON.stringify(routeBody))}`) throw new Error('ROUTE_RECEIPT_CHECKSUM_MISMATCH');
  if (routeBody.admittedListSha256 !== `sha256:${sha256(admittedListText)}`) throw new Error('ROUTE_ADMITTED_LIST_CHECKSUM_MISMATCH');
  if (routeBody.routeRows !== routeRows?.length || routeBody.routeRowsSha256 !== `sha256:${sha256(jsonl(routeRows ?? []))}`) {
    throw new Error('ROUTE_ROWS_CHECKSUM_MISMATCH');
  }
  const { reportSha256, ...lineageBody } = lineageReport ?? {};
  if (lineageBody.schema !== 'atlas.current-workspace-ast-lineage.v1'
    || reportSha256 !== sha256(`${JSON.stringify(lineageBody, null, 2)}\n`)) throw new Error('LINEAGE_REPORT_CHECKSUM_MISMATCH');
  if (lineageBody.rowExport?.rowCount !== lineageRows?.length
    || lineageBody.rowExport?.sha256 !== sha256(jsonl(lineageRows ?? []))) throw new Error('LINEAGE_ROWS_CHECKSUM_MISMATCH');
  if (lineageBody.mode !== 'READ_ONLY' || lineageBody.writesPerformed !== false || lineageBody.graphifyRun !== false) {
    throw new Error('LINEAGE_REPORT_NOT_READ_ONLY');
  }

  const admittedRefs = admittedListText.split(/\r?\n/).map((sourceRef) => sourceRef.trim()).filter(Boolean);
  const admittedSet = new Set(admittedRefs);
  if (admittedSet.size !== admittedRefs.length) throw new Error('ADMITTED_LIST_DUPLICATE_SOURCE_REF');
  const snapshotRows = snapshot.sources.filter((row) => row.repositoryId === 'repo:root');
  const snapshotByRef = new Map();
  for (const row of snapshotRows) {
    const sourceRef = row.repositoryRelativePath;
    if (typeof sourceRef !== 'string' || snapshotByRef.has(sourceRef)) throw new Error('SNAPSHOT_ROOT_SOURCE_IDENTITY_INVALID');
    snapshotByRef.set(sourceRef, row);
  }
  const routeByRef = verifyUniqueRows(routeRows, 'ROUTE');
  const lineageByRef = verifyUniqueRows(lineageRows, 'LINEAGE');
  if (!reconcileCounts(routeRows, 'status', routeBody.statusCounts)) {
    throw new Error('ROUTE_STATUS_TOTALS_MISMATCH');
  }
  if (!reconcileCounts(lineageRows, 'capabilityOutcome', lineageBody.capabilityCensus?.outcomes)) {
    throw new Error('LINEAGE_CAPABILITY_TOTALS_MISMATCH');
  }
  if (!reconcileCounts(lineageRows, 'lineageClass', lineageBody.classifications)) {
    throw new Error('LINEAGE_CLASS_TOTALS_MISMATCH');
  }
  const expectedRefs = new Set(snapshotByRef.keys());
  for (const [label, actual] of [['ADMITTED', admittedSet], ['ROUTE', new Set(routeByRef.keys())], ['LINEAGE', new Set(lineageByRef.keys())]]) {
    if (actual.size !== expectedRefs.size) throw new Error(`${label}_MEMBERSHIP_COUNT_MISMATCH`);
    for (const sourceRef of expectedRefs) if (!actual.has(sourceRef)) throw new Error(`${label}_MEMBERSHIP_MISSING:${sourceRef}`);
  }

  const rows = [...expectedRefs].sort().map((sourceRef) => {
    const source = snapshotByRef.get(sourceRef);
    const route = routeByRef.get(sourceRef);
    const lineage = lineageByRef.get(sourceRef);
    if (lineage.sourceRevision !== source.sourceRevision || lineage.sourceContentDigest !== source.contentDigest) {
      throw new Error(`SOURCE_REVISION_OR_DIGEST_MISMATCH:${sourceRef}`);
    }
    return {
      sourceRef,
      extension: path.extname(sourceRef).toLowerCase() || '(none)',
      sourceRevision: source.sourceRevision,
      sourceContentDigest: source.contentDigest,
      route: {
        status: route.status,
        reason: route.reason,
        parser: route.parser,
        documentKind: route.documentKind,
        language: route.language,
        authorityRevision: route.authorityRevision,
      },
      astEvidence: {
        lineageClass: lineage.lineageClass,
        capabilityOutcome: lineage.capabilityOutcome,
        capabilityReason: lineage.capabilityReason,
        observedAstRows: lineage.astRows,
      },
      parseFailureStatus: 'NOT_MEASURED_BY_LINEAGE_AUDIT',
      symbolResolutionStatus: 'NOT_JOINED_BY_LINEAGE_AUDIT',
    };
  });

  const routeCounts = countBy(rows.map((row) => ({ value: row.route.status })), 'value');
  const lineageCounts = countBy(rows.map((row) => ({ value: row.astEvidence.lineageClass })), 'value');
  const capabilityCounts = countBy(rows.map((row) => ({ value: row.astEvidence.capabilityOutcome })), 'value');
  const routeJsonl = jsonl(rows);
  return {
    schema: 'atlas.source-parser-coverage-matrix.v1',
    status: 'DERIVED_ADVISORY_EXACT_ROOT_MEMBERSHIP_JOIN',
    canonicalAuthority: false,
    sourceQualifiedAdmission: false,
    writesPerformed: false,
    scope: {
      repositoryId: 'repo:root',
      workspaceId: lineageBody.scope.workspaceId,
      workspaceRevision: lineageBody.scope.workspaceRevision,
      executionId: lineageBody.scope.executionId,
      sourceCount: rows.length,
      sourceMembershipChecksum: lineageBody.scope.v2MembershipChecksum,
      routeAuthorityRevision: routeBody.sidecar.authorityRevision,
      fullSnapshotSourceCount: snapshot.sources.length,
      nonRootSnapshotSourceCount: snapshot.sources.length - snapshotRows.length,
    },
    inputs: {
      routeReceiptChecksum: routeChecksum,
      admittedListSha256: routeBody.admittedListSha256,
      lineageReportSha256: reportSha256,
      snapshotRevision: snapshot.snapshotRevision,
      snapshotStatus: snapshot.status,
      routeRows: routeRows.length,
      lineageRows: lineageRows.length,
      exactMembershipParity: true,
      exactSourceRevisionAndDigestParity: true,
    },
    totals: {
      sources: rows.length,
      byRouteStatus: routeCounts,
      byLineageClass: lineageCounts,
      byCapabilityOutcome: capabilityCounts,
      byExtension: Object.fromEntries([...new Set(rows.map((row) => row.extension))].sort().map((extension) => [extension, {
        total: rows.filter((row) => row.extension === extension).length,
        routes: countBy(rows.filter((row) => row.extension === extension).map((row) => ({ value: row.route.status })), 'value'),
        astEvidence: countBy(rows.filter((row) => row.extension === extension).map((row) => ({ value: row.astEvidence.capabilityOutcome })), 'value'),
      }])),
    },
    rows,
    rowsSha256: sha256(routeJsonl),
    limitations: [
      'ROUTED means a parser route exists; it does not prove that extraction ran or succeeded.',
      'The lineage audit did not consult a parse-failure ledger or resolve symbols.',
      'This joins only the 24,456 root-repository references; 1,086 sources in six nested repositories have no matching root AST audit rows.',
      'The source snapshot is CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK and canonicalAuthority=false.',
    ],
  };
}

export function sourceParserCoverageMatrixChecksumV1(matrix) {
  const { receiptSha256, ...body } = matrix;
  return sha256(JSON.stringify(body));
}

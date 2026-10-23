import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  buildSourceParserCoverageMatrixV1,
  sourceParserCoverageMatrixChecksumV1,
} from './source-parser-coverage-matrix-v1.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function createInput() {
  const sourceRows = [
    { repositoryId: 'repo:root', repositoryRelativePath: 'src/main.ts', sourceRevision: 'sha256:aaa', contentDigest: 'aaa' },
    { repositoryId: 'repo:root', repositoryRelativePath: 'docs/guide.md', sourceRevision: 'sha256:bbb', contentDigest: 'bbb' },
    { repositoryId: 'repo:package', repositoryRelativePath: 'src/lib.rs', sourceRevision: 'sha256:ccc', contentDigest: 'ccc' },
  ];
  const admittedListText = 'src/main.ts\ndocs/guide.md\n';
  const routeBody = {
    schema: 'atlas.source-parser-route-census.v1',
    admittedListSha256: `sha256:${sha256(admittedListText)}`,
    denominator: 2,
    sidecar: { authorityRevision: 'sha256:authority' },
    statusCounts: { ROUTED: 2 },
  };
  const lineageBody = {
    schema: 'atlas.current-workspace-ast-lineage.v1',
    mode: 'READ_ONLY',
    writesPerformed: false,
    graphifyRun: false,
    scope: { workspaceId: 'w1', workspaceRevision: 'sha256:workspace', executionId: '00000000-0000-4000-8000-000000000001', v2MembershipChecksum: 'sha256:membership' },
    classifications: { AST_EVIDENCE_ABSENT: 1, AST_REVISION_QUALIFIED: 1 },
    capabilityCensus: { outcomes: { NOT_AST_ELIGIBLE: 1, REVISION_QUALIFIED_AST: 1 } },
  };
  const lineageReport = { ...lineageBody, reportSha256: sha256(`${JSON.stringify(lineageBody, null, 2)}\n`) };
  const routeRows = [
    { sourceRef: 'src/main.ts', status: 'ROUTED', extension: '.ts', parser: 'sidecar-ast-chunk', language: 'typescript', authorityRevision: 'sha256:authority' },
    { sourceRef: 'docs/guide.md', status: 'ROUTED', extension: '.md', parser: 'markdown', documentKind: 'markdown', language: null, authorityRevision: null },
  ];
  const lineageRows = [
    { sourceRef: 'docs/guide.md', sourceRevision: 'sha256:bbb', sourceContentDigest: 'bbb', astRows: 0, lineageClass: 'AST_EVIDENCE_ABSENT', capabilityOutcome: 'NOT_AST_ELIGIBLE', capabilityReason: 'NON_CODE_EXTENSION_md', language: null },
    { sourceRef: 'src/main.ts', sourceRevision: 'sha256:aaa', sourceContentDigest: 'aaa', astRows: 2, lineageClass: 'AST_REVISION_QUALIFIED', capabilityOutcome: 'REVISION_QUALIFIED_AST', capabilityReason: null, language: 'typescript' },
  ];
  const routeRowsJsonl = `${routeRows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  routeBody.routeRows = routeRows.length;
  routeBody.routeRowsSha256 = `sha256:${sha256(routeRowsJsonl)}`;
  const updatedRouteReport = { ...routeBody, receiptChecksum: `sha256:${sha256(JSON.stringify(routeBody))}` };
  const lineageRowsJsonl = `${lineageRows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  lineageBody.rowExport = { rowCount: lineageRows.length, sha256: sha256(lineageRowsJsonl) };
  const updatedLineageReport = { ...lineageBody, reportSha256: sha256(`${JSON.stringify(lineageBody, null, 2)}\n`) };
  return {
    snapshot: { sources: sourceRows, snapshotRevision: 'sha256:snapshot', status: 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK', canonicalAuthority: false },
    admittedListText,
    routeReport: updatedRouteReport,
    routeRows,
    lineageReport: updatedLineageReport,
    lineageRows,
  };
}

test('builds a deterministic per-source matrix only for exact root membership', () => {
  const input = createInput();
  const first = buildSourceParserCoverageMatrixV1(input);
  const second = buildSourceParserCoverageMatrixV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(first.rows.map((row) => row.sourceRef), ['docs/guide.md', 'src/main.ts']);
  assert.equal(first.scope.sourceCount, 2);
  assert.equal(first.scope.nonRootSnapshotSourceCount, 1);
  assert.equal(first.rows[1].sourceRevision, 'sha256:aaa');
  assert.equal(first.rows[1].route.authorityRevision, 'sha256:authority');
  assert.equal(first.rows[0].parseFailureStatus, 'NOT_MEASURED_BY_LINEAGE_AUDIT');
  assert.equal(first.rows[0].symbolResolutionStatus, 'NOT_JOINED_BY_LINEAGE_AUDIT');
  assert.equal(first.canonicalAuthority, false);
  assert.equal(sourceParserCoverageMatrixChecksumV1(first), sourceParserCoverageMatrixChecksumV1(second));
});

test('rejects a missing or duplicate source reference at any join boundary', () => {
  const missing = createInput();
  missing.routeRows.pop();
  assert.throws(() => buildSourceParserCoverageMatrixV1(missing), /ROUTE_ROWS_CHECKSUM_MISMATCH/);

  const duplicate = createInput();
  duplicate.lineageRows.push({ ...duplicate.lineageRows[0] });
  const duplicateRowsText = `${duplicate.lineageRows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  duplicate.lineageReport.rowExport.rowCount = duplicate.lineageRows.length;
  duplicate.lineageReport.rowExport.sha256 = sha256(duplicateRowsText);
  const { reportSha256: _previousHash, ...duplicateBody } = duplicate.lineageReport;
  duplicate.lineageReport.reportSha256 = sha256(`${JSON.stringify(duplicateBody, null, 2)}\n`);
  assert.throws(() => buildSourceParserCoverageMatrixV1(duplicate), /LINEAGE_DUPLICATE_SOURCE_REF/);
});

test('rejects revision, digest, and input-receipt checksum mismatches', () => {
  const revisionMismatch = createInput();
  revisionMismatch.lineageRows[1].sourceRevision = 'sha256:stale';
  const revisionRows = `${revisionMismatch.lineageRows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  revisionMismatch.lineageReport.rowExport.sha256 = sha256(revisionRows);
  const { reportSha256: _oldRevisionHash, ...revisionBody } = revisionMismatch.lineageReport;
  revisionMismatch.lineageReport.reportSha256 = sha256(`${JSON.stringify(revisionBody, null, 2)}\n`);
  assert.throws(() => buildSourceParserCoverageMatrixV1(revisionMismatch), /SOURCE_REVISION_OR_DIGEST_MISMATCH/);

  const routeMismatch = createInput();
  routeMismatch.routeReport.admittedListSha256 = 'sha256:wrong';
  assert.throws(() => buildSourceParserCoverageMatrixV1(routeMismatch), /ROUTE_RECEIPT_CHECKSUM_MISMATCH/);

  const lineageMismatch = createInput();
  lineageMismatch.lineageReport.reportSha256 = 'wrong';
  assert.throws(() => buildSourceParserCoverageMatrixV1(lineageMismatch), /LINEAGE_REPORT_CHECKSUM_MISMATCH/);
});

test('rejects duplicate admitted paths instead of silently deduplicating', () => {
  const input = createInput();
  input.admittedListText += 'src/main.ts\n';
  input.routeReport.admittedListSha256 = `sha256:${sha256(input.admittedListText)}`;
  const { receiptChecksum, ...routeBody } = input.routeReport;
  input.routeReport.receiptChecksum = `sha256:${sha256(JSON.stringify(routeBody))}`;
  assert.throws(() => buildSourceParserCoverageMatrixV1(input), /ADMITTED_LIST_DUPLICATE_SOURCE_REF/);
});

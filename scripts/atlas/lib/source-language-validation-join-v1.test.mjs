import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { buildSourceLanguageValidationJoinV1, verifySourceLanguageValidationJoinV1 } from './source-language-validation-join-v1.mjs';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonical = (value) => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;

function input({ duplicateProfile = false, unknownExtension = false } = {}) {
  const sourceRows = [
    { sourceRef: 'src/a.ts', extension: '.ts', sourceRevision: 'sha256:a', sourceContentDigest: 'a', route: { status: 'ROUTED', language: 'typescript' }, astEvidence: { capabilityOutcome: 'REVISION_QUALIFIED_AST', lineageClass: 'AST_REVISION_QUALIFIED' } },
    ...(unknownExtension ? [{ sourceRef: 'src/b.h', extension: '.h', sourceRevision: 'sha256:b', sourceContentDigest: 'b', route: { status: 'NO_PARSER_RULE', language: null }, astEvidence: { capabilityOutcome: 'ELIGIBLE_PARSER_UNAVAILABLE', lineageClass: 'AST_EVIDENCE_ABSENT' } }] : []),
  ];
  const matrixBody = { schema: 'atlas.source-parser-coverage-matrix.v1', canonicalAuthority: false, writesPerformed: false, scope: { sourceCount: sourceRows.length, workspaceRevision: 'sha256:w', executionId: 'run', sourceMembershipChecksum: 'sha256:m' }, rows: sourceRows, rowsSha256: sha(`${sourceRows.map((row) => JSON.stringify(row)).join('\n')}\n`) };
  const sourceMatrix = { ...matrixBody, receiptSha256: sha(JSON.stringify(matrixBody)) };
  const manifestBody = { outputs: { matrix: { receiptSha256: sourceMatrix.receiptSha256 }, rows: { sha256: sourceMatrix.rowsSha256 } }, scope: { sourceCount: sourceRows.length } };
  const sourceMatrixManifest = { ...manifestBody, manifestSha256: sha(JSON.stringify(manifestBody)) };
  const languageRows = [{ languageId: 'typescript', extensions: ['.ts'], fileCountInCorpus: 100, parserCandidateFiles: 50, dotPathAuditOnlyFiles: 10, grammarCatalogMatch: 'typescript', grammarAvailability: 'CATALOG_CANDIDATE_NOT_RUNTIME_PROOF', profileEvidence: [{ profile: 'typescript.yaml', languageId: 'typescript', sha256: 'p' }], parserOwnerStatus: 'NOT_JOINED_TO_INVENTORY', compilerLspStatus: 'NOT_JOINED_TO_RUN_EVIDENCE' }];
  if (duplicateProfile) languageRows.push({ ...languageRows[0], languageId: 'other', extensions: ['.ts'] });
  const invBody = { schema: 'atlas.language-coverage-inventory.v2', canonicalAuthority: false, writesPerformed: false, languageMatrix: languageRows };
  const languageInventory = { ...invBody, inventorySha256: sha(canonical(invBody)) };
  const sampleBody = { schema: 'atlas.frozen-source-parser-sample.v2', canonicalAuthority: false, sourceQualifiedAdmission: false, writesPerformed: false, samples: [{ extension: '.ts', sourceRef: 'src/a.ts', sourceRevision: 'sha256:a', contentSha256: 'a', status: 'PARSE_COMPLETE_SPANS_VALID' }] };
  const parserSample = { ...sampleBody, receiptSha256: sha(canonical(sampleBody)) };
  return { languageInventory, sourceMatrix, sourceMatrixManifest, parserSample };
}

test('joins existing language profiles to exact root route and AST evidence', () => {
  const result = buildSourceLanguageValidationJoinV1(input());
  assert.equal(result.totals.rootSources, 1);
  assert.equal(result.languages[0].rootSourceCohort.sourceCount, 1);
  assert.equal(result.languages[0].liveParserSample.outcomes.PARSE_COMPLETE_SPANS_VALID, 1);
  assert.equal(result.languages[0].grammar.availabilityStatus, 'CATALOG_CANDIDATE_NOT_RUNTIME_PROOF');
  assert.equal(result.languages[0].compilerLspStatus, 'NOT_JOINED_TO_RUN_EVIDENCE');
});

test('keeps profile ambiguity and unknown extensions unassigned', () => {
  const result = buildSourceLanguageValidationJoinV1(input({ duplicateProfile: true, unknownExtension: true }));
  assert.equal(result.totals.ambiguousProfileRootSources, 1);
  assert.equal(result.totals.unmappedProfileRootSources, 1);
  assert.equal(result.languages.find((row) => row.languageId === 'typescript').rootSourceCohort.sourceCount, 0);
  assert.equal(result.rootExtensions.find((row) => row.extension === '.h').mappingStatus, 'UNMAPPED_PROFILE');
  assert.equal(result.rootExtensions.find((row) => row.extension === '.ts').mappingStatus, 'AMBIGUOUS_PROFILE');
});

test('rejects stale sample revisions and invalid input checksums', () => {
  const stale = input();
  stale.parserSample.samples[0].sourceRevision = 'sha256:stale';
  const { receiptSha256: _oldDigest, ...sampleBody } = stale.parserSample;
  stale.parserSample.receiptSha256 = sha(canonical(sampleBody));
  assert.throws(() => buildSourceLanguageValidationJoinV1(stale), /PARSER_SAMPLE_SOURCE_BINDING_MISMATCH/);

  const invalid = input();
  invalid.languageInventory.inventorySha256 = 'invalid';
  assert.throws(() => buildSourceLanguageValidationJoinV1(invalid), /LANGUAGE_INVENTORY_CHECKSUM_OR_AUTHORITY_INVALID/);
});

test('verifies the deterministic output digest and detects tampering', () => {
  const result = buildSourceLanguageValidationJoinV1(input());
  const { joinSha256, ...body } = result;
  const digest = sha(canonical(body));
  assert.equal(result.joinSha256, digest);
  assert.equal(verifySourceLanguageValidationJoinV1(result), true);
  result.totals.rootSources += 1;
  assert.throws(() => verifySourceLanguageValidationJoinV1(result), /SOURCE_LANGUAGE_JOIN_CHECKSUM_INVALID/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDomainVocabularyCrosswalkCensusV2,
  buildDomainVocabularyCrosswalkReceiptV2,
  parseCodeTaxonomySourceV1,
  sha256CanonicalDomainCrosswalkV2,
  verifyDomainVocabularyCrosswalkReceiptV2,
} from './domain-vocabulary-crosswalk-census-v2.mjs';

const codeTaxonomy = {
  canonicalDomains: ['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml'],
  aliases: { auth: 'auth', frontend: 'ui', api: 'network', general: null },
};
const sourceArtifacts = {
  okfTaxonomy: { path: '.okf/domains/atlas-domain-taxonomy.yaml', sha256: `sha256:${'1'.repeat(64)}` },
  codeTaxonomy: { path: 'domain-taxonomy.ts', sha256: `sha256:${'2'.repeat(64)}` },
  featureProposal: { path: 'domain-crosswalk-proposal-v1.json', sha256: `sha256:${'3'.repeat(64)}` },
};

const fixture = () => buildDomainVocabularyCrosswalkCensusV2({
  database: 'fixture_db',
  serverVersion: '18.4',
  okfGroupIds: ['api', 'graph'],
  crosswalkRows: [
    { chunk_domain: 'Graph', feat_domain_class: 'UI', taxonomy_slug: 'api' },
    { chunk_domain: 'backend', feat_domain_class: 'Graph', taxonomy_slug: 'graph' },
  ],
  packetLabelRows: [{ label: 'cluster.summary', rowCount: 2 }, { label: 'Graph', rowCount: 4 }],
  featureProposalRows: [
    { legacy: 'Graph', status: 'CASE_NORMALIZED' },
    { legacy: 'UI', status: 'PROPOSED_NEEDS_REVIEW' },
  ],
  codeTaxonomy,
  sourceArtifacts,
});

test('counts vocabulary coverage without turning exact slug matches into semantic admission', () => {
  const census = fixture();
  assert.deepEqual(census.vocabularies.packet.exactCaseFoldedSlugMatches, ['Graph']);
  assert.deepEqual(census.vocabularies.codeChunk.exactCaseFoldedSlugMatches, ['Graph']);
  assert.deepEqual(census.packetOnlyLabelsComparedWithFeatureDomain, ['cluster.summary']);
  assert.deepEqual(census.codeTaxonomy.exactOkfGroupIdMatches, ['graph']);
  assert.deepEqual(census.codeTaxonomy.canonicalDomainsWithoutExactOkfGroupId, ['agent', 'auth', 'cache', 'database', 'ml', 'network', 'retrieval', 'ui']);
  assert.equal(census.codeTaxonomy.legacyAliases.find((row) => row.alias === 'api').disposition, 'REVIEW_REQUIRED');
  assert.equal(census.codeTaxonomy.legacyAliases.find((row) => row.alias === 'api').exactOkfGroupId, true);
  assert.equal(census.codeTaxonomy.legacyAliases.find((row) => row.alias === 'general').disposition, 'FALLBACK_NOT_DOMAIN');
  assert.deepEqual(census.featureProposal.currentLabelsMissingFromProposal, []);
  assert.equal(census.semanticCrosswalk, 'REVIEW_REQUIRED');
  assert.equal(census.mappingsApplied, false);
  assert.equal(census.persistentWrites, 0);
});

test('rejects duplicate packet labels and invalid taxonomy ids', () => {
  assert.throws(() => buildDomainVocabularyCrosswalkCensusV2({
    ...{
      database: 'fixture_db', serverVersion: '18.4', okfGroupIds: ['api'],
      crosswalkRows: [{ taxonomy_slug: 'api' }],
      packetLabelRows: [{ label: 'api', rowCount: 1 }, { label: 'api', rowCount: 2 }],
      featureProposalRows: [],
      codeTaxonomy,
      sourceArtifacts,
    },
  }), /PACKET_DOMAIN_LABEL_DUPLICATE/);
  assert.throws(() => buildDomainVocabularyCrosswalkCensusV2({
    database: 'fixture_db', serverVersion: '18.4', okfGroupIds: ['api', 'api'],
    crosswalkRows: [{ taxonomy_slug: 'api' }], packetLabelRows: [], featureProposalRows: [], codeTaxonomy, sourceArtifacts,
  }), /OKF_GROUP_ID_DUPLICATE/);
});

test('receipt readback detects tampering and preserves diagnostic-only authority', () => {
  const receipt = buildDomainVocabularyCrosswalkReceiptV2({
    census: fixture(),
    sourceRowsDigestSha256: `sha256:${'a'.repeat(64)}`,
    capturedAt: '2026-10-23T00:00:00.000Z',
    runId: 'fixture-run',
  });
  assert.equal(verifyDomainVocabularyCrosswalkReceiptV2(receipt), true);
  assert.throws(() => verifyDomainVocabularyCrosswalkReceiptV2({ ...receipt, mappingsApplied: true }), /CONTRACT_INVALID/);
  assert.throws(() => verifyDomainVocabularyCrosswalkReceiptV2({ ...receipt, database: 'tampered' }), /CHECKSUM_MISMATCH/);
});

test('allows repeated taxonomy join rows and counts unclassified packet rows explicitly', () => {
  const census = buildDomainVocabularyCrosswalkCensusV2({
    database: 'fixture_db',
    serverVersion: '18.4',
    okfGroupIds: ['api'],
    crosswalkRows: [
      { chunk_domain: 'api', feat_domain_class: 'api', taxonomy_slug: 'api' },
      { chunk_domain: 'api', feat_domain_class: 'api', taxonomy_slug: 'api' },
    ],
    packetLabelRows: [{ label: null, rowCount: 3 }, { label: 'api', rowCount: 2 }],
    featureProposalRows: [{ legacy: 'api', status: 'EXACT' }],
    codeTaxonomy,
    sourceArtifacts,
  });
  assert.equal(census.taxonomySlugs.length, 1);
  assert.equal(census.packetUnclassifiedRowCount, 3);
  assert.equal(census.packetRowCount, 5);
});

test('requires valid source-file digests for every census receipt', () => {
  assert.throws(() => buildDomainVocabularyCrosswalkCensusV2({
    database: 'fixture_db', serverVersion: '18.4', okfGroupIds: ['api'],
    crosswalkRows: [{ taxonomy_slug: 'api' }], packetLabelRows: [], featureProposalRows: [], codeTaxonomy,
    sourceArtifacts: { codeTaxonomy: { path: 'domain-taxonomy.ts', sha256: 'not-a-digest' } },
  }), /DOMAIN_CROSSWALK_SOURCE_ARTIFACT_INVALID/);
  const receipt = buildDomainVocabularyCrosswalkReceiptV2({
    census: fixture(), sourceRowsDigestSha256: `sha256:${'a'.repeat(64)}`,
    capturedAt: '2026-10-23T00:00:00.000Z', runId: 'fixture-source-digest-run',
  });
  const { checksumSha256, ...body } = receipt;
  const forged = { ...body, sourceArtifacts: { ...body.sourceArtifacts, codeTaxonomy: { path: 'domain-taxonomy.ts', sha256: 'bad' } } };
  assert.throws(() => verifyDomainVocabularyCrosswalkReceiptV2({ ...forged, checksumSha256: sha256CanonicalDomainCrosswalkV2(forged) }), /SOURCE_ARTIFACT_INVALID/);
});

test('parses the classifier-owned literal domain IDs and aliases without importing or executing it', () => {
  const parsed = parseCodeTaxonomySourceV1(`export const CANONICAL_DOMAINS = ['auth', 'network'] as const;\nconst LEGACY_DOMAIN_ALIASES: Record<string, CanonicalDomain | null> = {\n  api: 'network',\n  general: null,\n};`);
  assert.deepEqual(parsed, { canonicalDomains: ['auth', 'network'], aliases: { api: 'network', general: null } });
  assert.throws(() => parseCodeTaxonomySourceV1('export const CANONICAL_DOMAINS = [];'), /SOURCE_SHAPE_UNSUPPORTED/);
});

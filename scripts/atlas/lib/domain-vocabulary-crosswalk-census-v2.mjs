import { createHash } from 'node:crypto';

export const DOMAIN_VOCABULARY_CROSSWALK_CENSUS_SCHEMA_V2 = 'atlas.domain-vocabulary-crosswalk-census.v2';
const SOURCE_ARTIFACT_KEYS = ['codeTaxonomy', 'featureProposal', 'okfTaxonomy'];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function sha256CanonicalDomainCrosswalkV2(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

export function parseCodeTaxonomySourceV1(source) {
  if (typeof source !== 'string' || !source) throw new Error('CODE_TAXONOMY_SOURCE_REQUIRED');
  const domainsMatch = source.match(/export\s+const\s+CANONICAL_DOMAINS\s*=\s*\[([\s\S]*?)\]\s*as\s+const\s*;/);
  const aliasesMatch = source.match(/const\s+LEGACY_DOMAIN_ALIASES\s*:\s*Record<string,\s*CanonicalDomain\s*\|\s*null>\s*=\s*\{([\s\S]*?)\n\};/);
  if (!domainsMatch || !aliasesMatch) throw new Error('CODE_TAXONOMY_SOURCE_SHAPE_UNSUPPORTED');
  const canonicalDomains = [...domainsMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const aliases = Object.fromEntries([...aliasesMatch[1].matchAll(/^\s*([a-zA-Z0-9_]+):\s*(?:'([^']+)'|(null)),?\s*$/gm)]
    .map(([, key, domain, isNull]) => [key, isNull ? null : domain]));
  if (!canonicalDomains.length || !Object.keys(aliases).length) throw new Error('CODE_TAXONOMY_SOURCE_EMPTY');
  return { canonicalDomains, aliases };
}

function uniqueLabels(values, field) {
  if (!Array.isArray(values)) throw new Error(`${field}_ARRAY_REQUIRED`);
  const labels = values.filter((value) => value !== null && value !== undefined);
  if (labels.some((value) => typeof value !== 'string' || value.length === 0)) throw new Error(`${field}_LABEL_INVALID`);
  return [...new Set(labels)].sort();
}

function exactMatches(labels, slugs) {
  const normalizedSlugs = new Set(slugs.map((slug) => slug.toLocaleLowerCase('en-US')));
  return labels.filter((label) => normalizedSlugs.has(label.toLocaleLowerCase('en-US')));
}

function validateSourceArtifacts(sourceArtifacts) {
  const keys = Object.keys(sourceArtifacts ?? {}).sort();
  if (JSON.stringify(keys) !== JSON.stringify(SOURCE_ARTIFACT_KEYS)) throw new Error('DOMAIN_CROSSWALK_SOURCE_ARTIFACT_INVALID');
  for (const [key, artifact] of Object.entries(sourceArtifacts)) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(key) || !artifact || typeof artifact.path !== 'string' || !artifact.path
      || !/^sha256:[0-9a-f]{64}$/.test(artifact.sha256 ?? '')) throw new Error('DOMAIN_CROSSWALK_SOURCE_ARTIFACT_INVALID');
  }
  return Object.fromEntries(Object.entries(sourceArtifacts).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, artifact]) => [key, { path: artifact.path, sha256: artifact.sha256 }]));
}

export function buildDomainVocabularyCrosswalkCensusV2(input) {
  const { crosswalkRows, packetLabelRows, okfGroupIds, featureProposalRows, codeTaxonomy, sourceArtifacts } = input ?? {};
  if (!Array.isArray(crosswalkRows) || !Array.isArray(packetLabelRows) || !Array.isArray(okfGroupIds) || !Array.isArray(featureProposalRows)
    || !Array.isArray(codeTaxonomy?.canonicalDomains) || !codeTaxonomy?.aliases || typeof codeTaxonomy.aliases !== 'object'
    || !sourceArtifacts || typeof sourceArtifacts !== 'object') {
    throw new Error('DOMAIN_CROSSWALK_INPUT_ARRAYS_REQUIRED');
  }

  const packetLabels = packetLabelRows.map((row) => {
    if (!row || (row.label !== null && (typeof row.label !== 'string' || !row.label))
      || !Number.isSafeInteger(Number(row.rowCount)) || Number(row.rowCount) < 1) {
      throw new Error('PACKET_DOMAIN_LABEL_ROW_INVALID');
    }
    return { label: row.label, rowCount: Number(row.rowCount) };
  }).sort((left, right) => String(left.label ?? '').localeCompare(String(right.label ?? '')));
  if (new Set(packetLabels.map((row) => row.label)).size !== packetLabels.length) throw new Error('PACKET_DOMAIN_LABEL_DUPLICATE');

  const groupIds = uniqueLabels(okfGroupIds, 'OKF_GROUP_ID');
  const taxonomySlugs = uniqueLabels(crosswalkRows.map((row) => row.taxonomy_slug), 'TAXONOMY_SLUG');
  const chunkLabels = uniqueLabels(crosswalkRows.map((row) => row.chunk_domain), 'CHUNK_DOMAIN');
  const featureLabels = uniqueLabels(crosswalkRows.map((row) => row.feat_domain_class), 'FEATURE_DOMAIN');
  const proposalLabels = uniqueLabels(featureProposalRows.map((row) => row.legacy), 'FEATURE_PROPOSAL');
  const codeDomainIds = uniqueLabels(codeTaxonomy.canonicalDomains, 'CODE_DOMAIN');
  const verifiedSourceArtifacts = validateSourceArtifacts(sourceArtifacts);
  if (new Set(okfGroupIds).size !== okfGroupIds.length) throw new Error('OKF_GROUP_ID_DUPLICATE');
  const aliasRows = Object.entries(codeTaxonomy.aliases).sort(([left], [right]) => left.localeCompare(right)).map(([alias, domain]) => {
    if (typeof domain !== 'string' && domain !== null) throw new Error('CODE_DOMAIN_ALIAS_TARGET_INVALID');
    return {
      alias,
      codeDomain: domain,
      exactOkfGroupId: groupIds.includes(alias),
      disposition: domain === null ? 'FALLBACK_NOT_DOMAIN' : 'REVIEW_REQUIRED',
    };
  });

  const vocabulary = (labels) => {
    const exactCaseFoldedSlugMatches = exactMatches(labels, taxonomySlugs);
    return {
      labelCount: labels.length,
      labels,
      exactCaseFoldedSlugMatches,
      labelsWithoutExactSlug: labels.filter((label) => !exactCaseFoldedSlugMatches.includes(label)),
    };
  };
  const featureProposal = {
    proposalLabelCount: proposalLabels.length,
    currentLabelCount: featureLabels.length,
    currentLabelsMissingFromProposal: featureLabels.filter((label) => !proposalLabels.includes(label)),
    proposalLabelsAbsentFromCurrent: proposalLabels.filter((label) => !featureLabels.includes(label)),
    statuses: Object.fromEntries(featureProposalRows.map((row) => [row.legacy, row.status]).sort(([left], [right]) => left.localeCompare(right))),
  };

  return {
    schema: DOMAIN_VOCABULARY_CROSSWALK_CENSUS_SCHEMA_V2,
    mode: 'READ_ONLY',
    database: input.database,
    serverVersion: input.serverVersion,
    sourceTables: ['public.atlas_packets', 'public.codebase_chunk_index', 'public.domain_taxonomy_v1', 'public.feature_domain'],
    sourceArtifacts: verifiedSourceArtifacts,
    legacyJoinRows: crosswalkRows,
    okfGroupIds: groupIds,
    taxonomySlugs,
    taxonomyIdentitySetsMatch: JSON.stringify(groupIds) === JSON.stringify(taxonomySlugs),
    codeTaxonomy: {
      canonicalDomainIds: codeDomainIds,
      exactOkfGroupIdMatches: exactMatches(codeDomainIds, groupIds),
      canonicalDomainsWithoutExactOkfGroupId: codeDomainIds.filter((domain) => !groupIds.includes(domain)),
      legacyAliases: aliasRows,
    },
    vocabularies: {
      packet: vocabulary(packetLabels.map((row) => row.label).filter((label) => label !== null)),
      codeChunk: vocabulary(chunkLabels),
      featureDomain: vocabulary(featureLabels),
    },
    packetRowCount: packetLabels.reduce((sum, row) => sum + row.rowCount, 0),
    packetUnclassifiedRowCount: packetLabels.filter((row) => row.label === null).reduce((sum, row) => sum + row.rowCount, 0),
    packetRowsByLabel: packetLabels,
    featureProposal,
    packetOnlyLabelsComparedWithFeatureDomain: packetLabels.map((row) => row.label).filter((label) => label !== null && !featureLabels.includes(label)),
    featureOnlyLabelsComparedWithPackets: featureLabels.filter((label) => !packetLabels.some((row) => row.label === label)),
    matchingPolicy: 'CASE_FOLDED_EXACT_SLUG_ONLY;SEMANTIC_RELATIONS_NOT_INFERRED',
    semanticCrosswalk: 'REVIEW_REQUIRED',
    mappingsApplied: false,
    canonicalAuthority: false,
    persistentWrites: 0,
  };
}

export function buildDomainVocabularyCrosswalkReceiptV2(input) {
  const { census, sourceRowsDigestSha256, capturedAt, runId } = input ?? {};
  if (!census || census.schema !== DOMAIN_VOCABULARY_CROSSWALK_CENSUS_SCHEMA_V2
    || !/^sha256:[0-9a-f]{64}$/.test(sourceRowsDigestSha256 ?? '')
    || typeof capturedAt !== 'string' || !capturedAt
    || typeof runId !== 'string' || !runId) {
    throw new Error('DOMAIN_CROSSWALK_RECEIPT_INPUT_INVALID');
  }
  const body = { ...census, capturedAt, runId, sourceRowsDigestSha256 };
  return { ...body, checksumSha256: sha256CanonicalDomainCrosswalkV2(body) };
}

export function verifyDomainVocabularyCrosswalkReceiptV2(receipt) {
  if (!receipt || receipt.schema !== DOMAIN_VOCABULARY_CROSSWALK_CENSUS_SCHEMA_V2
    || receipt.mode !== 'READ_ONLY' || receipt.mappingsApplied !== false
    || receipt.canonicalAuthority !== false || receipt.persistentWrites !== 0) {
    throw new Error('DOMAIN_CROSSWALK_RECEIPT_CONTRACT_INVALID');
  }
  if (receipt.sourceArtifacts !== undefined) validateSourceArtifacts(receipt.sourceArtifacts);
  const { checksumSha256, ...body } = receipt;
  if (checksumSha256 !== sha256CanonicalDomainCrosswalkV2(body)) throw new Error('DOMAIN_CROSSWALK_RECEIPT_CHECKSUM_MISMATCH');
  return true;
}

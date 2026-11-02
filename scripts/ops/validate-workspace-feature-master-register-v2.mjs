import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const registerPath = path.join(repositoryRoot, 'docs/reports/workspace-feature-master-register-v2-2026-11-02.json');
const censusPath = path.join(repositoryRoot, '.tmp/atlas/feature-taxonomy-vector-census-readonly-v1.json');
const registryInputs = {
	root: path.join(repositoryRoot, 'docs/atlas/feature-registry.json'),
	frontend: path.join(repositoryRoot, 'sveltekit-frontend/docs/atlas/feature-registry.json')
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const parseJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));
const register = parseJson(registerPath);
const census = parseJson(censusPath);
const failures = [];

function requireCondition(condition, code) {
	if (!condition) failures.push(code);
}

requireCondition(register.schema === 'atlas.workspace-feature-master-register.v2', 'REGISTER_SCHEMA_INVALID');
requireCondition(register.readOnly === true && register.writesPerformed === false, 'REGISTER_WRITE_BOUNDARY_INVALID');
requireCondition(register.canonicalAuthority === false, 'REGISTER_CANONICAL_AUTHORITY_MUST_BE_FALSE');
requireCondition(census.schema === 'atlas.feature-taxonomy-vector-census-readonly.v1', 'CENSUS_SCHEMA_INVALID');
requireCondition(census.readOnly === true && census.writesPerformed === false, 'CENSUS_WRITE_BOUNDARY_INVALID');
requireCondition(census.data?.database === 'legal_ai_db', 'CENSUS_DATABASE_IDENTITY_INVALID');
requireCondition(census.data?.serverVersion?.startsWith('18.'), 'CENSUS_POSTGRES_VERSION_INVALID');
requireCondition(census.data?.vectorExtension === '0.8.3', 'CENSUS_PGVECTOR_VERSION_INVALID');

for (const [name, filePath] of Object.entries(registryInputs)) {
	const actual = digest(readFileSync(filePath));
	requireCondition(actual === register.sourceRegistrySha256?.[name], `SOURCE_REGISTRY_HASH_MISMATCH:${name}`);
}

const rootRows = parseJson(registryInputs.root);
const frontendRows = parseJson(registryInputs.frontend);
const sourceMaps = [rootRows, frontendRows].map((rows, index) => {
	const map = new Map();
	for (const row of rows) {
		if (!row || typeof row.featureKey !== 'string' || map.has(row.featureKey)) {
			failures.push(`SOURCE_REGISTRY_ROW_INVALID:${index}`);
			continue;
		}
		map.set(row.featureKey, row);
	}
	return map;
});
const [rootMap, frontendMap] = sourceMaps;
const keys = new Set([...rootMap.keys(), ...frontendMap.keys()]);
const expectedCounts = { matched: 0, rootOnly: 0, frontendOnly: 0, summaryConflict: 0 };
for (const key of keys) {
	const root = rootMap.get(key);
	const frontend = frontendMap.get(key);
	if (!root) expectedCounts.frontendOnly++;
	else if (!frontend) expectedCounts.rootOnly++;
	else {
		expectedCounts.matched++;
		if (root.summary !== frontend.summary) expectedCounts.summaryConflict++;
	}
}
requireCondition(JSON.stringify(expectedCounts) === JSON.stringify(register.counts), 'REGISTER_SOURCE_COUNTS_MISMATCH');
requireCondition(register.features?.length === keys.size, 'REGISTER_FEATURE_COUNT_MISMATCH');

const uniqueKeys = new Set();
const ownershipCounts = { featureStatuses: {}, sourceReferenceLanes: {} };
const requiredKeys = [
	'featureKey', 'displayLabelCandidate', 'sourceRefs', 'sourceReferenceOwnership',
	'sourceOwnershipSummary', 'canonicalFeatureLabel', 'domainTaxonomyClassification',
	'embedding', 'databaseIndexReadback', 'clusterTopKLineage', 'environmentLane',
	'productionReadiness', 'consolidationDisposition'
];
const expectedLaneNames = ['LEGAL_AI_PRODUCT', 'PARENT_ATLAS_CANONICAL_OR_DERIVED', 'WORKSTATION_DEV_TEST', 'UNASSESSED'];

for (const feature of register.features ?? []) {
	if (uniqueKeys.has(feature.featureKey)) failures.push(`DUPLICATE_FEATURE_KEY:${feature.featureKey}`);
	uniqueKeys.add(feature.featureKey);
	for (const key of requiredKeys) requireCondition(key in feature, `FEATURE_FIELD_MISSING:${feature.featureKey}:${key}`);
	requireCondition(feature.canonicalFeatureLabel === 'UNVERIFIED_NO_PER_FEATURE_DATABASE_IDENTITY_JOIN', `FEATURE_LABEL_OVERCLAIM:${feature.featureKey}`);
	requireCondition(feature.domainTaxonomyClassification === 'UNVERIFIED_NO_REVISION_BOUND_CLASSIFICATION_JOIN', `FEATURE_TAXONOMY_OVERCLAIM:${feature.featureKey}`);
	requireCondition(feature.embedding?.canonicalRepresentation === 'EmbeddingGemma semantic_768', `FEATURE_EMBEDDING_CONTRACT_MISSING:${feature.featureKey}`);
	requireCondition(feature.embedding?.status === 'UNVERIFIED_NO_PER_FEATURE_EMBEDDING_PROOF', `FEATURE_EMBEDDING_OVERCLAIM:${feature.featureKey}`);
	requireCondition(feature.databaseIndexReadback === 'UNVERIFIED_NO_CANONICAL_INDEX_READBACK_JOIN', `FEATURE_INDEX_OVERCLAIM:${feature.featureKey}`);
	requireCondition(feature.productionReadiness === 'NOT_PROVEN_BY_REGISTRY_STATUS', `FEATURE_READINESS_OVERCLAIM:${feature.featureKey}`);
	requireCondition(feature.consolidationDisposition === 'REVIEW_REQUIRED_RETAIN_UNTIL_OWNER_AND_CONSUMERS_CONFIRMED', `FEATURE_CONSOLIDATION_OVERCLAIM:${feature.featureKey}`);
	requireCondition(Array.isArray(feature.sourceRefs) && Array.isArray(feature.sourceReferenceOwnership), `FEATURE_SOURCE_BINDING_INVALID:${feature.featureKey}`);
	requireCondition(feature.sourceRefs?.length === feature.sourceReferenceOwnership?.length, `FEATURE_SOURCE_OWNERSHIP_CARDINALITY_MISMATCH:${feature.featureKey}`);
	requireCondition(feature.sourceReferenceOwnership?.every((item, index) => item.sourceRef === feature.sourceRefs[index] && item.canonicalAuthority === false), `FEATURE_SOURCE_OWNERSHIP_BINDING_INVALID:${feature.featureKey}`);

	const ownerStatus = feature.sourceOwnershipSummary?.status;
	ownershipCounts.featureStatuses[ownerStatus] = (ownershipCounts.featureStatuses[ownerStatus] ?? 0) + 1;
	for (const lane of expectedLaneNames) {
		const count = feature.sourceOwnershipSummary?.laneCounts?.[lane];
		requireCondition(Number.isInteger(count) && count >= 0, `FEATURE_LANE_COUNT_INVALID:${feature.featureKey}:${lane}`);
		ownershipCounts.sourceReferenceLanes[lane] = (ownershipCounts.sourceReferenceLanes[lane] ?? 0) + (count ?? 0);
	}
}

requireCondition(uniqueKeys.size === register.features?.length, 'REGISTER_KEYS_NOT_UNIQUE');
requireCondition(JSON.stringify(ownershipCounts) === JSON.stringify(register.ownershipCounts), 'REGISTER_OWNERSHIP_TOTALS_MISMATCH');

if (failures.length) {
	console.error(JSON.stringify({ status: 'FAILED', failures }, null, 2));
	process.exitCode = 1;
} else {
	console.log(JSON.stringify({
		status: 'VALIDATED_PROPOSAL_REGISTER',
		readOnly: true,
		writesPerformed: false,
		featureCount: register.features.length,
		counts: register.counts,
		ownershipCounts: register.ownershipCounts,
		sourceRegistrySha256: register.sourceRegistrySha256,
		censusSnapshot: {
			generatedAt: census.generatedAt,
			database: census.data.database,
			serverVersion: census.data.serverVersion,
			vectorExtension: census.data.vectorExtension,
			featureRegistryPresent: census.data.tables.featureRegistryPresent,
			featureMapRows: census.data.featureMap.rows,
			featureVectorRows: census.data.featureVectors.rows,
			featureEmbeddingRows: census.data.featureEmbeddingRows,
			codebaseChunkRows: census.data.codebaseChunks.rows,
			chunkRowsWithEmbedding768: census.data.codebaseChunks.withEmbedding768,
			chunkRowsWithSourceRevision: census.data.codebaseChunks.withSourceRevision,
			chunkRowsWithWorkspaceRevision: census.data.codebaseChunks.withWorkspaceRevision,
			chunkRowsWithLineageChecksum: census.data.codebaseChunks.withLineageBindingChecksum
		}
	}, null, 2));
}

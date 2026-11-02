import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	classifyWorkspaceFeatureSourceRefV1,
	summarizeWorkspaceFeatureOwnershipV1
} from './lib/workspace-feature-ownership-v1.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputs = [
	{
		name: 'root',
		path: path.join(repositoryRoot, 'docs/atlas/feature-registry.json')
	},
	{
		name: 'frontend',
		path: path.join(repositoryRoot, 'sveltekit-frontend/docs/atlas/feature-registry.json')
	}
];
const outputPath = path.join(
	repositoryRoot,
	'docs/reports/workspace-feature-master-register-v2-2026-11-02.json'
);

function digest(buffer) {
	return createHash('sha256').update(buffer).digest('hex');
}

function normalizeRow(row) {
	if (
		!row ||
		typeof row.featureKey !== 'string' ||
		typeof row.title !== 'string' ||
		!Array.isArray(row.sourceRefs) ||
		!Array.isArray(row.missing)
	) {
		throw new Error('FEATURE_REGISTRY_ROW_CONTRACT_INVALID');
	}
	return row;
}

const registries = new Map();
const hashes = {};
for (const input of inputs) {
	const bytes = await readFile(input.path);
	hashes[input.name] = digest(bytes);
	const rows = JSON.parse(bytes.toString('utf8'));
	if (!Array.isArray(rows)) throw new Error(`FEATURE_REGISTRY_NOT_ARRAY:${input.name}`);
	const indexed = new Map();
	for (const rawRow of rows) {
		const row = normalizeRow(rawRow);
		if (indexed.has(row.featureKey)) throw new Error(`DUPLICATE_FEATURE_KEY:${input.name}:${row.featureKey}`);
		indexed.set(row.featureKey, row);
	}
	registries.set(input.name, indexed);
}

const rootRows = registries.get('root');
const frontendRows = registries.get('frontend');
const featureKeys = [...new Set([...rootRows.keys(), ...frontendRows.keys()])].sort();
const counts = { matched: 0, rootOnly: 0, frontendOnly: 0, summaryConflict: 0 };
const features = [];

for (const featureKey of featureKeys) {
	const rootRow = rootRows.get(featureKey);
	const frontendRow = frontendRows.get(featureKey);
	const chosen = frontendRow ?? rootRow;
	const copyStatus = !rootRow
		? 'FRONTEND_ONLY'
		: !frontendRow
			? 'ROOT_ONLY'
			: rootRow.summary === frontendRow.summary
				? 'MATCHED_KEY_FIELDS_REVIEW_OTHER_FIELDS'
				: 'SUMMARY_CONFLICT';
	if (copyStatus === 'FRONTEND_ONLY') counts.frontendOnly++;
	else if (copyStatus === 'ROOT_ONLY') counts.rootOnly++;
	else {
		counts.matched++;
		if (copyStatus === 'SUMMARY_CONFLICT') counts.summaryConflict++;
	}
	const sourceRefs = [...new Set([...(rootRow?.sourceRefs ?? []), ...(frontendRow?.sourceRefs ?? [])])];
	const sourceReferenceOwnership = sourceRefs.map(classifyWorkspaceFeatureSourceRefV1);
	const ownershipSummary = summarizeWorkspaceFeatureOwnershipV1(sourceReferenceOwnership);
	const missing = [...new Set([...(rootRow?.missing ?? []), ...(frontendRow?.missing ?? [])])];
	features.push({
		featureKey,
		displayLabelCandidate: chosen.title,
		registryStatusNotRuntimeProof: chosen.status,
		sourceRefs,
		sourceReferenceOwnership,
		sourceOwnershipSummary: ownershipSummary,
		missingNotes: missing,
		nextQuery: chosen.nextQuery ?? null,
		registryCopyStatus: copyStatus,
		registryCopies: {
			root: rootRow ? { summary: rootRow.summary, title: rootRow.title, status: rootRow.status } : null,
			frontend: frontendRow ? { summary: frontendRow.summary, title: frontendRow.title, status: frontendRow.status } : null
		},
		canonicalFeatureLabel: 'UNVERIFIED_NO_PER_FEATURE_DATABASE_IDENTITY_JOIN',
		domainTaxonomyClassification: 'UNVERIFIED_NO_REVISION_BOUND_CLASSIFICATION_JOIN',
		embedding: {
			canonicalRepresentation: 'EmbeddingGemma semantic_768',
			status: 'UNVERIFIED_NO_PER_FEATURE_EMBEDDING_PROOF'
		},
		databaseIndexReadback: 'UNVERIFIED_NO_CANONICAL_INDEX_READBACK_JOIN',
		clusterTopKLineage: 'UNVERIFIED_DERIVED_ROUTING_NOT_CANONICAL',
		environmentLane: ownershipSummary.status === 'SINGLE_LANE_PATH_CLASSIFICATION'
			? ownershipSummary.assignedLanes[0]
			: 'UNASSESSED_AMBIGUOUS_OR_MIXED_SOURCE_OWNERSHIP',
		productionReadiness: 'NOT_PROVEN_BY_REGISTRY_STATUS',
		consolidationDisposition: 'REVIEW_REQUIRED_RETAIN_UNTIL_OWNER_AND_CONSUMERS_CONFIRMED'
	});
}

await mkdir(path.dirname(outputPath), { recursive: true });
const output = {
	schema: 'atlas.workspace-feature-master-register.v2',
	generatedAt: new Date().toISOString(),
	readOnly: true,
	canonicalAuthority: false,
	writesPerformed: false,
	sourceRegistrySha256: hashes,
	counts,
	ownershipCounts: features.reduce((accumulator, feature) => {
		accumulator.featureStatuses[feature.sourceOwnershipSummary.status] =
			(accumulator.featureStatuses[feature.sourceOwnershipSummary.status] ?? 0) + 1;
		for (const [lane, count] of Object.entries(feature.sourceOwnershipSummary.laneCounts)) {
			accumulator.sourceReferenceLanes[lane] = (accumulator.sourceReferenceLanes[lane] ?? 0) + count;
		}
		return accumulator;
	}, { featureStatuses: {}, sourceReferenceLanes: {} }),
	features
};
const serialized = `${JSON.stringify(output, null, 2)}\n`;
await writeFile(outputPath, serialized, 'utf8');
console.log(
	JSON.stringify(
		{
			outputPath: path.relative(repositoryRoot, outputPath).replaceAll(path.sep, '/'),
			rows: featureKeys.length,
			counts,
			registrySha256: hashes,
			outputSha256: digest(Buffer.from(serialized, 'utf8'))
		},
		null,
		2
	)
);

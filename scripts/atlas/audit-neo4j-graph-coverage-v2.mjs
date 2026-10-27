#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import neo4j from 'neo4j-driver';
import { loadRepoEnv, REPO_ROOT } from './connection-config.mjs';
import { buildNeo4jGraphCoverageReceiptV2, buildNeo4jSourceLineageDiagnosticV2, verifyNeo4jGraphCoverageReceiptV2 } from './lib/neo4j-graph-coverage-v2.mjs';

const env = loadRepoEnv(process.env);
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
const runId = `${new Date().toISOString().replaceAll(':', '-')}-${crypto.randomUUID()}`;
const outputRoot = path.resolve(REPO_ROOT, '.tmp/atlas');
const outputPath = path.resolve(REPO_ROOT, outputArg ?? path.join('.tmp/atlas/neo4j-graph-coverage-v2', `${runId}.json`));
const outputRelative = path.relative(outputRoot, outputPath);

if (outputRelative.startsWith('..') || path.isAbsolute(outputRelative)) throw new Error('COVERAGE_OUTPUT_MUST_STAY_UNDER_TMP_ATLAS');
if (!env.NEO4J_PASSWORD) throw new Error('NEO4J_PASSWORD_NOT_CONFIGURED');

const driver = neo4j.driver(
	env.NEO4J_URI ?? 'bolt://127.0.0.1:7687',
	neo4j.auth.basic(env.NEO4J_USER ?? 'neo4j', env.NEO4J_PASSWORD),
);
const sessionConfig = { defaultAccessMode: neo4j.session.READ };
if (env.NEO4J_DATABASE) sessionConfig.database = env.NEO4J_DATABASE;
const session = driver.session(sessionConfig);
const toNumber = (value) => neo4j.isInt(value) ? value.toNumber() : Number(value);
const queryDigest = (id, statement) => ({
	id,
	sha256: `sha256:${crypto.createHash('sha256').update(statement, 'utf8').digest('hex')}`,
});

try {
	const census = await session.executeRead(async (transaction) => {
		const databaseInfoResult = await transaction.run('CALL db.info()');
		const databaseInfo = databaseInfoResult.records[0];
		if (!databaseInfo) throw new Error('NEO4J_DATABASE_IDENTITY_UNAVAILABLE');
		const databaseName = databaseInfo.get('name');
		const databaseId = databaseInfo.get('id');
		if (typeof databaseName !== 'string' || !databaseName || typeof databaseId !== 'string' || !databaseId) throw new Error('NEO4J_DATABASE_IDENTITY_INCOMPLETE');
		const nodeLabelsQuery = 'MATCH (n) UNWIND labels(n) AS label RETURN label, count(DISTINCT elementId(n)) AS count ORDER BY label';
		const nodeTotalQuery = 'MATCH (n) RETURN count(*) AS count';
		const relationshipQuery = 'MATCH (source)-[relationship]->(target) RETURN type(relationship) AS type, labels(source) AS sourceLabels, labels(target) AS targetLabels, count(*) AS count ORDER BY type, sourceLabels, targetLabels';
		const identityQuery = `
		MATCH (n)
		RETURN count(CASE WHEN size(labels(n)) = 0 THEN 1 END) AS unlabeledNodes,
		       count(CASE WHEN 'Packet' IN labels(n) AND (n.packet_key IS NULL OR trim(toString(n.packet_key)) = '') THEN 1 END) AS packetsMissingPacketKey,
		       count(CASE WHEN 'Packet' IN labels(n) AND (n.source_ref IS NULL OR trim(toString(n.source_ref)) = '') THEN 1 END) AS packetsMissingSourceRef,
		       count(CASE WHEN 'Feature' IN labels(n) AND (n.feature_id IS NULL OR trim(toString(n.feature_id)) = '') THEN 1 END) AS featuresMissingFeatureId,
		       count(CASE WHEN 'Feature' IN labels(n) AND (n.feature_label IS NULL OR trim(toString(n.feature_label)) = '') THEN 1 END) AS featuresMissingFeatureLabel
	`;
		const unlabeledEndpointQuery = 'MATCH (source)-[relationship]->(target) RETURN count(CASE WHEN size(labels(source)) = 0 OR size(labels(target)) = 0 THEN 1 END) AS count';
		const lineageQuery = `
			MATCH (n)
			UNWIND labels(n) AS label
			WITH n, label
			WHERE label IN ['Packet', 'CodebaseFile', 'ParentAtlasSource', 'SourceRef', 'TreeNode', 'Feature', 'Concept', 'Function', 'ParentAtlasFeature']
			RETURN label,
			       count(DISTINCT elementId(n)) AS total,
		       count(DISTINCT CASE WHEN coalesce(nullif(trim(toString(n.source_revision)), ''), nullif(trim(toString(n.sourceRevision)), '')) IS NOT NULL THEN elementId(n) END) AS sourceRevisionPresent,
		       count(DISTINCT CASE WHEN coalesce(nullif(trim(toString(n.workspace_revision)), ''), nullif(trim(toString(n.workspaceRevision)), '')) IS NOT NULL THEN elementId(n) END) AS workspaceRevisionPresent,
		       count(DISTINCT CASE WHEN coalesce(nullif(trim(toString(n.source_revision)), ''), nullif(trim(toString(n.sourceRevision)), '')) IS NOT NULL AND coalesce(nullif(trim(toString(n.workspace_revision)), ''), nullif(trim(toString(n.workspaceRevision)), '')) IS NOT NULL THEN elementId(n) END) AS bothRevisionsPresent
			ORDER BY label
		`;
		const nodeResult = await transaction.run(nodeLabelsQuery);
		const nodeTotalResult = await transaction.run(nodeTotalQuery);
		const relationshipResult = await transaction.run(relationshipQuery);
		const identityResult = await transaction.run(identityQuery);
		const unlabeledEndpointResult = await transaction.run(unlabeledEndpointQuery);
		const lineageResult = await transaction.run(lineageQuery);
		return {
			databaseIdentity: {
				databaseName,
				databaseId,
				configuredDatabase: env.NEO4J_DATABASE ?? null,
				endpoint: new URL(env.NEO4J_URI ?? 'bolt://127.0.0.1:7687').host,
			},
			queryDefinitions: [
				queryDigest('neo4j.db-info.v1', 'CALL db.info()'),
				queryDigest('neo4j.node-label-census.v2', nodeLabelsQuery),
				queryDigest('neo4j.node-total.v1', nodeTotalQuery),
				queryDigest('neo4j.relationship-endpoint-census.v2', relationshipQuery),
				queryDigest('neo4j.identity-diagnostics.v2', identityQuery),
				queryDigest('neo4j.unlabeled-endpoint-census.v1', unlabeledEndpointQuery),
				queryDigest('neo4j.source-lineage-census.v2', lineageQuery),
			],
			results: { nodeResult, nodeTotalResult, relationshipResult, identityResult, unlabeledEndpointResult, lineageResult },
		};
	});
	const { nodeResult, nodeTotalResult, relationshipResult, identityResult, unlabeledEndpointResult, lineageResult } = census.results;
	const nodeLabels = nodeResult.records.map((record) => ({ label: record.get('label'), count: toNumber(record.get('count')) }));
	const relationshipEndpoints = relationshipResult.records.map((record) => ({
		type: record.get('type'),
		sourceLabels: [...record.get('sourceLabels')].sort(),
		targetLabels: [...record.get('targetLabels')].sort(),
		count: toNumber(record.get('count')),
	}));
	const sourceLineage = lineageResult.records.map((record) => buildNeo4jSourceLineageDiagnosticV2({
		label: record.get('label'),
		total: toNumber(record.get('total')),
		sourceRevisionPresent: toNumber(record.get('sourceRevisionPresent')),
		workspaceRevisionPresent: toNumber(record.get('workspaceRevisionPresent')),
		bothRevisionsPresent: toNumber(record.get('bothRevisionsPresent')),
	}));
	const identity = identityResult.records[0];
	const identityDiagnostics = {
		unlabeledNodes: toNumber(identity.get('unlabeledNodes')),
		packetsMissingPacketKey: toNumber(identity.get('packetsMissingPacketKey')),
		packetsMissingSourceRef: toNumber(identity.get('packetsMissingSourceRef')),
		featuresMissingFeatureId: toNumber(identity.get('featuresMissingFeatureId')),
		featuresMissingFeatureLabel: toNumber(identity.get('featuresMissingFeatureLabel')),
		relationshipsWithUnlabeledEndpoint: toNumber(unlabeledEndpointResult.records[0].get('count')),
	};
	const receipt = buildNeo4jGraphCoverageReceiptV2({
		runId,
		generatedAtUtc: new Date().toISOString(),
		databaseIdentity: census.databaseIdentity,
		readBoundary: {
			accessMode: 'READ',
			transactionStrategy: 'single_executeRead_transaction',
			consistency: 'READ_TRANSACTION_NO_SNAPSHOT_CONSISTENCY_CLAIM_WHILE_CONCURRENT_WRITERS_MAY_RUN',
		},
		queryDefinitions: census.queryDefinitions,
		nodesConsidered: toNumber(nodeTotalResult.records[0].get('count')),
		nodeLabels,
		relationshipEndpoints,
		sourceLineage,
		identityDiagnostics,
	});
	if (!verifyNeo4jGraphCoverageReceiptV2(receipt)) throw new Error('GRAPH_COVERAGE_RECEIPT_CHECKSUM_INVALID');
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	const tempPath = `${outputPath}.${process.pid}.tmp`;
	const fd = fs.openSync(tempPath, 'wx');
	try { fs.writeFileSync(fd, `${JSON.stringify(receipt, null, 2)}\n`); } finally { fs.closeSync(fd); }
	fs.renameSync(tempPath, outputPath);
	console.log(JSON.stringify({
		status: receipt.coverageStatus,
		nodesConsidered: receipt.nodesConsidered,
		nodeLabelMemberships: receipt.nodeLabelMemberships,
		relationshipsConsidered: receipt.relationshipsConsidered,
		nodeLabelCount: receipt.nodeLabels.length,
		relationshipEndpointClassCount: receipt.relationshipEndpoints.length,
		identityDiagnostics: receipt.identityDiagnostics,
		receiptSha256: receipt.receiptSha256,
		reportPath: path.relative(REPO_ROOT, outputPath).replaceAll('\\', '/'),
		writesPerformed: false,
	}, null, 2));
} finally {
	await session.close();
	await driver.close();
}

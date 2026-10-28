import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateGraphJsonContractStreamV1 } from './graph-json-contract-stream-v1.mjs';

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const receiptHash = (value) => {
	const { receiptSha256, ...body } = value;
	return hash(JSON.stringify(body));
};

async function fixture(t, { partial = false } = {}) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-stream-graph-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const runDir = path.join(root, '.tmp/atlas/run-1');
	await fs.mkdir(runDir, { recursive: true });
	const nodeRows = [
		{ id: 'packet-1', node_type: 'Packet', packet_key: 'key-1', source_ref: 'src/a.ts', feature_id: 'feature-1' },
		{ id: 'feature-1', node_type: 'Feature', feature_id: 'feature-1', feature_label: 'Feature' },
		{ id: 'som-1', node_type: 'SOMCell', coordinates: { som_x: 0, som_y: 1 } },
	];
	const edgeRows = [{ source: 'packet-1', target: 'feature-1', weight: 0.8 }];
	const nodesPath = path.join(runDir, 'nodes.json');
	const edgesPath = path.join(runDir, 'edges.json');
	const exportPath = path.join(runDir, 'graph.json');
	const coveragePath = path.join(runDir, 'coverage.json');
	const nodesText = JSON.stringify(nodeRows);
	const edgesText = JSON.stringify(edgeRows);
	const coverage = {
		status: partial ? 'PARTIAL' : 'COMPLETE',
		readConsistency: { status: 'PROVEN', strategy: 'fixture-snapshot' },
		sourceRevision: hash('source'),
		workspaceRevision: hash('workspace'),
		selectionChecksum: hash('selection'),
		executionId: '22222222-2222-7222-8222-222222222222',
		nodeClasses: { Packet: { considered: 1, exported: 1, excluded: 0, unresolved: 0 }, Feature: { considered: 1, exported: 1, excluded: 0, unresolved: 0 }, SOMCell: { considered: 1, exported: 1, excluded: 0, unresolved: 0 } },
		relationshipTypes: { LINK: { considered: 1, exported: 1, excluded: 0, unresolved: 0 } },
		coverageThresholds: [
			{ scope: 'nodeClass', key: 'Packet', minimumCoverage: 1 },
			{ scope: 'nodeClass', key: 'Feature', minimumCoverage: 1 },
			{ scope: 'relationshipType', key: 'LINK', minimumCoverage: 1 },
		],
		thresholdsPassed: true,
	};
	const properties = { metadata: { exportCoverage: coverage } };
	await fs.writeFile(nodesPath, nodesText);
	await fs.writeFile(edgesPath, edgesText);
	await fs.writeFile(exportPath, JSON.stringify({ ...properties, nodes: nodeRows, edges: edgeRows }));
	const receipt = {
		schema: 'NEO4J_GRAPH_EXPORT_COVERAGE_V2',
	outputPath: 'run-1/graph.json',
		outputSha256: hash(await fs.readFile(exportPath)),
		nodeArrayPath: 'run-1/nodes.json',
		edgeArrayPath: 'run-1/edges.json',
		nodeArrayCount: nodeRows.length,
		edgeArrayCount: edgeRows.length,
		nodeArraySha256: hash(nodesText),
		edgeArraySha256: hash(edgesText),
		graphContentSha256: hash(`atlas-graph-export-content-v1\n${hash(nodesText)}\n${hash(edgesText)}`),
		graphMetadata: { exportCoverage: coverage },
		canonicalAuthority: false,
		writesPerformed: false,
	};
	receipt.receiptSha256 = receiptHash(receipt);
	await fs.writeFile(coveragePath, JSON.stringify(receipt));
	return { root, exportPath, coveragePath, receipt, nodesPath };
}

test('validates receipt-bound node and edge arrays incrementally', async (t) => {
	const input = await fixture(t);
	const report = await validateGraphJsonContractStreamV1(input);
	assert.equal(report.validationMode, 'BOUNDED_ARRAY_STREAM');
	assert.equal(report.validation_tests.array_identity.status, 'PASS');
	assert.equal(report.validation_tests.edge_integrity.status, 'PASS');
	assert.equal(report.verdict, 'PASS');
});

test('rejects a partial coverage receipt despite referentially valid edges', async (t) => {
	const input = await fixture(t, { partial: true });
	const report = await validateGraphJsonContractStreamV1(input);
	assert.equal(report.validation_tests.edge_integrity.status, 'PASS');
	assert.equal(report.validation_tests.export_coverage.status, 'FAIL');
	assert.equal(report.verdict, 'FAIL');
});

test('rejects tampered receipt-bound arrays before validation', async (t) => {
	const input = await fixture(t);
	await fs.writeFile(input.nodesPath, '[{"id":"changed","node_type":"Packet"}]');
	await assert.rejects(validateGraphJsonContractStreamV1(input), /GRAPH_ARRAY_DIGEST_MISMATCH/);
});

test('rejects stale receipt checksums and artifacts outside the run root', async (t) => {
	const input = await fixture(t);
	input.receipt.runId = 'stale-run';
	await fs.writeFile(input.coveragePath, JSON.stringify(input.receipt));
	await assert.rejects(validateGraphJsonContractStreamV1(input), /GRAPH_COVERAGE_RECEIPT_DIGEST_MISMATCH/);
	await assert.rejects(validateGraphJsonContractStreamV1({ ...input, exportPath: path.join(input.root, 'outside.json') }), /GRAPH_EXPORT_PATH_OUTSIDE_TMP_ATLAS/);
	await assert.rejects(validateGraphJsonContractStreamV1({ ...input, coveragePath: path.join(input.root, 'outside.json') }), /GRAPH_COVERAGE_PATH_OUTSIDE_TMP_ATLAS/);
});

test('rejects truncated streamed arrays', async (t) => {
	const input = await fixture(t);
	await fs.writeFile(input.nodesPath, '[{"id":"unterminated"}');
	input.receipt.nodeArraySha256 = hash(await fs.readFile(input.nodesPath));
	const exportText = `{"metadata":{"exportCoverage":${JSON.stringify(input.receipt.graphMetadata.exportCoverage)},"nodes":[{"id":"unterminated"}],"edges":[{"source":"packet-1","target":"feature-1","weight":0.8}]}`;
	await fs.writeFile(input.exportPath, exportText);
	input.receipt.outputSha256 = hash(exportText);
	input.receipt.graphContentSha256 = hash(`atlas-graph-export-content-v1\n${input.receipt.nodeArraySha256}\n${input.receipt.edgeArraySha256}`);
	input.receipt.receiptSha256 = receiptHash(input.receipt);
	await fs.writeFile(input.coveragePath, JSON.stringify(input.receipt));
	await assert.rejects(validateGraphJsonContractStreamV1(input), /JSON_ARRAY_TRUNCATED/);
});

test('rejects duplicate node identities', async (t) => {
	const input = await fixture(t);
	const duplicateNodes = '[{"id":"same","node_type":"Packet"},{"id":"same","node_type":"Feature"}]';
	await fs.writeFile(input.nodesPath, duplicateNodes);
	input.receipt.nodeArrayCount = 2;
	input.receipt.nodeArraySha256 = hash(duplicateNodes);
	input.receipt.graphContentSha256 = hash(`atlas-graph-export-content-v1\n${input.receipt.nodeArraySha256}\n${input.receipt.edgeArraySha256}`);
	input.receipt.receiptSha256 = receiptHash(input.receipt);
	await fs.writeFile(input.coveragePath, JSON.stringify(input.receipt));
	const exportText = JSON.stringify({ metadata: { exportCoverage: input.receipt.graphMetadata.exportCoverage }, nodes: JSON.parse(duplicateNodes), edges: [{ source: 'same', target: 'same', weight: 0.5 }] });
	await fs.writeFile(input.exportPath, exportText);
	input.receipt.outputSha256 = hash(exportText);
	input.receipt.receiptSha256 = receiptHash(input.receipt);
	await fs.writeFile(input.coveragePath, JSON.stringify(input.receipt));
	const report = await validateGraphJsonContractStreamV1(input);
	assert.equal(report.validation_tests.array_identity.status, 'FAIL');
	assert.equal(report.verdict, 'FAIL');
});

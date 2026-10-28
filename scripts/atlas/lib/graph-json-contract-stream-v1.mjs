import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { forEachJsonArrayObjectV1 } from './stream-json-arrays-v1.mjs';
import { evaluateGraphExportCoverageV2 } from './graph-export-coverage-contract-v2.mjs';

const sha256File = async (filePath) => {
	const hash = createHash('sha256');
	for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
	return `sha256:${hash.digest('hex')}`;
};

const receiptDigest = (receipt) => {
	const { receiptSha256, ...body } = receipt;
	return `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
};

function resolveArtifact(root, relativePath) {
	if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) throw new Error('GRAPH_ARTIFACT_PATH_INVALID');
	const base = path.resolve(root, '.tmp/atlas');
	const resolved = path.resolve(base, relativePath);
	const relative = path.relative(base, resolved);
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('GRAPH_ARTIFACT_PATH_OUTSIDE_TMP_ATLAS');
	return resolved;
}

function assertRunArtifact(root, filePath, errorCode) {
	const base = path.resolve(root, '.tmp/atlas');
	const resolved = path.resolve(filePath);
	const relative = path.relative(base, resolved);
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(errorCode);
	return resolved;
}

export async function validateGraphJsonContractStreamV1({ root, exportPath, coveragePath, maxRows = 1_000_000 }) {
	exportPath = assertRunArtifact(root, exportPath, 'GRAPH_EXPORT_PATH_OUTSIDE_TMP_ATLAS');
	coveragePath = assertRunArtifact(root, coveragePath, 'GRAPH_COVERAGE_PATH_OUTSIDE_TMP_ATLAS');
	const receipt = JSON.parse(await fs.promises.readFile(coveragePath, 'utf8'));
	if (receipt.schema !== 'NEO4J_GRAPH_EXPORT_COVERAGE_V2' || receipt.canonicalAuthority !== false || receipt.writesPerformed !== false) {
		throw new Error('GRAPH_COVERAGE_RECEIPT_IDENTITY_INVALID');
	}
	if (receipt.receiptSha256 !== receiptDigest(receipt)) throw new Error('GRAPH_COVERAGE_RECEIPT_DIGEST_MISMATCH');
	const expectedOutput = resolveArtifact(root, receipt.outputPath);
	if (path.resolve(exportPath) !== expectedOutput) throw new Error('GRAPH_EXPORT_RECEIPT_PATH_MISMATCH');
	if (await sha256File(exportPath) !== receipt.outputSha256) throw new Error('GRAPH_EXPORT_DIGEST_MISMATCH');
	const nodesPath = resolveArtifact(root, receipt.nodeArrayPath);
	const edgesPath = resolveArtifact(root, receipt.edgeArrayPath);
	if (await sha256File(nodesPath) !== receipt.nodeArraySha256 || await sha256File(edgesPath) !== receipt.edgeArraySha256) {
		throw new Error('GRAPH_ARRAY_DIGEST_MISMATCH');
	}
	const expectedGraphContentSha256 = `sha256:${createHash('sha256').update(`atlas-graph-export-content-v1\n${receipt.nodeArraySha256}\n${receipt.edgeArraySha256}`).digest('hex')}`;
	if (receipt.graphContentSha256 !== expectedGraphContentSha256) throw new Error('GRAPH_CONTENT_DIGEST_MISMATCH');
	if (![receipt.nodeArrayCount, receipt.edgeArrayCount].every((count) => Number.isSafeInteger(count) && count >= 0 && count <= maxRows)) {
		throw new Error('GRAPH_ARRAY_COUNT_INVALID');
	}
	const report = {
		timestamp: new Date().toISOString(),
		input: path.basename(exportPath),
		validation_tests: {},
		passes: 0,
		failures: 0,
		warnings: 0,
		verdict: 'PENDING',
		validationMode: 'BOUNDED_ARRAY_STREAM',
		receiptSha256: receipt.receiptSha256,
	};
	const nodeIds = new Set();
	const packet = { total: 0, complete: 0 };
	const feature = { total: 0, complete: 0 };
	const som = { total: 0, complete: 0 };
	let nodesSeen = 0;
	let duplicates = 0;
	let pathsSeen = 0;
	let validPaths = 0;
	const nodeCount = await forEachJsonArrayObjectV1({
		filePath: nodesPath,
		maxValues: Math.min(maxRows, receipt.nodeArrayCount),
		onValue: (node) => {
			nodesSeen += 1;
			if (typeof node.id !== 'string' || !node.id) throw new Error('GRAPH_NODE_ID_INVALID');
			if (nodeIds.has(node.id)) duplicates += 1;
			nodeIds.add(node.id);
			if (node.node_type === 'Packet') {
				packet.total += 1;
				if (node.packet_key && node.source_ref && node.feature_id) packet.complete += 1;
			}
			if (node.node_type === 'Feature') {
				feature.total += 1;
				if (node.feature_id && node.feature_label) feature.complete += 1;
			}
			if (node.node_type === 'SOMCell') {
				som.total += 1;
				if (typeof node.coordinates?.som_x === 'number' && Number.isFinite(node.coordinates.som_x)
					&& typeof node.coordinates?.som_y === 'number' && Number.isFinite(node.coordinates.som_y)) som.complete += 1;
			}
			if (node.traversal_path) {
				pathsSeen += 1;
				if (Array.isArray(node.traversal_path) && node.traversal_path.every((part) => typeof part === 'string')) validPaths += 1;
			}
		},
	});
	if (nodeCount !== receipt.nodeArrayCount) throw new Error('GRAPH_NODE_ARRAY_COUNT_MISMATCH');
	let edgesSeen = 0;
	let brokenEdges = 0;
	let invalidWeights = 0;
	const edgeCount = await forEachJsonArrayObjectV1({
		filePath: edgesPath,
		maxValues: Math.min(maxRows, receipt.edgeArrayCount),
		onValue: (edge) => {
			edgesSeen += 1;
			if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) brokenEdges += 1;
			if (typeof edge.weight !== 'number' || !Number.isFinite(edge.weight) || edge.weight < 0 || edge.weight > 1) invalidWeights += 1;
		},
	});
	if (edgeCount !== receipt.edgeArrayCount) throw new Error('GRAPH_EDGE_ARRAY_COUNT_MISMATCH');
	const coverage = evaluateGraphExportCoverageV2({ metadata: receipt.graphMetadata });
	const percent = (count, complete) => count ? complete / count * 100 : 0;
	const checks = {
		packet_identity_chain: { total_packets: packet.total, with_complete_identity: packet.complete, coverage_percent: percent(packet.total, packet.complete), status: packet.total && percent(packet.total, packet.complete) >= 95 ? 'PASS' : 'FAIL' },
		feature_naming: { total_features: feature.total, with_label: feature.complete, coverage_percent: percent(feature.total, feature.complete), status: feature.total && percent(feature.total, feature.complete) >= 90 ? 'PASS' : 'FAIL' },
		som_coordinates: { total_som_cells: som.total, with_valid_coordinates: som.complete, coverage_percent: percent(som.total, som.complete), status: som.total && percent(som.total, som.complete) >= 95 ? 'PASS' : 'FAIL' },
		edge_integrity: { total_edges: edgesSeen, with_valid_refs: edgesSeen - brokenEdges, with_valid_weights: edgesSeen - invalidWeights, coverage_percent: edgesSeen ? (edgesSeen - brokenEdges) / edgesSeen * 100 : 0, status: edgesSeen > 0 && brokenEdges === 0 && invalidWeights === 0 ? 'PASS' : 'FAIL' },
		traversal_paths: { nodes_with_paths: pathsSeen, with_valid_arrays: validPaths, coverage_percent: pathsSeen ? validPaths / pathsSeen * 100 : 0, status: pathsSeen === 0 ? 'WARN' : validPaths / pathsSeen >= 0.95 ? 'PASS' : 'FAIL' },
		export_coverage: { status: coverage.status, reasons: coverage.reasons },
		array_identity: { nodes_expected: receipt.nodeArrayCount, nodes_read: nodeCount, edges_expected: receipt.edgeArrayCount, edges_read: edgeCount, duplicate_node_ids: duplicates, status: nodesSeen === receipt.nodeArrayCount && edgesSeen === receipt.edgeArrayCount && duplicates === 0 ? 'PASS' : 'FAIL' },
	};
	report.validation_tests = checks;
	for (const [name, check] of Object.entries(checks)) {
		if (check.status === 'PASS') report.passes += 1;
		else if (check.status === 'WARN') report.warnings += 1;
		else report.failures += 1;
		if (name === 'array_identity') check.reasons = duplicates ? ['DUPLICATE_NODE_IDS'] : [];
	}
	report.verdict = coverage.status !== 'PASS' || report.failures > 0 ? 'FAIL' : 'PASS';
	return report;
}

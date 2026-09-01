#!/usr/bin/env node
/**
 * GRAPH-06D binding proof.
 *
 * Binds the canonical GraphOrdinalMapV1 contract (buildGraphOrdinalMapV1,
 * compileGraphOrdinalEdgesV1, buildGraphOrdinalParityInputV1 --
 * src/lib/server/atlas/graph/) to the existing, already-PROVEN
 * NetworkX<->cuGraph parity receipt at
 * docs/reports/graph-snapshot-parity/receipt.json (162,234 nodes, 108,156
 * edges, pagerankCorrelation=1, louvainCommunityAgreement=1, PASS,
 * 2026-08-12), rather than re-running a second 162K-node NetworkX/cuGraph
 * pass. That receipt already proves same-artifact backend parity with no
 * automatic nx-cugraph dispatch; what it never did was construct its
 * dense-ordinal identity through the canonical GraphOrdinalMapV1 builder
 * (it used its own nodeTableHash/edgeTableHash scheme instead). This script
 * closes that gap: build the SAME graph's ordinal map + compiled edges
 * through the real canonical contract, and record the resulting
 * graphOrdinalMapChecksum alongside the existing receipt's hashes as two
 * independent identity fingerprints of the same underlying graph.
 *
 * Read-only: no canonical writes, no database access. Reads two exported
 * JSON files (produced by a one-off Python export from the existing frozen
 * nodes.parquet/edges.parquet -- see graph-snapshot-parity/graph-node-keys.json
 * and graph-edges-by-key.json) and the existing receipt for cross-reference.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	buildGraphOrdinalMapV1,
} from '../../src/lib/server/atlas/graph/graph-ordinal-map-v1.js';
import { compileGraphOrdinalEdgesV1 } from '../../src/lib/server/atlas/graph/graph-ordinal-edge-compiler-v1.js';
import { buildGraphOrdinalParityInputV1 } from '../../src/lib/server/atlas/graph/graph-ordinal-parity-input-v1.js';

const REPORTS_DIR = 'C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/docs/reports/graph-snapshot-parity';
const OUT_PATH = 'C:/Users/james/Videos/deeds-web-app/docs/reports/graph-06d-graph-ordinal-map-binding-v1.json';

type ExistingReceipt = {
	graphRevision: string;
	manifest: {
		graphRevision: string;
		nodeCount: number;
		edgeCount: number;
		producerRevision: string;
		nodeTableHash: string;
		edgeTableHash: string;
		identityContractVersion: string;
		projectionRevision: string;
	};
	networkx: { status: string; nodeCount: number; edgeCount: number; componentCount: number };
	cugraph: { status: string; nodeCount: number; edgeCount: number; componentCount: number };
	pagerankTopKOverlap: number;
	pagerankCorrelation: number;
	pagerankMaxDelta: number;
	louvainCommunityAgreement: number;
	status: string;
};

function main(): void {
	const existingReceipt: ExistingReceipt = JSON.parse(readFileSync(`${REPORTS_DIR}/receipt.json`, 'utf8'));
	const nodeKeys: string[] = JSON.parse(readFileSync(`${REPORTS_DIR}/graph-node-keys.json`, 'utf8'));
	const edgeRows: { sourceNodeKey: string; targetNodeKey: string; weight: number; edgeType: string }[] = JSON.parse(
		readFileSync(`${REPORTS_DIR}/graph-edges-by-key.json`, 'utf8'),
	);

	if (nodeKeys.length !== existingReceipt.manifest.nodeCount) {
		throw new Error(
			`GRAPH_06D_NODE_COUNT_MISMATCH: exported ${nodeKeys.length} keys, receipt manifest says ${existingReceipt.manifest.nodeCount}`,
		);
	}
	if (edgeRows.length !== existingReceipt.manifest.edgeCount) {
		throw new Error(
			`GRAPH_06D_EDGE_COUNT_MISMATCH: exported ${edgeRows.length} edges, receipt manifest says ${existingReceipt.manifest.edgeCount}`,
		);
	}

	// workspaceRevision: the existing artifact has no separate field named
	// "workspaceRevision" -- producerRevision is the closest real, meaningful
	// revision string already bound to this exact artifact (not fabricated).
	const map = buildGraphOrdinalMapV1({
		graphRevision: existingReceipt.manifest.graphRevision,
		workspaceRevision: existingReceipt.manifest.producerRevision,
		graphNodeKeys: nodeKeys,
	});

	// Executor-local graph ordinals (map.rows[i].graphOrdinal) are dense [0,V)
	// integers assigned by SORTING graph_node_key strings -- deliberately NOT
	// the same as the existing artifact's gpu_node_id (which was assigned in
	// original scan order, not sorted-key order). This is the concrete,
	// checkable form of "executor-local graph ordinals must not become
	// CandidateOrdinal, packet identity, or canonical graph identity": the
	// two integer coordinate systems for the SAME node genuinely differ.
	const parityInput = buildGraphOrdinalParityInputV1({ map, edges: edgeRows });

	const compiledEdges = compileGraphOrdinalEdgesV1({ map, edges: edgeRows });
	if (compiledEdges.length !== edgeRows.length) {
		throw new Error(`GRAPH_06D_EDGE_COMPILE_COUNT_MISMATCH: compiled ${compiledEdges.length}, input ${edgeRows.length}`);
	}

	// Sample the ordinal-vs-gpu_node_id divergence to make the invariant concrete.
	const ordinalByKey = new Map(map.rows.map((r) => [r.graphNodeKey, r.graphOrdinal]));
	let sameOrdinalAsOriginalOrderCount = 0;
	for (let i = 0; i < nodeKeys.length; i++) {
		if (ordinalByKey.get(nodeKeys[i]) === i) sameOrdinalAsOriginalOrderCount++;
	}

	const result = {
		schema: 'atlas.graph-06d-graph-ordinal-map-binding.v1',
		task: 'GRAPH-06D',
		openspecChange: 'openspec/changes/parent-atlas-candidate-feature-execution-fabric',
		readOnly: true,
		canonicalWrites: false,
		reusesExistingProof: 'docs/reports/graph-snapshot-parity/receipt.json (2026-08-12, PASS, no automatic nx-cugraph dispatch)',
		existingReceiptSummary: {
			graphRevision: existingReceipt.graphRevision,
			nodeTableHash: existingReceipt.manifest.nodeTableHash,
			edgeTableHash: existingReceipt.manifest.edgeTableHash,
			networkxStatus: existingReceipt.networkx.status,
			cugraphStatus: existingReceipt.cugraph.status,
			pagerankTopKOverlap: existingReceipt.pagerankTopKOverlap,
			pagerankCorrelation: existingReceipt.pagerankCorrelation,
			pagerankMaxDelta: existingReceipt.pagerankMaxDelta,
			louvainCommunityAgreement: existingReceipt.louvainCommunityAgreement,
			status: existingReceipt.status,
		},
		graphOrdinalMapBinding: {
			graphRevision: map.graphRevision,
			workspaceRevisionSource: 'existingReceipt.manifest.producerRevision (no separate workspaceRevision field exists on the source artifact)',
			workspaceRevision: map.workspaceRevision,
			rowCount: map.rowCount,
			graphOrdinalMapChecksum: map.graphOrdinalMapChecksum,
			canonicalAuthority: map.canonicalAuthority,
		},
		graphOrdinalParityInput: {
			schema: parityInput.schema,
			graphOrdinalMapChecksum: parityInput.graphOrdinalMapChecksum,
			nodeCount: parityInput.nodes.length,
			edgeCount: parityInput.edges.length,
		},
		invariantCheck: {
			description: 'Executor-local graphOrdinal (dense, sorted-graphNodeKey order) must differ from the source artifact\'s gpu_node_id (scan order) for at least some nodes -- proving the two integer coordinate systems are not silently the same thing.',
			nodeCountWhereGraphOrdinalEqualsOriginalScanOrder: sameOrdinalAsOriginalOrderCount,
			totalNodes: nodeKeys.length,
			divergesAsExpected: sameOrdinalAsOriginalOrderCount < nodeKeys.length,
		},
		gate: {
			nodeCountMatches: nodeKeys.length === existingReceipt.manifest.nodeCount,
			edgeCountMatches: edgeRows.length === existingReceipt.manifest.edgeCount,
			edgeCompileSucceededForAllEdges: compiledEdges.length === edgeRows.length,
			ordinalDivergesFromSourceScanOrder: sameOrdinalAsOriginalOrderCount < nodeKeys.length,
			underlyingBackendParityStillPasses: existingReceipt.status === 'PASS',
		},
		RESULT: 'PENDING',
	};

	const allGatesPass = Object.values(result.gate).every(Boolean);
	result.RESULT = allGatesPass ? 'PASS' : 'FAIL';

	writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + '\n');
	console.log(JSON.stringify(result, null, 2));
	console.log('Report:', OUT_PATH);

	if (!allGatesPass) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}

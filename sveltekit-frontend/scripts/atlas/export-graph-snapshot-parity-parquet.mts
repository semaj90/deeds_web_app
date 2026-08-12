#!/usr/bin/env node
/**
 * GRAPH_SNAPSHOT_PARITY frozen artifact exporter.
 *
 * Reads a graph-snapshot-materializer-shaped JSON payload (either the live
 * frozen export at graphify/frozen-graph-snapshot-v2.json, or a smaller
 * fixture via --input-json) and writes nodes.parquet / edges.parquet /
 * manifest.json conforming to graph-snapshot-parity-contract.ts.
 *
 * This does not touch Neo4j, cuGraph, or Postgres directly — it only maps
 * an already-materialized snapshot into the frozen parity artifact shape.
 * validate-graph-snapshot-parity.mts consumes the manifest this emits.
 *
 * Two code paths, chosen by input file size:
 *  - small inputs (<= LARGE_FILE_THRESHOLD_BYTES): Node reads and
 *    JSON.parses the whole file, then the tested pure mapper in
 *    graph-snapshot-parity-exporter.ts builds the row tables.
 *  - large inputs (the real ~486MB frozen snapshot): JSON.parse on the
 *    whole file risks the same V8 max-string-length class of failure
 *    documented in graph-snapshot.ts's topologyHash(). Instead this path
 *    hands the file straight to DuckDB's native JSON reader (no Node-side
 *    string materialization of the array bodies) and does the array
 *    unnesting, gpu_node_id assignment, and edge-endpoint join in SQL.
 *    The resulting (much smaller) row tables are then read back into Node
 *    and hashed with the exact same hashGraphSnapshotParityRows() used by
 *    the small-file path, so both paths produce hash-comparable output.
 */

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { DuckDBResultReader, type DuckDBConnection } from '@duckdb/node-api';
import { createAtlasDuckDB } from '../../packages/atlas-duckdb/src/index.js';
import {
	buildGraphSnapshotParityTables,
	hashGraphSnapshotParityRows,
	type GraphSnapshotParityEdgeRow,
	type GraphSnapshotParityNodeRow
} from '../../src/lib/server/atlas/graph/graph-snapshot-parity-exporter.js';
import { GraphSnapshotParityManifestSchema } from '../../src/lib/server/atlas/graph/graph-snapshot-parity-contract.js';

const LARGE_FILE_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20MB — comfortably above every checked-in fixture, well below the 486MB corpus.

type CliArgs = {
	inputJson: string;
	outDir: string;
	projectionRevision: string;
};

function parseArgs(argv: readonly string[]): CliArgs {
	const get = (name: string, fallback: string): string => {
		const index = argv.indexOf(name);
		return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
	};
	return {
		inputJson: get('--input-json', resolve(import.meta.dirname, '..', '..', '..', 'graphify', 'frozen-graph-snapshot-v2.json')),
		outDir: get('--out-dir', resolve(import.meta.dirname, '..', '..', 'docs', 'reports', 'graph-snapshot-parity')),
		projectionRevision: get('--projection-revision', 'graph-snapshot-parity-v1')
	};
}

type FrozenSnapshotNode = { nodeKey: string; nodeType: string; sourceRef: string | null; packetKey: string | null };
type FrozenSnapshotEdge = { sourceNodeKey: string; targetNodeKey: string; edgeType: string; weight: number };
type FrozenSnapshotManifest = { identityContractVersion: string; parserContractVersion: string; topologyHash: string; excludedNodeCount: number; excludedEdgeCount: number };
type FrozenSnapshotPayload = {
	snapshotId: string;
	nodes: FrozenSnapshotNode[];
	edges: FrozenSnapshotEdge[];
	manifest: FrozenSnapshotManifest;
};

type ExportOutcome = {
	snapshotId: string;
	nodeRows: GraphSnapshotParityNodeRow[];
	edgeRows: GraphSnapshotParityEdgeRow[];
	unresolvedEdgeCount: number;
	nodeTableHash: string;
	edgeTableHash: string;
	manifest: FrozenSnapshotManifest;
};

const posixPath = (path: string): string => path.replace(/\\/g, '/');

async function queryRows(connection: DuckDBConnection, sql: string): Promise<Array<Record<string, unknown>>> {
	const result = await connection.run(sql);
	const reader = new DuckDBResultReader(result);
	await reader.readAll();
	return reader.getRowObjectsJS() as Array<Record<string, unknown>>;
}

async function exportSmallFile(inputJson: string): Promise<ExportOutcome> {
	const payload = JSON.parse(await readFile(inputJson, 'utf8')) as FrozenSnapshotPayload;
	const tables = buildGraphSnapshotParityTables({ nodes: payload.nodes, edges: payload.edges });
	return {
		snapshotId: payload.snapshotId,
		nodeRows: tables.nodeRows,
		edgeRows: tables.edgeRows,
		unresolvedEdgeCount: tables.unresolvedEdgeCount,
		nodeTableHash: tables.nodeTableHash,
		edgeTableHash: tables.edgeTableHash,
		manifest: payload.manifest
	};
}

async function exportLargeFile(inputJson: string): Promise<ExportOutcome> {
	const path = posixPath(resolve(inputJson));
	const duck = await createAtlasDuckDB({ databasePath: ':memory:', tempDirectory: tmpdir(), memoryLimit: '10GB' });
	try {
		await duck.connection.run(`
			CREATE TABLE doc AS SELECT * FROM read_json(
				'${path}',
				columns = {snapshotId: 'VARCHAR', nodes: 'JSON', edges: 'JSON', manifest: 'JSON'},
				maximum_object_size = 600000000
			);
		`);

		await duck.connection.run(`
			CREATE TABLE parity_nodes AS
			SELECT
				row_number() OVER () - 1 AS gpu_node_id,
				key AS graph_node_key,
				kind AS node_kind,
				sref AS source_ref,
				NULL::VARCHAR AS source_revision,
				pkey AS packet_key,
				NULL::VARCHAR AS symbol_id,
				NULL::VARCHAR AS symbol_version_id
			FROM (
				SELECT
					UNNEST(CAST(json_extract_string(nodes, '$[*].nodeKey') AS VARCHAR[])) AS key,
					UNNEST(CAST(json_extract_string(nodes, '$[*].nodeType') AS VARCHAR[])) AS kind,
					UNNEST(CAST(json_extract_string(nodes, '$[*].sourceRef') AS VARCHAR[])) AS sref,
					UNNEST(CAST(json_extract_string(nodes, '$[*].packetKey') AS VARCHAR[])) AS pkey
				FROM doc
			);
		`);

		await duck.connection.run(`
			CREATE TABLE raw_edges AS
			SELECT
				src AS source_node_key,
				dst AS target_node_key,
				etype AS edge_type,
				CAST(w AS DOUBLE) AS weight
			FROM (
				SELECT
					UNNEST(CAST(json_extract_string(edges, '$[*].sourceNodeKey') AS VARCHAR[])) AS src,
					UNNEST(CAST(json_extract_string(edges, '$[*].targetNodeKey') AS VARCHAR[])) AS dst,
					UNNEST(CAST(json_extract_string(edges, '$[*].edgeType') AS VARCHAR[])) AS etype,
					UNNEST(CAST(json_extract_string(edges, '$[*].weight') AS VARCHAR[])) AS w
				FROM doc
			);
		`);

		await duck.connection.run(`
			CREATE TABLE parity_edges AS
			SELECT
				src.gpu_node_id AS src_gpu_node_id,
				dst.gpu_node_id AS dst_gpu_node_id,
				re.edge_type,
				re.weight
			FROM raw_edges re
			JOIN parity_nodes src ON src.graph_node_key = re.source_node_key
			JOIN parity_nodes dst ON dst.graph_node_key = re.target_node_key;
		`);

		const [{ snapshotId, manifest }] = (await queryRows(duck.connection, `SELECT snapshotId, manifest FROM doc;`)) as Array<{
			snapshotId: string;
			manifest: string;
		}>;
		const manifestParsed = JSON.parse(manifest) as FrozenSnapshotManifest;

		const [{ raw_edge_count: rawEdgeCount, resolved_edge_count: resolvedEdgeCount }] = (await queryRows(
			duck.connection,
			`SELECT (SELECT COUNT(*) FROM raw_edges) AS raw_edge_count, (SELECT COUNT(*) FROM parity_edges) AS resolved_edge_count;`
		)) as Array<{ raw_edge_count: bigint | number; resolved_edge_count: bigint | number }>;

		const nodeRowsRaw = await queryRows(duck.connection, `SELECT * FROM parity_nodes ORDER BY gpu_node_id;`);
		const nodeRows: GraphSnapshotParityNodeRow[] = nodeRowsRaw.map((row) => ({
			gpu_node_id: Number(row.gpu_node_id),
			graph_node_key: String(row.graph_node_key),
			node_kind: String(row.node_kind),
			source_ref: row.source_ref === null ? null : String(row.source_ref),
			source_revision: row.source_revision === null ? null : String(row.source_revision),
			packet_key: row.packet_key === null ? null : String(row.packet_key),
			symbol_id: row.symbol_id === null ? null : String(row.symbol_id),
			symbol_version_id: row.symbol_version_id === null ? null : String(row.symbol_version_id)
		}));

		const edgeRowsRaw = await queryRows(
			duck.connection,
			`SELECT * FROM parity_edges ORDER BY src_gpu_node_id, dst_gpu_node_id, edge_type;`
		);
		const edgeRows: GraphSnapshotParityEdgeRow[] = edgeRowsRaw.map((row) => ({
			src_gpu_node_id: Number(row.src_gpu_node_id),
			dst_gpu_node_id: Number(row.dst_gpu_node_id),
			edge_type: String(row.edge_type),
			weight: Number(row.weight)
		}));

		return {
			snapshotId,
			nodeRows,
			edgeRows,
			unresolvedEdgeCount: Number(rawEdgeCount) - Number(resolvedEdgeCount),
			nodeTableHash: hashGraphSnapshotParityRows(nodeRows),
			edgeTableHash: hashGraphSnapshotParityRows(edgeRows),
			manifest: manifestParsed
		};
	} finally {
		await duck.close();
	}
}

async function writeParquet(outDir: string, nodeRows: GraphSnapshotParityNodeRow[], edgeRows: GraphSnapshotParityEdgeRow[]): Promise<{ nodesParquetPath: string; edgesParquetPath: string }> {
	await mkdir(outDir, { recursive: true });
	const nodesParquetPath = resolve(outDir, 'nodes.parquet');
	const edgesParquetPath = resolve(outDir, 'edges.parquet');

	const nodesNdjsonPath = resolve(outDir, `.nodes-${randomUUID()}.ndjson`);
	const edgesNdjsonPath = resolve(outDir, `.edges-${randomUUID()}.ndjson`);
	await writeFile(nodesNdjsonPath, nodeRows.map((row) => JSON.stringify(row)).join('\n'), 'utf8');
	await writeFile(edgesNdjsonPath, edgeRows.map((row) => JSON.stringify(row)).join('\n'), 'utf8');

	const duck = await createAtlasDuckDB({ databasePath: ':memory:', tempDirectory: tmpdir(), memoryLimit: '10GB' });
	try {
		await duck.connection.run(`CREATE TABLE out_nodes AS SELECT * FROM read_ndjson_auto('${posixPath(nodesNdjsonPath)}');`);
		await duck.connection.run(`COPY out_nodes TO '${posixPath(nodesParquetPath)}' (FORMAT PARQUET, COMPRESSION ZSTD);`);
		await duck.connection.run(`CREATE TABLE out_edges AS SELECT * FROM read_ndjson_auto('${posixPath(edgesNdjsonPath)}');`);
		await duck.connection.run(`COPY out_edges TO '${posixPath(edgesParquetPath)}' (FORMAT PARQUET, COMPRESSION ZSTD);`);
	} finally {
		await duck.close();
		await rm(nodesNdjsonPath, { force: true });
		await rm(edgesNdjsonPath, { force: true });
	}

	return { nodesParquetPath, edgesParquetPath };
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	const inputStat = await stat(args.inputJson);
	const usedLargeFilePath = inputStat.size > LARGE_FILE_THRESHOLD_BYTES;
	const outcome = usedLargeFilePath ? await exportLargeFile(args.inputJson) : await exportSmallFile(args.inputJson);

	const { nodesParquetPath, edgesParquetPath } = await writeParquet(args.outDir, outcome.nodeRows, outcome.edgeRows);
	const manifestJsonPath = resolve(args.outDir, 'manifest.json');

	const manifest = GraphSnapshotParityManifestSchema.parse({
		graphRevision: outcome.manifest.topologyHash,
		nodeCount: outcome.nodeRows.length,
		edgeCount: outcome.edgeRows.length,
		producerRevision: `${outcome.manifest.identityContractVersion}+${outcome.manifest.parserContractVersion}`,
		nodeTableHash: outcome.nodeTableHash,
		edgeTableHash: outcome.edgeTableHash,
		identityContractVersion: outcome.manifest.identityContractVersion,
		projectionRevision: args.projectionRevision
	});

	await writeFile(manifestJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

	process.stdout.write(`${JSON.stringify({
		receiptKind: 'GRAPH_SNAPSHOT_PARITY_ARTIFACT_EXPORT',
		exportPath: usedLargeFilePath ? 'duckdb-sql-large-file' : 'js-pure-mapper-small-file',
		inputFileSizeBytes: inputStat.size,
		snapshotId: outcome.snapshotId,
		nodesParquetPath,
		edgesParquetPath,
		manifestJsonPath,
		nodeCount: outcome.nodeRows.length,
		edgeCount: outcome.edgeRows.length,
		unresolvedEdgeCount: outcome.unresolvedEdgeCount,
		sourceExcludedNodeCount: outcome.manifest.excludedNodeCount,
		sourceExcludedEdgeCount: outcome.manifest.excludedEdgeCount
	}, null, 2)}\n`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});

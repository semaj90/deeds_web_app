import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scriptDir, '../../..');
const repo = path.resolve(frontend, '..');
const workspace = path.resolve(process.env.BLENDER_MCP_WORKSPACE ?? path.join(repo, '.tmp/blender-mcp-workspace'));
const blender = process.env.BLENDER_EXECUTABLE ?? 'blender';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(workspace, 'smoke', `memory-fabric-${stamp}`);
await mkdir(outputDir, { recursive: true });

const relativeOutput = path.relative(workspace, path.join(outputDir, 'atlas-memory-fabric.blend')).replaceAll('\\', '/');
const relativeReadbackOutput = relativeOutput.replace(/\.blend$/i, '-readback.blend');
const transport = new StdioClientTransport({
	command: process.execPath,
	args: [path.join(frontend, 'scripts/mcp/blender-model-mcp.mjs')],
	env: { ...process.env, BLENDER_EXECUTABLE: blender, BLENDER_MCP_WORKSPACE: workspace },
	stderr: 'pipe'
});
const client = new Client({ name: 'atlas-memory-fabric-smoke', version: '1.0.0' });

function parseResult(result) {
	const text = result.content?.find((item) => item.type === 'text')?.text;
	assert.ok(text, 'Blender MCP returned no text result');
	const parsed = JSON.parse(text);
	assert.equal(parsed.isError, undefined);
	return parsed;
}

const fabric = {
	name: 'Synthetic Atlas Residency Fixture',
	gpuProfile: 'RTX_3060_TI_8GB',
	tokenBlockSize: 4096,
	maxTriangles: 100_000,
	domains: [
		{ id: 'legal-synthesis', label: 'Legal synthesis (synthetic)', color: [0.16, 0.48, 0.9] },
		{ id: 'semantic-index', label: 'Semantic index (synthetic)', color: [0.2, 0.72, 0.52] }
	],
	blocks: [
		{ id: 'packet-cold', tier: 'cold', residency: 'POSTGRES', domainId: 'legal-synthesis', label: 'Cold source packet', packetKey: 'fixture:packet-001', payloadKind: 'PACKET', tokenStart: 0, tokenCount: 4096, residencyScore: 0.12 },
		{ id: 'packet-warm', tier: 'warm', residency: 'CPU_RAM', domainId: 'legal-synthesis', label: 'Warm 4096-token block', packetKey: 'fixture:packet-001', payloadKind: 'TOKEN_BLOCK', tokenStart: 0, tokenCount: 4096, residencyScore: 0.58 },
		{ id: 'packet-hot', tier: 'hot', residency: 'GPU_VRAM', domainId: 'legal-synthesis', label: 'Hot prefill block', packetKey: 'fixture:packet-001', payloadKind: 'TOKEN_BLOCK', tokenStart: 0, tokenCount: 4096, residencyScore: 0.93 },
		{ id: 'embedding-768-int8', tier: 'warm', residency: 'CPU_RAM', domainId: 'semantic-index', label: '768-D INT8 embedding (size illustration)', packetKey: 'fixture:embedding-001', payloadKind: 'EMBEDDING_VECTOR', representation: 'INT8', vectorDimensions: 768, payloadBytes: 768, tokenStart: 0, tokenCount: 1, residencyScore: 0.5 }
	],
	edges: [
		{ from: 'packet-cold', to: 'packet-warm', kind: 'routes_to' },
		{ from: 'packet-warm', to: 'packet-hot', kind: 'routes_to' }
	],
	cacheMoves: [
		{ id: 'synthetic-db-read', fromBlockId: 'packet-cold', toBlockId: 'packet-warm', sequence: 1, reason: 'prefill', transport: 'POSTGRES_READ', gateId: 'synthetic-fixture-only' },
		{ id: 'synthetic-vram-promotion', fromBlockId: 'packet-warm', toBlockId: 'packet-hot', sequence: 2, reason: 'cache_promotion', transport: 'HOST_TO_DEVICE', gateId: 'synthetic-fixture-only' }
	],
	indexBuilds: [
		{ id: 'planned-pgvector', engine: 'PGVECTOR_HNSW', status: 'PLANNED' },
		{ id: 'planned-cuvs', engine: 'CUVS_CAGRA', status: 'PLANNED' }
	]
};

try {
	await client.connect(transport);
	const generated = parseResult(await client.callTool({
		name: 'blender_create_memory_fabric',
		arguments: { outputPath: relativeOutput, fabric }
	}, undefined, { timeout: 45_000, maxTotalTimeout: 55_000 }));
	const relativeGlb = path.relative(workspace, generated.exportedGlbPath).replaceAll('\\', '/');
	const readback = parseResult(await client.callTool({
		name: 'blender_import_gltf',
		arguments: { inputPath: relativeGlb, outputPath: relativeReadbackOutput }
	}, undefined, { timeout: 45_000, maxTotalTimeout: 55_000 }));
	const inspected = parseResult(await client.callTool({
		name: 'blender_inspect_scene',
		arguments: { inputPath: relativeReadbackOutput }
	}, undefined, { timeout: 30_000, maxTotalTimeout: 35_000 }));
	const glbBytes = await readFile(generated.exportedGlbPath);
	const blendBytes = await readFile(generated.savedPath);
	const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

	assert.equal(generated.operation, 'create_memory_fabric');
	assert.equal(generated.provenance, 'SYNTHETIC_INPUTS_ONLY');
	assert.equal(generated.liveCacheRead, false);
	assert.equal(generated.tokenBlockSize, 4096);
	assert.equal(generated.blockCount, 4);
	assert.equal(generated.domainCount, 2);
	assert.equal(generated.cacheMoveCount, 2);
	assert.equal(generated.indexBuildCount, 2);
	assert.equal(generated.gpuProfile, 'RTX_3060_TI_8GB');
	assert.equal(generated.gpuTotalVramGiB, 8);
	assert.equal(generated.gpuFreeVramMeasured, false);
	assert.equal(generated.triangleBudgetStatus, 'WITHIN_BUDGET');
	assert.ok(generated.meshObjectCount > 0);
	assert.ok(generated.triangleCount > 0 && generated.triangleCount <= generated.triangleBudget);
	assert.ok(generated.exportedGlbBytes > 0 && generated.exportedGlbBytes <= 8 * 1024 * 1024);
	assert.match(generated.glbSha256, /^[a-f0-9]{64}$/);
	assert.match(generated.blendSha256, /^[a-f0-9]{64}$/);
	assert.equal(glbBytes.byteLength, generated.exportedGlbBytes);
	assert.equal(digest(glbBytes), generated.glbSha256);
	assert.equal(digest(blendBytes), generated.blendSha256);
	assert.equal(readback.operation, 'import_gltf');
	assert.equal(readback.meshObjectCount, generated.meshObjectCount);
	assert.equal(readback.triangleCount, generated.triangleCount);
	assert.equal(generated.blenderSceneVertexCount, generated.vertexCount);
	assert.equal(inspected.operation, 'inspect_scene');
	assert.equal(inspected.bounds?.coordinateUnits, 'BLENDER_SCENE_UNITS');
	assert.ok(inspected.bounds?.extent?.every((extent) => Number.isFinite(extent) && extent > 0));
	assert.equal(inspected.bounds?.meshObjectCount, readback.meshObjectCount);
	assert.equal(inspected.vertexCount, readback.vertexCount);
	assert.equal(inspected.triangleCount, readback.triangleCount);
	assert.ok(generated.textObjectsConvertedForExport > 0);
	assert.equal(generated.blockPayloads.find((block) => block.blockId === 'embedding-768-int8')?.payloadBytes, 768);
	assert.ok(generated.indexBuilds.every((index) => index.status === 'PLANNED'));

	const receipt = {
		status: 'PASS',
		provenance: generated.provenance,
		liveCacheRead: generated.liveCacheRead,
		tokenBlockSize: generated.tokenBlockSize,
		blockCount: generated.blockCount,
		cacheMoveCount: generated.cacheMoveCount,
		indexBuilds: generated.indexBuilds,
		gpuProfile: generated.gpuProfile,
		gpuTotalVramGiB: generated.gpuTotalVramGiB,
		gpuFreeVramMeasured: generated.gpuFreeVramMeasured,
		meshObjectCount: generated.meshObjectCount,
		blenderSceneVertexCount: generated.blenderSceneVertexCount,
		triangleCount: generated.triangleCount,
		triangleBudget: generated.triangleBudget,
		independentReadback: {
			meshObjectCount: readback.meshObjectCount,
			vertexCount: readback.vertexCount,
			triangleCount: readback.triangleCount,
			bounds: inspected.bounds
		},
		meshObjectCountBeforeReadback: generated.meshObjectCount,
		textObjectsConvertedForExport: generated.textObjectsConvertedForExport,
		exportedGlbBytes: generated.exportedGlbBytes,
		glbSha256: generated.glbSha256,
		blendSha256: generated.blendSha256,
		independentSha256Verified: true,
		glbPath: generated.exportedGlbPath,
		outputDirectory: path.relative(repo, outputDir).replaceAll('\\', '/')
	};
	const reportPath = path.join(repo, '.tmp', 'atlas', `memory-fabric-smoke-${stamp}.json`);
	await mkdir(path.dirname(reportPath), { recursive: true });
	await writeFile(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
	process.stdout.write(`${JSON.stringify({ ...receipt, reportPath: path.relative(repo, reportPath).replaceAll('\\', '/') }, null, 2)}\n`);
} finally {
	await client.close().catch(() => {});
}

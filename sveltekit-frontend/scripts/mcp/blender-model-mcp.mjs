#!/usr/bin/env node
/**
 * Blender model MCP (stdio).
 *
 * Node owns the MCP/schema boundary; Blender's embedded Python owns bpy scene
 * operations. Every edit writes a new .blend file under BLENDER_MCP_WORKSPACE.
 * The input file is never saved in place and arbitrary Python is never accepted.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// The installed MCP SDK 1.22 validates Zod v3 schemas; the app's root `zod`
// export is v4, so use Zod's compatibility entrypoint at this process boundary.
import { z } from 'zod/v3';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, realpath, rm, stat, lstat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embeddingPayloadBytes } from './blender/embedding-payload-formats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const WORKSPACE = path.resolve(process.env.BLENDER_MCP_WORKSPACE ?? path.join(REPO_ROOT, '.tmp/blender-mcp-workspace'));
let WORKSPACE_REAL = WORKSPACE;
const BRIDGE = path.join(HERE, 'blender', 'model_bridge.py');
const BLENDER = process.env.BLENDER_EXECUTABLE || 'blender';
const MAX_TIMEOUT_MS = 120_000;
const MAX_RESULT_CHARS = 1_000_000;

const vector3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const primitive = z.enum(['cube', 'uv_sphere', 'cylinder', 'cone', 'torus']);
const objectSpec = z.object({
	name: z.string().min(1).max(64).regex(/^[\w .-]+$/),
	primitive,
	location: vector3.default([0, 0, 0]),
	rotation: vector3.default([0, 0, 0]),
	scale: vector3.refine((v) => v.every((n) => n > 0 && n <= 1000), 'Scale values must be positive and <= 1000').default([1, 1, 1]),
	color: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]).default([0.72, 0.55, 0.2, 1]),
}).strict();
const meshSpec = z.object({
	name: z.string().min(1).max(64).regex(/^[\w .-]+$/),
	vertices: z.array(vector3).min(3).max(5000),
	faces: z.array(z.array(z.number().int().nonnegative()).min(3).max(4)).min(1).max(5000),
	location: vector3.default([0, 0, 0]),
	rotation: vector3.default([0, 0, 0]),
	scale: z.tuple([z.number().positive().max(1000), z.number().positive().max(1000), z.number().positive().max(1000)]).default([1, 1, 1]),
	color: objectSpec.shape.color,
}).strict();
const memoryDomain = z.object({
	id: z.string().min(1).max(48).regex(/^[\w.-]+$/),
	label: z.string().min(1).max(48),
	color: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]),
}).strict();
const memoryBlock = z.object({
	id: z.string().min(1).max(32).regex(/^[\w.-]+$/),
	tier: z.enum(['hot', 'warm', 'cold']),
	residency: z.enum(['GPU_VRAM', 'CPU_RAM', 'VALKEY', 'POSTGRES']).optional(),
	domainId: z.string().min(1).max(48).regex(/^[\w.-]+$/),
	label: z.string().min(1).max(64),
	packetKey: z.string().min(1).max(96),
	payloadKind: z.enum(['TOKEN_BLOCK', 'EMBEDDING_VECTOR', 'PACKET']).optional(),
	representation: z.enum(['FP32', 'FP16', 'BF16', 'INT8', 'PACKED_INT4', 'PACKED_2BIT', 'FP8_STORAGE_ONLY']).optional(),
	vectorDimensions: z.number().int().positive().max(65536).optional(),
	payloadBytes: z.number().int().positive().max(2 ** 40).optional(),
	tokenStart: z.number().int().nonnegative().max(10_000_000),
	tokenCount: z.number().int().positive().max(4096).default(4096),
	residencyScore: z.number().min(0).max(1),
	rotationDeg: vector3.default([0, 0, 0]),
}).strict();
const memoryCacheMove = z.object({
	id: z.string().min(1).max(32).regex(/^[\w.-]+$/),
	fromBlockId: z.string().min(1).max(32).regex(/^[\w.-]+$/),
	toBlockId: z.string().min(1).max(32).regex(/^[\w.-]+$/),
	sequence: z.number().int().positive().max(1_000_000),
	reason: z.enum(['prefill', 'cache_promotion', 'cache_demotion', 'eviction', 'recovery']),
	transport: z.enum(['HOST_TO_DEVICE', 'DEVICE_TO_HOST', 'VALKEY_READ', 'POSTGRES_READ', 'CPU_COPY', 'GPU_LOCAL']).optional(),
	gateId: z.string().min(1).max(48).optional(),
}).strict();
const indexBuild = z.object({
	id: z.string().min(1).max(32).regex(/^[\w.-]+$/),
	engine: z.enum(['PGVECTOR_HNSW', 'CUVS_CAGRA']),
	status: z.enum(['PLANNED', 'MEASURED']),
	datasetRevision: z.string().min(1).max(96).optional(),
	receiptRef: z.string().min(1).max(160).optional(),
	hardware: z.string().min(1).max(120).optional(),
	vectorCount: z.number().int().positive().max(100_000_000).optional(),
	dimensions: z.number().int().positive().max(65536).optional(),
	buildTimeMs: z.number().finite().positive().max(7 * 24 * 60 * 60 * 1000).optional(),
	recallAt10: z.number().min(0).max(1).optional(),
}).strict().superRefine((item, ctx) => {
	if (item.status === 'MEASURED' && (!item.datasetRevision || !item.receiptRef || !item.hardware || !item.vectorCount || !item.dimensions || !item.buildTimeMs || item.recallAt10 === undefined)) {
		ctx.addIssue({ code: 'custom', message: 'Measured index builds require dataset revision, receipt, hardware, vector count, dimensions, build time, and Recall@10.' });
	}
});
const memoryFabricSpec = z.object({
	name: z.string().min(1).max(64).regex(/^[\w .-]+$/).default('Atlas Memory Fabric'),
	// Declared hardware identity only; this is not a free-memory or allocation receipt.
	gpuProfile: z.enum(['RTX_3060_TI_8GB']).optional(),
	tokenBlockSize: z.literal(4096).default(4096),
	maxTriangles: z.number().int().positive().max(1_000_000).default(100_000).describe('Hard ceiling for exported mesh triangles. This is a geometry budget, not a GPU performance guarantee.'),
	domains: z.array(memoryDomain).min(1).max(8),
	blocks: z.array(memoryBlock).min(1).max(24),
	edges: z.array(z.object({
		from: z.string().min(1).max(32),
		to: z.string().min(1).max(32),
		kind: z.enum(['depends_on', 'routes_to', 'summarizes']),
	}).strict()).max(64).default([]),
	cacheMoves: z.array(memoryCacheMove).max(64).default([]),
	indexBuilds: z.array(indexBuild).max(2).default([]),
}).strict().superRefine((spec, ctx) => {
	const domainIds = new Set(spec.domains.map((domain) => domain.id));
	const blockIds = new Set(spec.blocks.map((block) => block.id));
	if (domainIds.size !== spec.domains.length) ctx.addIssue({ code: 'custom', message: 'Domain IDs must be unique.' });
	if (blockIds.size !== spec.blocks.length) ctx.addIssue({ code: 'custom', message: 'Memory block IDs must be unique.' });
	for (const block of spec.blocks) if (!domainIds.has(block.domainId)) ctx.addIssue({ code: 'custom', message: `Unknown domainId on block ${block.id}.` });
	for (const block of spec.blocks) {
		if (block.payloadKind === 'EMBEDDING_VECTOR') {
			if (!block.representation || !block.vectorDimensions) ctx.addIssue({ code: 'custom', message: `Embedding block ${block.id} requires representation and vectorDimensions.` });
			else {
				const expectedBytes = embeddingPayloadBytes(block.representation, block.vectorDimensions);
				if (block.payloadBytes !== undefined && block.payloadBytes !== expectedBytes) ctx.addIssue({ code: 'custom', message: `Embedding block ${block.id} payloadBytes must equal ${expectedBytes} for its declared dimensions and representation.` });
			}
		} else if (block.vectorDimensions !== undefined) ctx.addIssue({ code: 'custom', message: `vectorDimensions is only valid for EMBEDDING_VECTOR block ${block.id}.` });
	}
	for (const edge of spec.edges) if (!blockIds.has(edge.from) || !blockIds.has(edge.to) || edge.from === edge.to) ctx.addIssue({ code: 'custom', message: 'Every DAG edge must connect two different declared blocks.' });
	const moveIds = new Set(spec.cacheMoves.map((move) => move.id));
	const moveSequences = new Set(spec.cacheMoves.map((move) => move.sequence));
	if (moveIds.size !== spec.cacheMoves.length) ctx.addIssue({ code: 'custom', message: 'Cache-move IDs must be unique.' });
	if (moveSequences.size !== spec.cacheMoves.length) ctx.addIssue({ code: 'custom', message: 'Cache-move sequence numbers must be unique.' });
	for (const move of spec.cacheMoves) {
		const from = spec.blocks.find((block) => block.id === move.fromBlockId);
		const to = spec.blocks.find((block) => block.id === move.toBlockId);
		if (!from || !to || from.id === to.id) ctx.addIssue({ code: 'custom', message: `Cache move ${move.id} must connect two different declared blocks.` });
		else if (from.packetKey !== to.packetKey || from.tier === to.tier) ctx.addIssue({ code: 'custom', message: `Cache move ${move.id} must connect different residency tiers for the same packetKey.` });
		else if (move.transport) {
			const fromResidency = from.residency ?? 'UNSPECIFIED';
			const toResidency = to.residency ?? 'UNSPECIFIED';
			const validTransport = {
				HOST_TO_DEVICE: ['CPU_RAM', 'GPU_VRAM'], DEVICE_TO_HOST: ['GPU_VRAM', 'CPU_RAM'],
				VALKEY_READ: ['VALKEY', 'CPU_RAM'], POSTGRES_READ: ['POSTGRES', 'CPU_RAM'],
				CPU_COPY: ['CPU_RAM', 'CPU_RAM'], GPU_LOCAL: ['GPU_VRAM', 'GPU_VRAM']
			}[move.transport];
			if (fromResidency !== validTransport[0] || toResidency !== validTransport[1]) ctx.addIssue({ code: 'custom', message: `Cache move ${move.id} transport does not match its declared residency endpoints.` });
		}
	}
	if (new Set(spec.indexBuilds.map((item) => item.engine)).size !== spec.indexBuilds.length) ctx.addIssue({ code: 'custom', message: 'Each index engine may appear at most once.' });
	const outgoing = new Map(spec.blocks.map((block) => [block.id, []]));
	for (const edge of spec.edges) outgoing.get(edge.from)?.push(edge.to);
	const visiting = new Set();
	const visited = new Set();
	const hasCycle = (id) => {
		if (visiting.has(id)) return true;
		if (visited.has(id)) return false;
		visiting.add(id);
		for (const next of outgoing.get(id) ?? []) if (hasCycle(next)) return true;
		visiting.delete(id);
		visited.add(id);
		return false;
	};
	if (spec.blocks.some((block) => hasCycle(block.id))) ctx.addIssue({ code: 'custom', message: 'DAG edges must be acyclic.' });
});
const lodSpec = z.object({
	inputPath: z.string().min(1).max(240).regex(/\.blend$/i),
	outputPath: z.string().min(1).max(240).regex(/\.blend$/i),
	glbOutputPath: z.string().min(1).max(240).regex(/\.glb$/i),
	ratio: z.number().finite().gt(0).lte(1).default(0.5),
	maxTriangles: z.number().int().positive().max(1_000_000).default(100_000),
	maxGlbBytes: z.number().int().positive().max(64 * 1024 * 1024).default(8 * 1024 * 1024),
}).strict();

async function sha256File(file) {
	const hash = createHash('sha256');
	for await (const chunk of (await import('node:fs')).createReadStream(file)) hash.update(chunk);
	return hash.digest('hex');
}

function workspacePath(input, { mustExist = false, extension = '.blend' } = {}) {
	if (typeof input !== 'string' || input.length < 1 || input.length > 240 || path.isAbsolute(input) || input.includes(':')) {
		throw new Error('Use a relative .blend path inside the configured Blender workspace.');
	}
	const resolved = path.resolve(WORKSPACE_REAL, input);
	const relative = path.relative(WORKSPACE_REAL, resolved);
	if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
		throw new Error('Path must remain inside the configured Blender workspace.');
	}
	if (path.extname(resolved).toLowerCase() !== extension) throw new Error(`Expected a ${extension} file.`);
	return resolved;
}

async function assertInputFile(file, { maxBytes = 2 * 1024 * 1024 * 1024, description = '.blend' } = {}) {
	const canonical = await realpath(file).catch(() => null);
	if (!canonical || !isInsideWorkspace(canonical)) throw new Error(`Input ${description} path must resolve inside the configured workspace.`);
	const info = await stat(file).catch(() => null);
	if (!info?.isFile()) throw new Error(`Input ${description} file does not exist in the configured workspace.`);
	if (info.size > maxBytes) throw new Error(`Input ${description} file exceeds its ${maxBytes}-byte safety limit.`);
}

function isInsideWorkspace(candidate) {
	const relative = path.relative(WORKSPACE_REAL, candidate);
	return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function runBlender({ operation, inputPath = null, outputPath = null, payload = {} }) {
	const tempDir = await mkdtemp(path.join(WORKSPACE, '.job-'));
	const payloadPath = path.join(tempDir, 'request.json');
	const resultPath = path.join(tempDir, 'result.json');
	const outputLockPath = outputPath ? `${outputPath}.mcp-lock` : null;
	let outputLock;
	try {
		if (outputLockPath) {
			try { outputLock = await open(outputLockPath, 'wx'); }
			catch { throw new Error('Another Blender operation is writing that output path, or its lock file already exists. Choose another output path or inspect the stale lock.'); }
		}
		const request = JSON.stringify({ operation, payload, outputPath, resultPath });
		await writeFile(payloadPath, request, { encoding: 'utf8', flag: 'wx' });
		const args = ['--background'];
		if (inputPath) args.push(inputPath);
		else args.push('--factory-startup');
		args.push('--python', BRIDGE, '--', payloadPath);
		const output = await new Promise((resolvePromise, reject) => {
			const child = spawn(BLENDER, args, { cwd: WORKSPACE, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
			let stdout = '';
			let stderr = '';
			const timer = setTimeout(() => child.kill('SIGKILL'), MAX_TIMEOUT_MS);
			child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout = (stdout + chunk).slice(-MAX_RESULT_CHARS); });
			child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr = (stderr + chunk).slice(-MAX_RESULT_CHARS); });
			child.once('error', (error) => {
				clearTimeout(timer);
				if (error.code === 'ENOENT') reject(new Error('Blender executable was not found. Put blender on PATH or set BLENDER_EXECUTABLE to its full path.'));
				else reject(error);
			});
			child.once('close', (code, signal) => {
				clearTimeout(timer);
				if (code !== 0) reject(new Error(`Blender failed (${signal ?? code}): ${stderr.slice(-4000) || stdout.slice(-4000)}`));
				else resolvePromise({ stdout, stderr });
			});
		});
		if (outputPath) {
			const saved = await stat(outputPath).catch(() => null);
			if (!saved?.isFile() || saved.size === 0) {
				throw new Error(`Blender reported success but did not produce a non-empty output asset. stderr: ${output.stderr.slice(-1800)} stdout: ${output.stdout.slice(-1800)}`);
			}
		}
		const result = JSON.parse(await readFile(resultPath, 'utf8'));
		return { ...result, blenderExecutable: BLENDER, logs: { stdoutTail: output.stdout.slice(-2000), stderrTail: output.stderr.slice(-2000) } };
	} finally {
		await outputLock?.close().catch(() => {});
		if (outputLockPath && outputLock) await unlink(outputLockPath).catch(() => {});
		await rm(tempDir, { recursive: true, force: true });
	}
}

async function newOutputPath(relative, extension = '.blend') {
	const output = workspacePath(relative, { extension });
	await mkdir(path.dirname(output), { recursive: true });
	const canonicalParent = await realpath(path.dirname(output));
	if (!isInsideWorkspace(canonicalParent)) throw new Error('Output folder resolves outside the configured workspace.');
	if (await lstat(output).catch(() => null)) throw new Error('Output already exists; choose a new output path. Existing files are never overwritten.');
	return output;
}

const server = new McpServer({ name: 'parent-atlas-blender-models', version: '0.1.0' });

server.tool('blender_status', 'Check whether Blender is configured and return the isolated model workspace. Does not launch Blender.', {}, async () => {
	return { content: [{ type: 'text', text: JSON.stringify({ configuredExecutable: process.env.BLENDER_EXECUTABLE ?? 'blender (PATH lookup)', workspace: WORKSPACE_REAL, bridge: BRIDGE, executableOverrideSet: Boolean(process.env.BLENDER_EXECUTABLE) }) }] };
});

server.tool('blender_create_model', 'Create a new Blender scene from allow-listed primitives and save it as a new .blend file. Never overwrites an existing file.', {
	outputPath: z.string().min(1).max(240).describe('New relative .blend path under BLENDER_MCP_WORKSPACE'),
	objects: z.array(objectSpec).min(1).max(100),
}, async ({ outputPath, objects }) => {
	const output = await newOutputPath(outputPath);
	const result = await runBlender({ operation: 'create_model', outputPath: output, payload: { objects } });
	return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

server.tool('blender_create_mesh', 'Create a bounded triangle/quad mesh in a new Blender scene and save a new .blend file. Vertex and face arrays are validated; no Python or Blender operators are accepted from the caller.', {
	outputPath: z.string().min(1).max(240).describe('New relative .blend path under BLENDER_MCP_WORKSPACE'),
	mesh: meshSpec,
}, async ({ outputPath, mesh }) => {
	if (mesh.faces.some((face) => face.some((vertexIndex) => vertexIndex >= mesh.vertices.length))) {
		throw new Error('Every face index must refer to a supplied vertex.');
	}
	const output = await newOutputPath(outputPath);
	const result = await runBlender({ operation: 'create_mesh', outputPath: output, payload: { mesh } });
	return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

server.tool('blender_create_memory_fabric', 'Build an explicitly synthetic, low-polygon visualization of hot/warm/cold cache tiers, CPU RAM/GPU VRAM/Valkey/PostgreSQL residency, typed host/device/cache transfers, 4096-token blocks, and optional embedding payloads sized from dimensions and FP32/FP16/BF16/INT8/packed INT4/2-bit representation. FP8 is storage-only in this illustration, not supported RTX 3060 Ti Tensor Core execution. Optionally labels the RTX 3060 Ti 8 GiB profile while marking free VRAM unmeasured. Includes domain colors, DAG links, and optional pgvector HNSW versus cuVS CAGRA build cards. PLANNED cards have no timing; MEASURED cards require dataset/hardware/receipt and measured build/recall values. Enforces a triangle budget; it does not inspect live KV/ACE state or claim GPU/SIMT performance. Writes new .blend and .glb files only.', {
	outputPath: z.string().min(1).max(240).regex(/\.blend$/i).describe('New relative .blend path under BLENDER_MCP_WORKSPACE; a matching .glb is also written.'),
	fabric: memoryFabricSpec,
}, async ({ outputPath, fabric }) => {
	const blendOutput = await newOutputPath(outputPath);
	const glbOutput = await newOutputPath(outputPath.replace(/\.blend$/i, '.glb'), '.glb');
	const result = await runBlender({ operation: 'create_memory_fabric', outputPath: blendOutput, payload: { fabric, glbOutputPath: glbOutput } });
	const glb = await stat(glbOutput).catch(() => null);
	if (!glb?.isFile() || glb.size < 20) throw new Error('Blender did not produce a valid non-empty GLB export.');
	const blendInfo = await stat(blendOutput);
	const [blendSha256, glbSha256] = await Promise.all([sha256File(blendOutput), sha256File(glbOutput)]);
	return { content: [{ type: 'text', text: JSON.stringify({ ...result, exportedGlbPath: glbOutput, exportedGlbBytes: glb.size, blendBytes: blendInfo.size, blendSha256, glbSha256, provenance: 'SYNTHETIC_INPUTS_ONLY' }) }] };
});

server.tool('blender_inspect_scene', 'Read object names, types, transforms, dimensions, and scene bounds from a .blend file. Read-only.', {
	inputPath: z.string().min(1).max(240).describe('Relative .blend path under BLENDER_MCP_WORKSPACE'),
}, async ({ inputPath }) => {
	const input = workspacePath(inputPath);
	await assertInputFile(input);
	const result = await runBlender({ operation: 'inspect_scene', inputPath: input });
	return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

server.tool('blender_export_gltf', 'Export a .blend scene to a new binary glTF (.glb) file for Three.js. The source scene is never modified and existing outputs are never overwritten.', {
	inputPath: z.string().min(1).max(240).describe('Relative source .blend path'),
	outputPath: z.string().min(1).max(240).describe('New relative .glb path'),
}, async ({ inputPath, outputPath }) => {
	const input = workspacePath(inputPath);
	await assertInputFile(input);
	const output = await newOutputPath(outputPath, '.glb');
	const result = await runBlender({ operation: 'export_gltf', inputPath: input, outputPath: output });
	return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

server.tool('blender_import_gltf', 'Import a local GLB from the isolated Blender workspace and save it as a new .blend scene. This supports a local Three.js edit/export round trip; source files and case records are never overwritten.', {
	inputPath: z.string().min(1).max(240).describe('Relative source .glb path under BLENDER_MCP_WORKSPACE'),
	outputPath: z.string().min(1).max(240).regex(/\.blend$/i).describe('New relative .blend output path under BLENDER_MCP_WORKSPACE'),
}, async ({ inputPath, outputPath }) => {
	const input = workspacePath(inputPath, { extension: '.glb' });
	await assertInputFile(input, { maxBytes: 64 * 1024 * 1024, description: '.glb' });
	const output = await newOutputPath(outputPath);
	const result = await runBlender({ operation: 'import_gltf', outputPath: output, payload: { gltfPath: input } });
	return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

server.tool('blender_generate_mesh_lod', 'Create a new derived Blender/GLB copy with a bounded Decimate modifier applied to mesh objects. Reports measured triangle and GLB byte counts against explicit budgets; it does not modify the source or claim visual quality.', {
	inputPath: lodSpec.shape.inputPath.describe('Existing source .blend in the isolated workspace'),
	outputPath: lodSpec.shape.outputPath.describe('New derived .blend output path'),
	glbOutputPath: lodSpec.shape.glbOutputPath.describe('New derived binary .glb output path'),
	ratio: lodSpec.shape.ratio.describe('Decimate ratio from greater than 0 to 1'),
	maxTriangles: lodSpec.shape.maxTriangles.describe('Hard output triangle ceiling'),
	maxGlbBytes: lodSpec.shape.maxGlbBytes.describe('Byte target, defaults to 8 MiB; exceeding it is reported as BUDGET_NOT_MET'),
}, async (args) => {
	const parsed = lodSpec.parse(args);
	const input = workspacePath(parsed.inputPath, { extension: '.blend' });
	await assertInputFile(input);
	const output = await newOutputPath(parsed.outputPath, '.blend');
	const glbOutput = await newOutputPath(parsed.glbOutputPath, '.glb');
	const result = await runBlender({
		operation: 'generate_mesh_lod', inputPath: input, outputPath: output,
		payload: { glbOutputPath: glbOutput, ratio: parsed.ratio, maxTriangles: parsed.maxTriangles, maxGlbBytes: parsed.maxGlbBytes }
	});
	const [blendInfo, glbInfo] = await Promise.all([stat(output), stat(glbOutput)]);
	if (!glbInfo.isFile() || glbInfo.size < 20) throw new Error('Blender did not produce a valid non-empty LOD GLB.');
	const [blendSha256, glbSha256] = await Promise.all([sha256File(output), sha256File(glbOutput)]);
	return { content: [{ type: 'text', text: JSON.stringify({ ...result, blendBytes: blendInfo.size, glbBytes: glbInfo.size, blendSha256, glbSha256, byteBudgetStatus: glbInfo.size <= parsed.maxGlbBytes ? 'WITHIN_BUDGET' : 'BUDGET_NOT_MET', provenance: 'DERIVED_FROM_LOCAL_SOURCE_COPY' }) }] };
});

server.tool('blender_add_primitive', 'Add one allow-listed primitive to a source scene and save to a new .blend file. Source remains unchanged.', {
	inputPath: z.string().min(1).max(240),
	outputPath: z.string().min(1).max(240),
	object: objectSpec,
}, async ({ inputPath, outputPath, object }) => {
	const input = workspacePath(inputPath);
	await assertInputFile(input);
	const output = await newOutputPath(outputPath);
	const result = await runBlender({ operation: 'add_primitive', inputPath: input, outputPath: output, payload: { object } });
	return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

server.tool('blender_transform_object', 'Set location, rotation, and scale for one named object and save to a new .blend file. Source remains unchanged.', {
	inputPath: z.string().min(1).max(240),
	outputPath: z.string().min(1).max(240),
	objectName: z.string().min(1).max(64).regex(/^[\w .-]+$/),
	location: vector3.optional(),
	rotation: vector3.optional(),
	scale: vector3.refine((v) => v.every((n) => n > 0 && n <= 1000), 'Scale values must be positive and <= 1000').optional(),
}, async ({ inputPath, outputPath, objectName, location, rotation, scale }) => {
	if (!location && !rotation && !scale) throw new Error('Provide at least one transform.');
	const input = workspacePath(inputPath);
	await assertInputFile(input);
	const output = await newOutputPath(outputPath);
	const result = await runBlender({ operation: 'transform_object', inputPath: input, outputPath: output, payload: { objectName, location, rotation, scale } });
	return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

server.tool('blender_remove_object', 'Remove one named object from a source scene and save to a new .blend file. This does not modify the source file.', {
	inputPath: z.string().min(1).max(240),
	outputPath: z.string().min(1).max(240),
	objectName: z.string().min(1).max(64).regex(/^[\w .-]+$/),
}, async ({ inputPath, outputPath, objectName }) => {
	const input = workspacePath(inputPath);
	await assertInputFile(input);
	const output = await newOutputPath(outputPath);
	const result = await runBlender({ operation: 'remove_object', inputPath: input, outputPath: output, payload: { objectName } });
	return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

await mkdir(WORKSPACE, { recursive: true });
WORKSPACE_REAL = await realpath(WORKSPACE);
await server.connect(new StdioServerTransport());

process.on('SIGINT', () => { void server.close().finally(() => process.exit(0)); });
process.on('SIGTERM', () => { void server.close().finally(() => process.exit(0)); });

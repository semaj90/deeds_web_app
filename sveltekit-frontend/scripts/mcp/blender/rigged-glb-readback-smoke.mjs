import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
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
const relativeDir = `smoke/rigged-readback-${stamp}`;
const outputDir = path.join(workspace, relativeDir);
await mkdir(outputDir, { recursive: true });

const source = path.join(frontend, 'tests/fixtures/scene-studio/synthetic-rigged-textured-animation.glb');
const sourceCopy = path.join(outputDir, 'source.glb');
await copyFile(source, sourceCopy);
const sourceSha256 = createHash('sha256').update(await readFile(sourceCopy)).digest('hex');

const transport = new StdioClientTransport({
	command: process.execPath,
	args: [path.join(frontend, 'scripts/mcp/blender-model-mcp.mjs')],
	env: { ...process.env, BLENDER_EXECUTABLE: blender, BLENDER_MCP_WORKSPACE: workspace },
	stderr: 'pipe'
});
const client = new Client({ name: 'atlas-rigged-glb-readback-smoke', version: '1.0.0' });

function parseResult(result) {
	const text = result.content?.find((item) => item.type === 'text')?.text;
	assert.ok(text, 'Blender MCP returned no text result');
	const parsed = JSON.parse(text);
	assert.equal(parsed.isError, undefined);
	return parsed;
}

async function importAndAssert(inputPath, outputPath) {
	const result = parseResult(await client.callTool({
		name: 'blender_import_model',
		arguments: { inputPath, outputPath, maxTriangles: 100_000, maxGlbBytes: 8 * 1024 * 1024 }
	}, undefined, { timeout: 30_000, maxTotalTimeout: 35_000 }));
	assert.equal(result.meshObjectCount, 2);
	assert.equal(result.triangleCount, 136);
	assert.equal(result.boneCount, 2);
	assert.ok(!result.objects.some((object) => object.name === 'Icosphere'));
	return result;
}

try {
	await client.connect(transport);
	const first = await importAndAssert(`${relativeDir}/source.glb`, `${relativeDir}/first.blend`);
	const second = await importAndAssert(`${relativeDir}/first.glb`, `${relativeDir}/second.blend`);
	assert.equal(createHash('sha256').update(await readFile(sourceCopy)).digest('hex'), sourceSha256, 'source fixture changed');
	process.stdout.write(`${JSON.stringify({
		status: 'PASS',
		provenance: 'SYNTHETIC_LOCAL_FIXTURE',
		sourceSha256,
		firstImport: { meshObjectCount: first.meshObjectCount, triangleCount: first.triangleCount, boneCount: first.boneCount, containsIcosphereHelper: false, outputGlbSha256: first.glbSha256 },
		independentReadback: { meshObjectCount: second.meshObjectCount, triangleCount: second.triangleCount, boneCount: second.boneCount, containsIcosphereHelper: false, outputGlbSha256: second.glbSha256 },
		sourceUnchanged: true,
		outputDirectory: relativeDir
	}, null, 2)}\n`);
} finally {
	await client.close().catch(() => {});
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scriptDir, '../../..');
const repo = path.resolve(frontend, '..');
const workspace = path.resolve(process.env.BLENDER_MCP_WORKSPACE ?? path.join(repo, '.tmp/blender-mcp-workspace'));
const blender = process.env.BLENDER_EXECUTABLE ?? 'C:/Program Files/Blender Foundation/Blender 4.3/blender.exe';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const fixtureDir = path.join(workspace, 'smoke', `model-import-${stamp}`);
await mkdir(fixtureDir, { recursive: true });

const objPath = path.join(fixtureDir, 'synthetic-triangle.obj');
await writeFile(objPath, [
	'o SyntheticTriangle',
	'v 0 0 0',
	'v 1 0 0',
	'v 0 1 0',
	'f 1 2 3',
	''
].join('\n'), { flag: 'wx' });
const rejectedPath = path.join(fixtureDir, 'unsupported.txt');
await writeFile(rejectedPath, 'not a supported model format', { flag: 'wx' });

const fbxPath = path.join(fixtureDir, 'synthetic-cube.fbx');
const fbxScript = path.join(fixtureDir, 'create-synthetic-fbx.py');
await writeFile(fbxScript, [
	'import bpy',
	`bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))`,
	`bpy.context.object.name = "SyntheticImportCube"`,
	`bpy.ops.export_scene.fbx(filepath=${JSON.stringify(fbxPath)}, use_selection=True, bake_anim=False)`
].join('\n'), { flag: 'wx' });
execFileSync(blender, ['--background', '--factory-startup', '--python', fbxScript], { cwd: fixtureDir, stdio: 'pipe', windowsHide: true });

const animatedFbxPath = path.join(fixtureDir, 'synthetic-rig-animation.fbx');
const animatedFbxScript = path.join(fixtureDir, 'create-synthetic-animated-fbx.py');
await writeFile(animatedFbxScript, [
	'import bpy',
	'bpy.ops.object.armature_add(enter_editmode=True)',
	'arm = bpy.context.object',
	'arm.name = "SyntheticRig"',
	'bone = arm.data.edit_bones[0]',
	'bone.name = "root"',
	'bone.head = (0, 0, 0)',
	'bone.tail = (0, 0, 1)',
	'bpy.ops.object.mode_set(mode="OBJECT")',
	'bpy.ops.mesh.primitive_cube_add(size=0.25, location=(0, 0, 0.5))',
	'mesh = bpy.context.object',
	'mesh.name = "SyntheticSkinnedMesh"',
	'group = mesh.vertex_groups.new(name="root")',
	'group.add(list(range(len(mesh.data.vertices))), 1.0, "REPLACE")',
	'modifier = mesh.modifiers.new(name="Armature", type="ARMATURE")',
	'modifier.object = arm',
	'pose = arm.pose.bones["root"]',
	'pose.rotation_mode = "XYZ"',
	'bpy.context.scene.frame_start = 1',
	'bpy.context.scene.frame_end = 24',
	'for frame, angle in [(1, 0.0), (12, 0.55), (24, 0.0)]:',
	'    bpy.context.scene.frame_set(frame)',
	'    pose.rotation_euler[1] = angle',
	'    pose.keyframe_insert(data_path="rotation_euler", frame=frame, group="root")',
	'for action in bpy.data.actions:',
	'    action.name = "synthetic-wave"',
	'arm.select_set(True)',
	'mesh.select_set(True)',
	'bpy.context.view_layer.objects.active = arm',
	`bpy.ops.export_scene.fbx(filepath=${JSON.stringify(animatedFbxPath)}, use_selection=True, add_leaf_bones=False, bake_anim=True, bake_anim_use_all_bones=True)`
].join('\n'), { flag: 'wx' });
execFileSync(blender, ['--background', '--factory-startup', '--python', animatedFbxScript], { cwd: fixtureDir, stdio: 'pipe', windowsHide: true });

const glbPath = path.join(fixtureDir, 'walk_normal.glb');
await copyFile(path.join(frontend, 'static/models/courtroom/walk_normal.glb'), glbPath);

const sources = [objPath, fbxPath, animatedFbxPath, glbPath];
const sourceHashes = new Map(await Promise.all(sources.map(async (file) => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
const transport = new StdioClientTransport({
	command: process.execPath,
	args: [path.join(frontend, 'scripts/mcp/blender-model-mcp.mjs')],
	cwd: frontend,
	env: { ...process.env, BLENDER_EXECUTABLE: blender, BLENDER_MCP_WORKSPACE: workspace }
});
const client = new Client({ name: 'parent-atlas-model-import-smoke', version: '1.0.0' }, { capabilities: {} });

function resultJson(result) {
	assert.notEqual(result.isError, true, result.content?.map((item) => item.text ?? '').join('\n'));
	const text = result.content?.find((item) => item.type === 'text')?.text;
	assert.ok(text, 'MCP tool returned no text receipt');
	return JSON.parse(text);
}

try {
	await client.connect(transport);
	const tools = await client.listTools();
	assert.ok(tools.tools.some((tool) => tool.name === 'blender_import_model'));
	const rejected = await client.callTool({ name: 'blender_import_model', arguments: { inputPath: path.relative(workspace, rejectedPath).split(path.sep).join('/'), outputPath: `smoke/model-import-${stamp}/rejected.blend` } });
	assert.equal(rejected.isError, true, 'unsupported formats must be rejected at the MCP boundary');
	const receipts = [];
	for (const [index, source] of sources.entries()) {
		const relativeInput = path.relative(workspace, source).split(path.sep).join('/');
		const outputPath = `smoke/model-import-${stamp}/imported-${index}.blend`;
		const receipt = resultJson(await client.callTool({
			name: 'blender_import_model',
			arguments: { inputPath: relativeInput, outputPath, maxTriangles: 100_000, maxGlbBytes: 8 * 1024 * 1024 }
		}, undefined, { timeout: 130_000, maxTotalTimeout: 135_000 }));
		assert.equal(receipt.sourceFormat, path.extname(source).slice(1).toUpperCase());
		assert.ok(receipt.objectCount > 0);
		assert.ok(receipt.triangleCount > 0);
		assert.ok(receipt.exportedGlbBytes > 0);
		assert.match(receipt.glbSha256, /^[a-f0-9]{64}$/);
		assert.ok(['WITHIN_BUDGET', 'BUDGET_NOT_MET'].includes(receipt.byteTargetStatus));
		receipts.push({ format: receipt.sourceFormat, objectCount: receipt.objectCount, triangleCount: receipt.triangleCount, glbBytes: receipt.exportedGlbBytes, animationClipCount: receipt.animationClipCount, animationClipNames: receipt.animationClipNames, armatureCount: receipt.armatureCount, boneCount: receipt.boneCount, byteTargetStatus: receipt.byteTargetStatus, glbSha256: receipt.glbSha256 });
	}
	const animatedFbxReceipt = receipts.find((receipt) => receipt.format === 'FBX' && receipt.animationClipCount > 0);
	assert.ok(animatedFbxReceipt, 'synthetic animated FBX did not retain an animation clip');
	assert.ok(animatedFbxReceipt.armatureCount > 0 && animatedFbxReceipt.boneCount > 0, 'synthetic animated FBX did not retain its rig');
	const animatedReceipt = receipts.find((receipt) => receipt.format === 'GLB');
	assert.ok(animatedReceipt.animationClipCount > 0, 'source walk_normal.glb has no clips to round-trip');
	const roundTrip = resultJson(await client.callTool({
		name: 'blender_import_model',
		arguments: { inputPath: `smoke/model-import-${stamp}/imported-3.glb`, outputPath: `smoke/model-import-${stamp}/animated-readback.blend`, maxTriangles: 100_000, maxGlbBytes: 8 * 1024 * 1024 }
	}, undefined, { timeout: 130_000, maxTotalTimeout: 135_000 }));
	assert.ok(roundTrip.animationClipCount > 0, 'embedded animation clips did not survive GLB export and Blender re-import');
	const animatedFbxRoundTrip = resultJson(await client.callTool({
		name: 'blender_import_model',
		arguments: { inputPath: `smoke/model-import-${stamp}/imported-2.glb`, outputPath: `smoke/model-import-${stamp}/animated-fbx-readback.blend`, maxTriangles: 100_000, maxGlbBytes: 8 * 1024 * 1024 }
	}, undefined, { timeout: 130_000, maxTotalTimeout: 135_000 }));
	assert.ok(animatedFbxRoundTrip.animationClipCount > 0 && animatedFbxRoundTrip.armatureCount > 0 && animatedFbxRoundTrip.boneCount > 0, 'FBX rig/clip did not survive GLB export and Blender re-import');
	for (const source of sources) {
		assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'), sourceHashes.get(source), `source changed: ${source}`);
	}
	process.stdout.write(`${JSON.stringify({ status: 'PASS', provenance: 'SYNTHETIC_OBJ_STATIC_AND_ANIMATED_FBX_PLUS_REPOSITORY_LOCAL_GLB_FIXTURE', receipts, animatedGlbReadback: { animationClipCount: roundTrip.animationClipCount, animationClipNames: roundTrip.animationClipNames, armatureCount: roundTrip.armatureCount, boneCount: roundTrip.boneCount, triangleCount: roundTrip.triangleCount, glbSha256: roundTrip.glbSha256 }, animatedFbxReadback: { animationClipCount: animatedFbxRoundTrip.animationClipCount, animationClipNames: animatedFbxRoundTrip.animationClipNames, armatureCount: animatedFbxRoundTrip.armatureCount, boneCount: animatedFbxRoundTrip.boneCount, triangleCount: animatedFbxRoundTrip.triangleCount, glbSha256: animatedFbxRoundTrip.glbSha256 }, sourceFilesUnchanged: true, outputDirectory: fixtureDir }, null, 2)}\n`);
} finally {
	await client.close().catch(() => {});
}

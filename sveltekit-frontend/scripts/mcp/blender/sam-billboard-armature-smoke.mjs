import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scriptDir, '../../..');
const repo = path.resolve(frontend, '..');
const workspace = path.resolve(process.env.BLENDER_MCP_WORKSPACE ?? path.join(repo, '.tmp/blender-mcp-workspace'));
const blender = process.env.BLENDER_EXECUTABLE ?? 'blender';

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(workspace, 'smoke', `sam-billboard-${stamp}`);
await mkdir(runDir, { recursive: true });

const pyScript = path.join(runDir, 'build-sam-billboard.py');
const glbOut = path.join(runDir, 'sam-billboard-rigged.glb');
const blendOut = path.join(runDir, 'sam-billboard.blend');
const statsJson = path.join(runDir, 'readback-stats.json');

const modelBridgePy = path.join(frontend, 'scripts/mcp/blender/model_bridge.py').replace(/\\/g, '/');

const runnerContent = `
import sys
import json
import os

# Import model_bridge directly
sys.path.insert(0, os.path.dirname('${modelBridgePy}'))
import model_bridge
import bpy

# Reset scene to blank
bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Test 2-Bone Gradient SAM Billboard
spec_billboard = {
    "name": "SAM_Evidence_Cutout",
    "primitive": "sam_billboard",
    "scale": [1.2, 1.0, 1.8],
    "location": [0.0, 0.0, 0.0],
    "rotationQuaternion": [0.0, 0.0, 0.0, 1.0],
    "color": [0.85, 0.35, 0.25, 1.0],
    "boneId": "cutout_root",
    "rigMode": "gradient_2bone",
    "metadata": {
        "exhibitId": "E-002",
        "label": "Footprint Decal Billboard"
    }
}

spec_armature = {
    "bones": [
        {"boneId": "cutout_root", "parentBoneId": None, "head": [0.0, 0.0, 0.0], "tail": [0.0, 0.0, 0.2]},
        {"boneId": "cutout_sway", "parentBoneId": "cutout_root", "head": [0.0, 0.0, 0.2], "tail": [0.0, 0.0, 1.8]}
    ]
}

billboard_obj = model_bridge.create_object(spec_billboard)
armature_obj = model_bridge.create_skeleton(spec_armature)
bound_count = model_bridge.bind_objects_to_skeleton([billboard_obj], armature_obj)

# Validate Blender scene objects
mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
arm_objs = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']

assert len(mesh_objs) == 1, f"Expected 1 mesh, found {len(mesh_objs)}"
assert len(arm_objs) == 1, f"Expected 1 armature, found {len(arm_objs)}"
assert bound_count == 1, f"Expected 1 bound object, found {bound_count}"

mesh = mesh_objs[0]
arm = arm_objs[0]

# Verify bone names and count
assert len(arm.data.bones) == 2, f"Expected 2 bones, found {len(arm.data.bones)}"
assert arm.data.bones[0].name == "cutout_root"
assert arm.data.bones[1].name == "cutout_sway"

# Verify vertex groups and weights
assert len(mesh.vertex_groups) == 2, f"Expected 2 vertex groups, found {len(mesh.vertex_groups)}"
vg_root = mesh.vertex_groups.get("cutout_root")
vg_sway = mesh.vertex_groups.get("cutout_sway")
assert vg_root is not None and vg_sway is not None, "Vertex groups missing"

# Check vertex count (quad = 4 vertices, 2 loop triangles)
assert len(mesh.data.vertices) == 4, f"Expected 4 vertices, found {len(mesh.data.vertices)}"
mesh.data.calc_loop_triangles()
tri_count = len(mesh.data.loop_triangles)
assert tri_count == 2, f"Expected 2 triangles, found {tri_count}"

# Save .blend and export .glb
bpy.ops.wm.save_as_mainfile(filepath=r'${blendOut.replace(/\\/g, '/')}')
bpy.ops.export_scene.gltf(
    filepath=r'${glbOut.replace(/\\/g, '/')}',
    export_format='GLB',
    use_selection=False,
    export_extras=True,
    export_animations=True
)

stats = {
    "status": "PASS",
    "meshName": mesh.name,
    "vertexCount": len(mesh.data.vertices),
    "triangleCount": tri_count,
    "boneCount": len(arm.data.bones),
    "boneNames": [b.name for b in arm.data.bones],
    "vertexGroups": [vg.name for vg in mesh.vertex_groups],
    "rigMode": "gradient_2bone",
    "blendFile": r'${blendOut.replace(/\\/g, '/')}',
    "glbFile": r'${glbOut.replace(/\\/g, '/')}'
}

with open(r'${statsJson.replace(/\\/g, '/')}', 'w') as f:
    json.dump(stats, f, indent=2)

print("SAM_BILLBOARD_BLENDER_SMOKE_SUCCESS")
`;

await writeFile(pyScript, runnerContent, 'utf-8');

try {
	const stdout = execFileSync(blender, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', pyScript], {
		cwd: runDir,
		stdio: 'pipe',
		windowsHide: true,
		encoding: 'utf-8'
	});

	assert.ok(stdout.includes('SAM_BILLBOARD_BLENDER_SMOKE_SUCCESS'), 'Blender output did not signal success');
	const statsRaw = await readFile(statsJson, 'utf-8');
	const stats = JSON.parse(statsRaw);

	assert.equal(stats.status, 'PASS');
	assert.equal(stats.vertexCount, 4);
	assert.equal(stats.triangleCount, 2);
	assert.equal(stats.boneCount, 2);
	assert.deepEqual(stats.boneNames, ['cutout_root', 'cutout_sway']);
	assert.deepEqual(stats.vertexGroups, ['cutout_root', 'cutout_sway']);

	process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
} catch (err) {
	if (err.stdout) console.error('STDOUT:', err.stdout);
	if (err.stderr) console.error('STDERR:', err.stderr);
	throw err;
}

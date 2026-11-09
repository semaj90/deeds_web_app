#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const smokePath = path.join(root, 'sveltekit-frontend/scripts/mcp/blender/sam-billboard-armature-smoke.mjs');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = path.join(root, `.tmp/atlas/blender-primitive-rig-v1-${stamp}.json`);

function runSmoke() {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [smokePath], {
			cwd: root,
			env: process.env,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		const stdout = [];
		const stderr = [];
		let outputBytes = 0;
		child.stdout.on('data', (chunk) => {
			outputBytes += chunk.length;
			if (outputBytes <= 256 * 1024) stdout.push(chunk);
		});
		child.stderr.on('data', (chunk) => stderr.push(chunk));
		child.once('error', reject);
		child.once('close', (code) => {
			if (outputBytes > 256 * 1024) {
				reject(new Error('Blender primitive smoke output exceeded the 256 KiB bound.'));
			} else if (code !== 0) {
				reject(new Error(`Blender primitive smoke exited with code ${code}.\n${Buffer.concat(stderr).toString('utf8')}`));
			} else {
				try {
					resolve(JSON.parse(Buffer.concat(stdout).toString('utf8')));
				} catch (error) {
					reject(error);
				}
			}
		});
	});
}

try {
	const result = await runSmoke();
	if (result.status !== 'PASS') throw new Error(`Unexpected Blender status: ${result.status}`);
	if (result.vertexCount !== 4 || result.triangleCount !== 2 || result.boneCount !== 2) {
		throw new Error('Generated billboard geometry or armature inventory differs from the fixture contract.');
	}
	if (result.rigMode !== 'gradient_2bone' || result.boneNames.join(',') !== 'cutout_root,cutout_sway') {
		throw new Error('Generated armature/weight mode differs from the fixture contract.');
	}
	const outputRoot = path.resolve(root, '.tmp/blender-mcp-workspace');
	const blendPath = path.resolve(result.blendFile);
	const glbPath = path.resolve(result.glbFile);
	for (const outputPath of [blendPath, glbPath]) {
		if (!outputPath.startsWith(`${outputRoot}${path.sep}`)) {
			throw new Error('Blender output escaped the isolated MCP workspace.');
		}
	}
	const [blendStat, glbBytes] = await Promise.all([stat(blendPath), readFile(glbPath)]);
	if (glbBytes.byteLength > 8 * 1024 * 1024) throw new Error('Primitive rig GLB exceeded the 8 MiB target.');
	if (glbBytes.subarray(0, 4).toString('ascii') !== 'glTF') throw new Error('Blender output is not a binary GLB.');
	const report = {
		schema: 'parent-atlas.blender-primitive-rig-verification.v1',
		status: 'PASS',
		createdAt: new Date().toISOString(),
		canonicalAuthority: false,
		command: 'node sveltekit-frontend/scripts/mcp/blender/sam-billboard-armature-smoke.mjs',
		primitive: {
			name: result.meshName,
			vertices: result.vertexCount,
			triangles: result.triangleCount,
			weighting: result.rigMode,
			boneNames: result.boneNames,
			vertexGroups: result.vertexGroups
		},
		outputs: {
			blendBytes: blendStat.size,
			glbBytes: glbBytes.byteLength,
			glbSha256: createHash('sha256').update(glbBytes).digest('hex'),
			glbPath: path.relative(root, glbPath)
		},
		provenance: 'SYNTHETIC_LOCAL_PRIMITIVE_RIG_FIXTURE'
	};
	await mkdir(path.dirname(reportPath), { recursive: true });
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
	process.stdout.write(`${JSON.stringify({ status: report.status, reportPath: path.relative(root, reportPath), vertices: result.vertexCount, triangles: result.triangleCount, bones: result.boneNames, glbBytes: glbBytes.byteLength }, null, 2)}\n`);
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}

#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const smokeScript = path.join(
	repoRoot,
	'sveltekit-frontend/scripts/mcp/blender/import-model-smoke.mjs'
);
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = path.join(repoRoot, `.tmp/atlas/blender-mcp-scene-pipeline-v1-${runStamp}.json`);
const maxOutputBytes = 2 * 1024 * 1024;

function runSmoke() {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [smokeScript], {
			cwd: repoRoot,
			env: process.env,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		const stdout = [];
		const stderr = [];
		let outputBytes = 0;
		let settled = false;
		let outputLimitError = false;

		function collect(target, chunk) {
			outputBytes += chunk.length;
			if (outputBytes > maxOutputBytes) {
				outputLimitError = true;
				return;
			}
			target.push(chunk);
		}
		function finish(error, value) {
			if (settled) return;
			settled = true;
			if (error) reject(error);
			else resolve(value);
		}

		child.stdout.on('data', (chunk) => collect(stdout, chunk));
		child.stderr.on('data', (chunk) => collect(stderr, chunk));
		child.once('error', (error) => finish(error));
		child.once('close', (code, signal) => {
			if (outputLimitError) {
				finish(new Error('Blender MCP smoke output exceeded the 2 MiB verifier limit.'));
				return;
			}
			if (code !== 0) {
				finish(new Error(
					`Blender MCP smoke exited with code ${code ?? 'null'}${signal ? ` (${signal})` : ''}.\n${Buffer.concat(stderr).toString('utf8')}`
				));
				return;
			}
			finish(null, {
				stdout: Buffer.concat(stdout).toString('utf8'),
				stderr: Buffer.concat(stderr).toString('utf8')
			});
		});
	});
}

function parseSmokeReceipt(stdout) {
	const start = stdout.indexOf('{');
	const end = stdout.lastIndexOf('}');
	if (start < 0 || end <= start) throw new Error('Blender MCP smoke emitted no JSON receipt.');
	return JSON.parse(stdout.slice(start, end + 1));
}

function validateSmokeReceipt(result) {
	if (result.status !== 'PASS') throw new Error(`Unexpected smoke status: ${result.status}`);
	if (result.sourceFilesUnchanged !== true) throw new Error('Smoke did not confirm source files remained unchanged.');
	if (result.provenance !== 'SYNTHETIC_OBJ_STATIC_AND_ANIMATED_FBX_PLUS_REPOSITORY_LOCAL_GLB_FIXTURES') {
		throw new Error('Smoke provenance is not the expected local synthetic/fixture scope.');
	}
	if (!Array.isArray(result.receipts) || result.receipts.length !== 4) {
		throw new Error('Expected exactly four OBJ/FBX/GLB source import receipts.');
	}
	const formats = result.receipts.map((receipt) => receipt.format);
	if (formats.join(',') !== 'OBJ,FBX,FBX,GLB') throw new Error(`Unexpected input format order: ${formats.join(',')}`);
	for (const receipt of result.receipts) {
		if (!Number.isInteger(receipt.triangleCount) || receipt.triangleCount < 1 || receipt.triangleCount > 100_000) {
			throw new Error(`Invalid or over-budget triangle count for ${receipt.format}.`);
		}
		if (!Number.isInteger(receipt.glbBytes) || receipt.glbBytes < 1 || receipt.glbBytes > 8 * 1024 * 1024) {
			throw new Error(`Invalid or over-budget GLB size for ${receipt.format}.`);
		}
		if (!/^[a-f0-9]{64}$/.test(receipt.glbSha256)) throw new Error(`Invalid GLB hash for ${receipt.format}.`);
	}
	const animatedFbx = result.receipts[2];
	if (animatedFbx.animationClipCount < 1 || animatedFbx.armatureCount < 1 || animatedFbx.boneCount < 1) {
		throw new Error('Synthetic animated FBX lost its animation or skeleton during conversion.');
	}
	if (result.animatedGlbReadback?.animationClipCount < 1 || result.animatedGlbReadback?.boneCount < 1) {
		throw new Error('Repository GLB animation/skeleton did not survive Blender readback.');
	}
	if (result.animatedFbxReadback?.animationClipCount < 1 || result.animatedFbxReadback?.boneCount < 1) {
		throw new Error('Synthetic FBX animation/skeleton did not survive GLB-to-Blender readback.');
	}
}

const startedAt = new Date().toISOString();
try {
	const processOutput = await runSmoke();
	const smoke = parseSmokeReceipt(processOutput.stdout);
	validateSmokeReceipt(smoke);
	const report = {
		schema: 'parent-atlas.blender-mcp-scene-pipeline-verification.v1',
		status: 'PASS',
		startedAt,
		completedAt: new Date().toISOString(),
		canonicalAuthority: false,
		command: 'node sveltekit-frontend/scripts/mcp/blender/import-model-smoke.mjs',
		browserRetargetProof: 'Run separately with the focused Playwright Mixamo retarget test.',
		smoke
	};
	await mkdir(path.dirname(reportPath), { recursive: true });
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
	process.stdout.write(`${JSON.stringify({ status: report.status, reportPath: path.relative(repoRoot, reportPath), inputCount: smoke.receipts.length, animatedGlbClips: smoke.animatedGlbReadback.animationClipCount, animatedGlbBones: smoke.animatedGlbReadback.boneCount, sourceFilesUnchanged: smoke.sourceFilesUnchanged }, null, 2)}\n`);
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}

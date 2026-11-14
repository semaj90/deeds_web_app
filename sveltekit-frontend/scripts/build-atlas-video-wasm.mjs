import { spawnSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const manifestPath = path.join(repoRoot, 'packages', 'atlas-video-wasm', 'Cargo.toml');
const targetDir = process.env.ATLAS_VIDEO_WASM_TARGET_DIR
	? path.resolve(process.env.ATLAS_VIDEO_WASM_TARGET_DIR)
	: path.join(frontendRoot, '.tmp', 'atlas-video-wasm-target');
const outputPath = path.join(targetDir, 'wasm32-unknown-unknown', 'release', 'atlas_video_wasm.wasm');
const staticDir = path.join(frontendRoot, 'static', 'wasm');

const result = spawnSync(
	'cargo',
	['build', '--manifest-path', manifestPath, '--target', 'wasm32-unknown-unknown', '--release', '--target-dir', targetDir],
	{ cwd: repoRoot, stdio: 'inherit', shell: false, env: process.env }
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

await mkdir(staticDir, { recursive: true });
await copyFile(outputPath, path.join(staticDir, 'atlas-video-wasm.wasm'));
const smokeResult = spawnSync('node', [path.join(frontendRoot, 'scripts', 'smoke-atlas-video-wasm.mjs')], {
	cwd: frontendRoot,
	stdio: 'inherit',
	shell: false,
	env: process.env
});
if (smokeResult.error) throw smokeResult.error;
if (smokeResult.status !== 0) process.exit(smokeResult.status ?? 1);
process.stdout.write(`atlas_video_wasm_build=PASS artifact=/wasm/atlas-video-wasm.wasm targetDir=${targetDir}\n`);

import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function listFiles(root, current = root) {
	const entries = await readdir(current, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const fullPath = path.join(current, entry.name);
		if (entry.isSymbolicLink()) continue;
		if (entry.isDirectory()) files.push(...await listFiles(root, fullPath));
		else if (entry.isFile()) files.push(fullPath);
	}
	return files;
}

export async function buildGemma4BrowserArtifactInventoryV1({ root, transformersModelId, litertModelId }) {
	if (!root || !transformersModelId || !litertModelId) throw new Error('INVENTORY_INPUT_REQUIRED');
	const rootPath = path.resolve(root);
	const rootStat = await lstat(rootPath);
	if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('MODEL_ROOT_NOT_DIRECTORY');
	const files = (await listFiles(rootPath)).sort((left, right) =>
		path.relative(rootPath, left).replaceAll('\\', '/') < path.relative(rootPath, right).replaceAll('\\', '/') ? -1 :
			path.relative(rootPath, left).replaceAll('\\', '/') > path.relative(rootPath, right).replaceAll('\\', '/') ? 1 : 0
	);
	const artifacts = [];
	for (const filePath of files) {
		const bytes = await readFile(filePath);
		artifacts.push({
			path: path.relative(rootPath, filePath).replaceAll('\\', '/'),
			bytes: bytes.length,
			sha256: sha256(bytes)
		});
	}
	const totalBytes = artifacts.reduce((total, artifact) => total + artifact.bytes, 0);
	const manifest = JSON.stringify(artifacts);
	return {
		schema: 'atlas.gemma4-browser-artifact-inventory.v1',
		modelFamily: 'Gemma 4 E2B',
		transformersJs: { modelId: transformersModelId, revision: null, revisionStatus: 'UNPINNED' },
		litert: { modelId: litertModelId, artifactVariant: null, revision: null, revisionStatus: 'UNPINNED' },
		localOnnx: {
			root: rootPath,
			files: artifacts,
			fileCount: artifacts.length,
			totalBytes,
			totalMiB: Number((totalBytes / 1024 ** 2).toFixed(2)),
			totalGiB: Number((totalBytes / 1024 ** 3).toFixed(3)),
			inventorySha256: sha256(manifest)
		},
		collectionMode: 'LOCAL_READ_ONLY_NO_DOWNLOAD_NO_MODEL_LOAD',
		canonicalAuthority: false,
		writesPerformed: false
	};
}

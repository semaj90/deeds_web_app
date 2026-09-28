import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function uniquePaths(paths) {
	return [...new Set(paths.filter((candidate) => typeof candidate === 'string' && candidate.length > 0))];
}

/** Shared by the application bridge and the read-only startup probe. */
export function bridgeCandidatePaths(cwd = process.cwd()) {
	const envOverride = process.env.TENSORRT_BRIDGE_NODE_PATH?.trim();
	const thisDir = dirname(fileURLToPath(import.meta.url));
	return uniquePaths([
		envOverride,
		resolve(thisDir, '../../../../../simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
		resolve(thisDir, '../../../../../../simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
		resolve(cwd, '../simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
		resolve(cwd, 'simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
		'C:/Users/james/Videos/deeds-web-app/simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node',
		resolve(thisDir, '../../../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
		resolve(thisDir, '../../../../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
		resolve(cwd, '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
		resolve(cwd, '../simd-bridge/cpp/build/tensorrt_bridge.node'),
		resolve(cwd, '../simd-bridge/build/Release/tensorrt_bridge.node'),
		resolve(cwd, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
		'C:/Users/james/Videos/deeds-web-app/simd-bridge/cpp/build/Release/tensorrt_bridge.node',
	]);
}

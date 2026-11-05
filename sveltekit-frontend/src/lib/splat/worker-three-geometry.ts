import type { BufferGeometry } from 'three';
import {
	createGaussianSplatGeometry,
	createPackedSphericalHarmonicsBand,
	SH_BAND_COMPONENTS,
	SH_C0,
	writeCovariance
} from 'three/addons/utils/GaussianSplatUtils.js';
import type { SpzDecodedPayload } from './spz-decode-core.js';

const MAX_THREE_SH_DEGREE = 3;

/**
 * Adapt worker-owned SPZ values to Three.js's packed GaussianSplat geometry.
 * SPZ decode stays in the worker; only covariance/color/packed-SH upload data
 * is prepared here. This intentionally rejects SH degree 4 because Three.js
 * GaussianSplat currently exposes packed bands only through degree 3.
 */
export function workerPayloadToGaussianGeometry(payload: SpzDecodedPayload): BufferGeometry {
	if (payload.shDegree > MAX_THREE_SH_DEGREE) {
		throw new Error(`THREE_SPZ_SH_DEGREE_UNSUPPORTED: ${payload.shDegree} > ${MAX_THREE_SH_DEGREE}`);
	}
	const count = payload.numPoints;
	if (payload.positions.length !== count * 3 || payload.scales.length !== count * 3 || payload.rotations.length !== count * 4 || payload.colors.length !== count * 3 || payload.alphas.length !== count) {
		throw new Error('THREE_SPZ_ATTRIBUTE_LENGTH_MISMATCH');
	}
	const covariances = new Float32Array(count * 6);
	const colorBytes = new Uint8ClampedArray(count * 4);
	const bands: Record<string, Uint32Array> = {};
	let sourceOffset = 0;
	for (let band = 1; band <= payload.shDegree; band++) {
		const packed = createPackedSphericalHarmonicsBand(count, band);
		bands[`sh${band}`] = packed.packed;
		const componentCount = SH_BAND_COMPONENTS[band]!;
		for (let point = 0; point < count; point++) {
			const source = point * payload.shCoeffs * 3 + sourceOffset;
			const target = point * packed.bytes.length / count;
			for (let component = 0; component < componentCount; component++) {
				packed.bytes[target + component] = payload.sh[source + component] * 128 + 128;
			}
		}
		sourceOffset += componentCount;
	}
	if (sourceOffset !== payload.shCoeffs * 3) throw new Error('THREE_SPZ_SH_COMPONENT_COUNT_MISMATCH');

	for (let point = 0; point < count; point++) {
		const p3 = point * 3;
		const p4 = point * 4;
		const p6 = point * 6;
		writeCovariance(
			covariances,
			p6,
			Math.exp(payload.scales[p3]),
			Math.exp(payload.scales[p3 + 1]),
			Math.exp(payload.scales[p3 + 2]),
			payload.rotations[p4],
			payload.rotations[p4 + 1],
			payload.rotations[p4 + 2],
			payload.rotations[p4 + 3]
		);
		colorBytes[p4] = (payload.colors[p3] * SH_C0 + 0.5) * 255;
		colorBytes[p4 + 1] = (payload.colors[p3 + 1] * SH_C0 + 0.5) * 255;
		colorBytes[p4 + 2] = (payload.colors[p3 + 2] * SH_C0 + 0.5) * 255;
		colorBytes[p4 + 3] = (1 / (1 + Math.exp(-payload.alphas[point]))) * 255;
	}
	return createGaussianSplatGeometry(payload.positions, covariances, colorBytes, bands);
}

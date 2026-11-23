import type { BufferAttribute, InterleavedBufferAttribute, InstancedMesh, Mesh, Object3D } from 'three';

/** Count retained attribute backing stores once, even when several meshes share them. */
export function countSceneGeometryBufferBytesV1(root: Object3D): number {
	const geometries = new Set<Mesh['geometry']>();
	const buffers = new Set<ArrayBufferLike>();
	const include = (attribute: BufferAttribute | InterleavedBufferAttribute | null | undefined) => {
		if (!attribute) return;
		const array = 'data' in attribute ? attribute.data.array : attribute.array;
		buffers.add(array.buffer);
	};
	root.traverse((object) => {
		const mesh = object as Mesh;
		if (!mesh.isMesh) return;
		const geometry = mesh.geometry;
		if (!geometries.has(geometry)) {
			geometries.add(geometry);
			include(geometry.index);
			for (const attribute of Object.values(geometry.attributes)) include(attribute);
			for (const attributes of Object.values(geometry.morphAttributes)) {
				for (const attribute of attributes ?? []) include(attribute);
			}
		}
		const instanced = mesh as InstancedMesh;
		if (instanced.isInstancedMesh) {
			include(instanced.instanceMatrix);
			include(instanced.instanceColor);
		}
	});
	let bytes = 0;
	for (const buffer of buffers) bytes += buffer.byteLength;
	return bytes;
}

/** Bounded rolling samples. Sorting and allocation happen only when the panel samples. */
export function createScenePreviewSamplesV1(capacity = 120) {
	const samples = new Float64Array(capacity);
	let cursor = 0;
	let size = 0;
	return {
		add(value: number) {
			if (!Number.isFinite(value) || value <= 0) return;
			samples[cursor] = value;
			cursor = (cursor + 1) % capacity;
			size = Math.min(size + 1, capacity);
		},
		p95(): number | null {
			if (!size) return null;
			const sorted = samples.slice(0, size).sort();
			return sorted[Math.ceil(size * 0.95) - 1] ?? null;
		}
	};
}

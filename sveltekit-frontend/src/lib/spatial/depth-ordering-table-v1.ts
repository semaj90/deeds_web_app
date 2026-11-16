import { TRANSFORM_CAPACITY } from '../n64-fsm/scene-fsm-cache.js';

/** Bounded painter-order bins for render references; no mesh or evidence data is moved. */
export const DEPTH_ORDERING_BUCKET_COUNT_V1 = 64;
const END_OF_CHAIN = 0xffff;

/**
 * Stable PS1-inspired ordering table for at most the existing 256 scene slots.
 * Depth is a positive camera-forward distance in scene units. Entries behind
 * the camera, before the near plane, or beyond the far plane are omitted.
 * The output is far-to-near for painter-style/transparent passes; leave normal
 * opaque Three.js depth testing and sorting unchanged.
 */
export class DepthOrderingTableV1 {
	readonly order = new Uint16Array(TRANSFORM_CAPACITY);
	readonly bucketHeads = new Uint16Array(DEPTH_ORDERING_BUCKET_COUNT_V1);
	readonly bucketTails = new Uint16Array(DEPTH_ORDERING_BUCKET_COUNT_V1);
	readonly nextSlot = new Uint16Array(TRANSFORM_CAPACITY);
	/** Two words encode which of the 64 bins are non-empty. */
	readonly nonEmptyBuckets = new Uint32Array(2);
	count = 0;

	constructor() {
		this.bucketHeads.fill(END_OF_CHAIN);
		this.bucketTails.fill(END_OF_CHAIN);
		this.nextSlot.fill(END_OF_CHAIN);
	}

	/**
	 * Build a stable far-to-near slot permutation using an LSB0 256-bit mask.
	 * The returned subarray is a view into reusable storage and is valid until
	 * the next call to build().
	 */
	build(
		cameraDepth: Float32Array,
		activeMask: Uint32Array,
		farDistance: number,
		nearDistance = 0
	): Uint16Array {
		if (cameraDepth.length !== TRANSFORM_CAPACITY || activeMask.length !== TRANSFORM_CAPACITY / 32) {
			throw new RangeError(`Depth ordering requires ${TRANSFORM_CAPACITY} depths and an 8-word visibility mask.`);
		}
		if (!Number.isFinite(nearDistance) || nearDistance < 0 || !Number.isFinite(farDistance) || farDistance <= nearDistance) {
			throw new RangeError('Depth ordering requires finite planes where 0 <= nearDistance < farDistance.');
		}

		this.count = 0;
		this.bucketHeads.fill(END_OF_CHAIN);
		this.bucketTails.fill(END_OF_CHAIN);
		this.nextSlot.fill(END_OF_CHAIN);
		this.nonEmptyBuckets.fill(0);

		const depthRange = farDistance - nearDistance;
		for (let slot = 0; slot < TRANSFORM_CAPACITY; slot++) {
			const bit = 1 << (slot & 31);
			if ((activeMask[slot >>> 5] & bit) === 0) continue;

			const depth = cameraDepth[slot];
			if (!Number.isFinite(depth)) throw new RangeError(`Active slot ${slot} has non-finite camera depth.`);
			if (depth <= 0 || depth < nearDistance || depth > farDistance) continue;

			const bucket = Math.min(
				DEPTH_ORDERING_BUCKET_COUNT_V1 - 1,
				Math.floor(((depth - nearDistance) / depthRange) * DEPTH_ORDERING_BUCKET_COUNT_V1)
			);
			if (this.bucketHeads[bucket] === END_OF_CHAIN) {
				this.bucketHeads[bucket] = slot;
			} else {
				this.nextSlot[this.bucketTails[bucket]] = slot;
			}
			this.bucketTails[bucket] = slot;
			this.nonEmptyBuckets[bucket >>> 5] |= 1 << (bucket & 31);
		}

		let count = 0;
		for (let bucket = DEPTH_ORDERING_BUCKET_COUNT_V1 - 1; bucket >= 0; bucket--) {
			if ((this.nonEmptyBuckets[bucket >>> 5] & (1 << (bucket & 31))) === 0) continue;
			let slot = this.bucketHeads[bucket];
			while (slot !== END_OF_CHAIN) {
				this.order[count++] = slot;
				slot = this.nextSlot[slot];
			}
		}
		this.count = count;
		return this.order.subarray(0, count);
	}
}

import type { ScenePrimitiveManager, ScenePrimitiveType } from './scene-primitive-sync.js';

/** Compact derived transport for tile-local transforms. Never canonical identity or geometry. */
export const SCENE_PRIMITIVE_PACKET_MAGIC_V1 = 0x41545052; // little-endian bytes "RPTA"
export const SCENE_PRIMITIVE_PACKET_VERSION_V1 = 1;
export const SCENE_PRIMITIVE_PACKET_HEADER_BYTES_V1 = 12;
export const SCENE_PRIMITIVE_PACKET_INSTANCE_BYTES_V1 = 32;
export const SCENE_PRIMITIVE_PACKET_MAX_BYTES_V1 = 1024 * 1024;
export const SCENE_PRIMITIVE_PACKET_MAX_INSTANCES_V1 = Math.floor(
	(SCENE_PRIMITIVE_PACKET_MAX_BYTES_V1 - SCENE_PRIMITIVE_PACKET_HEADER_BYTES_V1) / SCENE_PRIMITIVE_PACKET_INSTANCE_BYTES_V1
);
const PARENT_NONE = 0xffff_ffff;
const TWO_PI = Math.PI * 2;

export type Vec3V1 = readonly [number, number, number];
export interface ScenePrimitivePacketRecordV1 {
	objectId: number;
	kindId: number;
	materialId: number;
	positionMeters: Vec3V1;
	dimensionsMeters: Vec3V1;
	yawRadians?: number;
	flags?: number;
	parentObjectId?: number | null;
}
export interface DecodedScenePrimitivePacketRecordV1 extends Required<Omit<ScenePrimitivePacketRecordV1, 'parentObjectId'>> {
	parentObjectId: number | null;
}
export type PrimitiveLodV1 = 'detailed' | 'balanced' | 'retro';

function integer(value: number, min: number, max: number, name: string): number {
	if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer in [${min},${max}]`);
	return value;
}
function finite(value: number, name: string): number {
	if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
	return value;
}
function quantizeSignedCentimeters(value: number, name: string): number {
	return integer(Math.round(finite(value, name) * 100), -32768, 32767, name);
}
function quantizeUnsignedCentimeters(value: number, name: string): number {
	return integer(Math.round(finite(value, name) * 100), 0, 65535, name);
}
function validateVector(value: Vec3V1, name: string): void {
	if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${name} must contain three values`);
	value.forEach((entry, index) => finite(entry, `${name}[${index}]`));
}

/** Encode tile-local positions, dimensions, and yaw. Geometry and provenance live elsewhere. */
export function encodeScenePrimitivePacketV1(records: readonly ScenePrimitivePacketRecordV1[]): Uint8Array {
	if (!Array.isArray(records)) throw new TypeError('records must be an array');
	if (records.length > SCENE_PRIMITIVE_PACKET_MAX_INSTANCES_V1) throw new RangeError('SCENE_PRIMITIVE_PACKET_BYTE_LIMIT_EXCEEDED');
	const output = new ArrayBuffer(SCENE_PRIMITIVE_PACKET_HEADER_BYTES_V1 + records.length * SCENE_PRIMITIVE_PACKET_INSTANCE_BYTES_V1);
	const view = new DataView(output);
	view.setUint32(0, SCENE_PRIMITIVE_PACKET_MAGIC_V1, true);
	view.setUint16(4, SCENE_PRIMITIVE_PACKET_VERSION_V1, true);
	view.setUint16(6, SCENE_PRIMITIVE_PACKET_INSTANCE_BYTES_V1, true);
	view.setUint32(8, records.length, true);
	const ids = new Set<number>();
	for (const [index, record] of records.entries()) {
		const objectId = integer(record.objectId, 1, 0xffff_fffe, `records[${index}].objectId`);
		if (ids.has(objectId)) throw new Error('SCENE_PRIMITIVE_PACKET_DUPLICATE_OBJECT_ID');
		ids.add(objectId);
		integer(record.kindId, 0, 0xffff, `records[${index}].kindId`);
		integer(record.materialId, 0, 0xffff, `records[${index}].materialId`);
		validateVector(record.positionMeters, `records[${index}].positionMeters`);
		validateVector(record.dimensionsMeters, `records[${index}].dimensionsMeters`);
		const parentId = record.parentObjectId ?? null;
		if (parentId !== null) integer(parentId, 1, 0xffff_fffe, `records[${index}].parentObjectId`);
		if (parentId === objectId) throw new Error('SCENE_PRIMITIVE_PACKET_SELF_PARENT');
		const offset = SCENE_PRIMITIVE_PACKET_HEADER_BYTES_V1 + index * SCENE_PRIMITIVE_PACKET_INSTANCE_BYTES_V1;
		view.setUint32(offset, objectId, true);
		view.setUint16(offset + 4, record.kindId, true);
		view.setUint16(offset + 6, record.materialId, true);
		for (let axis = 0; axis < 3; axis++) view.setInt16(offset + 8 + axis * 2, quantizeSignedCentimeters(record.positionMeters[axis]!, `positionMeters[${axis}]`), true);
		for (let axis = 0; axis < 3; axis++) view.setUint16(offset + 14 + axis * 2, quantizeUnsignedCentimeters(record.dimensionsMeters[axis]!, `dimensionsMeters[${axis}]`), true);
		const yaw = ((finite(record.yawRadians ?? 0, 'yawRadians') % TWO_PI) + TWO_PI) % TWO_PI;
		view.setUint16(offset + 20, Math.round(yaw / TWO_PI * 65535) % 65536, true);
		view.setUint16(offset + 22, integer(record.flags ?? 0, 0, 0xffff, 'flags'), true);
		view.setUint32(offset + 24, parentId ?? PARENT_NONE, true);
		view.setUint32(offset + 28, 0, true);
	}
	return new Uint8Array(output);
}

/** Decode and validate exact packet length, IDs, reserved bytes and parent references. */
export function decodeScenePrimitivePacketV1(bytes: Uint8Array): DecodedScenePrimitivePacketRecordV1[] {
	if (!(bytes instanceof Uint8Array) || bytes.byteLength < SCENE_PRIMITIVE_PACKET_HEADER_BYTES_V1 || bytes.byteLength > SCENE_PRIMITIVE_PACKET_MAX_BYTES_V1) throw new RangeError('SCENE_PRIMITIVE_PACKET_LENGTH_INVALID');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== SCENE_PRIMITIVE_PACKET_MAGIC_V1) throw new Error('SCENE_PRIMITIVE_PACKET_MAGIC_INVALID');
	if (view.getUint16(4, true) !== SCENE_PRIMITIVE_PACKET_VERSION_V1) throw new Error('SCENE_PRIMITIVE_PACKET_VERSION_UNSUPPORTED');
	if (view.getUint16(6, true) !== SCENE_PRIMITIVE_PACKET_INSTANCE_BYTES_V1) throw new Error('SCENE_PRIMITIVE_PACKET_STRIDE_UNSUPPORTED');
	const count = view.getUint32(8, true);
	if (count > SCENE_PRIMITIVE_PACKET_MAX_INSTANCES_V1 || SCENE_PRIMITIVE_PACKET_HEADER_BYTES_V1 + count * SCENE_PRIMITIVE_PACKET_INSTANCE_BYTES_V1 !== bytes.byteLength) throw new Error('SCENE_PRIMITIVE_PACKET_PAYLOAD_INVALID');
	const records: DecodedScenePrimitivePacketRecordV1[] = [];
	const ids = new Set<number>();
	for (let index = 0; index < count; index++) {
		const offset = SCENE_PRIMITIVE_PACKET_HEADER_BYTES_V1 + index * SCENE_PRIMITIVE_PACKET_INSTANCE_BYTES_V1;
		if (view.getUint32(offset + 28, true) !== 0) throw new Error('SCENE_PRIMITIVE_PACKET_RESERVED_BITS_NONZERO');
		const objectId = view.getUint32(offset, true);
		if (objectId === 0 || objectId === PARENT_NONE || ids.has(objectId)) throw new Error('SCENE_PRIMITIVE_PACKET_OBJECT_ID_INVALID');
		ids.add(objectId);
		const parent = view.getUint32(offset + 24, true);
		const yawRadians = view.getUint16(offset + 20, true) / 65535 * TWO_PI;
		records.push({
			objectId, kindId: view.getUint16(offset + 4, true), materialId: view.getUint16(offset + 6, true),
			positionMeters: [view.getInt16(offset + 8, true) / 100, view.getInt16(offset + 10, true) / 100, view.getInt16(offset + 12, true) / 100],
			dimensionsMeters: [view.getUint16(offset + 14, true) / 100, view.getUint16(offset + 16, true) / 100, view.getUint16(offset + 18, true) / 100],
			yawRadians, flags: view.getUint16(offset + 22, true), parentObjectId: parent === PARENT_NONE ? null : parent
		});
	}
	for (const record of records) if (record.parentObjectId !== null && !ids.has(record.parentObjectId)) throw new Error('SCENE_PRIMITIVE_PACKET_PARENT_MISSING');
	return records;
}

/** Stable 2D Morton key for signed int16 tile coordinates. */
export function mortonTileKeyV1(tileX: number, tileZ: number): number {
	integer(tileX, -32768, 32767, 'tileX'); integer(tileZ, -32768, 32767, 'tileZ');
	const zigzagX = tileX < 0 ? -2 * tileX - 1 : 2 * tileX;
	const zigzagZ = tileZ < 0 ? -2 * tileZ - 1 : 2 * tileZ;
	let result = 0;
	for (let bit = 0; bit < 16; bit++) {
		result |= ((zigzagX >>> bit) & 1) << (bit * 2);
		result |= ((zigzagZ >>> bit) & 1) << (bit * 2 + 1);
	}
	return result >>> 0;
}

export function tileForWorldPositionV1(xMeters: number, zMeters: number, tileSizeMeters = 16): [number, number] {
	if (finite(tileSizeMeters, 'tileSizeMeters') <= 0) throw new RangeError('tileSizeMeters must be positive');
	return [Math.floor(finite(xMeters, 'xMeters') / tileSizeMeters), Math.floor(finite(zMeters, 'zMeters') / tileSizeMeters)];
}

/** Screen-height LOD heuristic; callers should add hysteresis in streaming UI. */
export function selectPrimitiveLodV1(heightMeters: number, distanceMeters: number, focalPixels: number, thresholds: { detailed?: number; balanced?: number } = {}): { lod: PrimitiveLodV1; projectedHeightPx: number } {
	const height = finite(heightMeters, 'heightMeters'), distance = finite(distanceMeters, 'distanceMeters'), focal = finite(focalPixels, 'focalPixels');
	if (height < 0 || distance <= 0 || focal <= 0) throw new RangeError('primitive projection inputs are invalid');
	const detailed = finite(thresholds.detailed ?? 90, 'detailedThreshold');
	const balanced = finite(thresholds.balanced ?? 26, 'balancedThreshold');
	if (detailed <= balanced || balanced < 0) throw new RangeError('LOD thresholds must be descending and nonnegative');
	const projectedHeightPx = height * focal / distance;
	return { lod: projectedHeightPx >= detailed ? 'detailed' : projectedHeightPx >= balanced ? 'balanced' : 'retro', projectedHeightPx };
}

export interface ScenePrimitiveManagerPacketOptionsV1 {
	tileOriginMeters: Vec3V1;
	objectIdByPrimitiveId: ReadonlyMap<string, number>;
	kindIdByType: Readonly<Record<ScenePrimitiveType, number>>;
	materialIdByPrimitiveId?: ReadonlyMap<string, number>;
}

/** Adapt the current manager's snapshots into a tile-local packet plus the required external ID sidecar. */
export function encodeScenePrimitiveManagerPacketV1(manager: ScenePrimitiveManager, options: ScenePrimitiveManagerPacketOptionsV1): { packet: Uint8Array; idSidecar: Array<{ objectId: number; primitiveId: string; type: ScenePrimitiveType; label: string; anchorStatus: 'DEMONSTRATIVE_UNCALIBRATED' }> } {
	validateVector(options.tileOriginMeters, 'tileOriginMeters');
	const configs = manager.getAll();
	const configByObject = new Map(configs.map((config) => [config.mesh, config]));
	const objectIdByPrimitiveId = options.objectIdByPrimitiveId;
	const records: ScenePrimitivePacketRecordV1[] = [];
	const idSidecar: Array<{ objectId: number; primitiveId: string; type: ScenePrimitiveType; label: string; anchorStatus: 'DEMONSTRATIVE_UNCALIBRATED' }> = [];
	for (const config of configs) {
		const snapshot = manager.getSnapshot(config.id);
		if (!snapshot) throw new Error('SCENE_PRIMITIVE_PACKET_MANAGER_READBACK_FAILED');
		const objectId = objectIdByPrimitiveId.get(config.id);
		if (objectId === undefined) throw new Error(`SCENE_PRIMITIVE_PACKET_ID_MAPPING_MISSING:${config.id}`);
		const parentConfig = config.mesh.parent ? configByObject.get(config.mesh.parent) : undefined;
		const parentObjectId = parentConfig ? objectIdByPrimitiveId.get(parentConfig.id) : undefined;
		if (parentConfig && parentObjectId === undefined) throw new Error(`SCENE_PRIMITIVE_PACKET_PARENT_MAPPING_MISSING:${parentConfig.id}`);
		const origin = options.tileOriginMeters;
		records.push({
			objectId, kindId: options.kindIdByType[config.type], materialId: options.materialIdByPrimitiveId?.get(config.id) ?? 0,
			positionMeters: [snapshot.positionMeters[0] - origin[0], snapshot.positionMeters[1] - origin[1], snapshot.positionMeters[2] - origin[2]],
			dimensionsMeters: snapshot.dimensionsMeters, yawRadians: snapshot.rotationDeg[1] * Math.PI / 180, parentObjectId: parentObjectId ?? null
		});
		idSidecar.push({ objectId, primitiveId: config.id, type: config.type, label: snapshot.label, anchorStatus: snapshot.anchorStatus });
	}
	return { packet: encodeScenePrimitivePacketV1(records), idSidecar };
}

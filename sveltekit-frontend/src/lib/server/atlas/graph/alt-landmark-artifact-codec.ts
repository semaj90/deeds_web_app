import { createHash } from 'node:crypto';
import {
  LandmarkDistanceSnapshotV1Schema,
  type LandmarkDistanceArtifactRefV1,
  type LandmarkDistanceSnapshotV1,
} from './alt-landmark-contracts.js';
import type { AltDistanceAccessor } from './alt-landmark-heuristic.js';

export interface PersistentAltArtifacts {
  snapshot: LandmarkDistanceSnapshotV1;
  forwardBytes: Uint8Array;
  reverseBytes: Uint8Array | null;
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function scalarByteWidth(valueType: LandmarkDistanceSnapshotV1['distanceValueType']): number {
  switch (valueType) {
    case 'UINT32_HOPS': return 4;
    case 'UINT64_SCALED_COST': return 8;
    case 'FLOAT32_COST': return 4;
    case 'FLOAT64_COST': return 8;
  }
}

function writeValue(
  view: DataView,
  byteOffset: number,
  valueType: LandmarkDistanceSnapshotV1['distanceValueType'],
  value: number,
  unreachableSentinel: LandmarkDistanceSnapshotV1['unreachableSentinel'],
): void {
  const unreachable = !Number.isFinite(value) || value < 0;
  switch (valueType) {
    case 'UINT32_HOPS': {
      if (unreachable) {
        view.setUint32(byteOffset, 0xffffffff, true);
        return;
      }
      if (!Number.isSafeInteger(value) || value < 0 || value >= 0xffffffff) {
        throw new Error('UINT32_HOPS value is out of exact range');
      }
      view.setUint32(byteOffset, value, true);
      return;
    }
    case 'UINT64_SCALED_COST': {
      if (unreachable) {
        view.setBigUint64(byteOffset, 0xffffffffffffffffn, true);
        return;
      }
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('UINT64_SCALED_COST materializer currently requires JS-safe integer input');
      }
      view.setBigUint64(byteOffset, BigInt(value), true);
      return;
    }
    case 'FLOAT32_COST':
      view.setFloat32(byteOffset, unreachable && unreachableSentinel === 'POSITIVE_INFINITY'
        ? Number.POSITIVE_INFINITY
        : value, true);
      return;
    case 'FLOAT64_COST':
      view.setFloat64(byteOffset, unreachable && unreachableSentinel === 'POSITIVE_INFINITY'
        ? Number.POSITIVE_INFINITY
        : value, true);
      return;
  }
}

function packDirection(input: {
  snapshot: LandmarkDistanceSnapshotV1;
  accessor: AltDistanceAccessor;
  direction: 'FORWARD' | 'REVERSE';
}): Uint8Array {
  const { snapshot } = input;
  const width = scalarByteWidth(snapshot.distanceValueType);
  const bytes = new Uint8Array(snapshot.landmarkCount * snapshot.nodeCount * width);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let byteOffset = 0;

  for (let landmarkIndex = 0; landmarkIndex < snapshot.landmarkCount; landmarkIndex += 1) {
    for (let nodeOrdinal = 0; nodeOrdinal < snapshot.nodeCount; nodeOrdinal += 1) {
      const value = input.direction === 'FORWARD'
        ? input.accessor.forward(landmarkIndex, nodeOrdinal)
        : input.accessor.reverse?.(landmarkIndex, nodeOrdinal);
      if (value === undefined) throw new Error('directed ALT persistence requires reverse-distance accessor');
      writeValue(view, byteOffset, snapshot.distanceValueType, value, snapshot.unreachableSentinel);
      byteOffset += width;
    }
  }
  return bytes;
}

function artifactRef(input: {
  previous: LandmarkDistanceArtifactRefV1;
  bytes: Uint8Array;
}): LandmarkDistanceArtifactRefV1 {
  return {
    ...input.previous,
    checksumSha256: sha256(input.bytes),
    layout: 'LANDMARK_MAJOR',
    byteOrder: 'LITTLE_ENDIAN',
    byteLength: input.bytes.byteLength,
  };
}

/**
 * Convert an ALT distance accessor into canonical persistent V1 bytes.
 * Checksums are over the exact little-endian byte sequence produced here.
 */
export function materializePersistentAltArtifacts(input: {
  snapshot: LandmarkDistanceSnapshotV1;
  accessor: AltDistanceAccessor;
}): PersistentAltArtifacts {
  const snapshot = LandmarkDistanceSnapshotV1Schema.parse(input.snapshot);
  const forwardBytes = packDirection({ snapshot, accessor: input.accessor, direction: 'FORWARD' });
  const reverseBytes = snapshot.directed
    ? packDirection({ snapshot, accessor: input.accessor, direction: 'REVERSE' })
    : null;

  return {
    forwardBytes,
    reverseBytes,
    snapshot: LandmarkDistanceSnapshotV1Schema.parse({
      ...snapshot,
      forwardDistances: artifactRef({ previous: snapshot.forwardDistances, bytes: forwardBytes }),
      reverseDistances: snapshot.directed && snapshot.reverseDistances && reverseBytes
        ? artifactRef({ previous: snapshot.reverseDistances, bytes: reverseBytes })
        : null,
    }),
  };
}

/**
 * Decode canonical persistent V1 bytes without assuming host endianness or
 * typed-array alignment. UINT_MAX is normalized to +Infinity before ALT math.
 */
export function persistentAltArtifactAccessor(input: {
  snapshot: LandmarkDistanceSnapshotV1;
  forwardBytes: Uint8Array;
  reverseBytes?: Uint8Array | null;
}): AltDistanceAccessor {
  const snapshot = LandmarkDistanceSnapshotV1Schema.parse(input.snapshot);
  if (snapshot.forwardDistances.byteOrder !== 'LITTLE_ENDIAN') {
    throw new Error('persistent ALT forward artifact must declare LITTLE_ENDIAN');
  }
  if (snapshot.directed && snapshot.reverseDistances?.byteOrder !== 'LITTLE_ENDIAN') {
    throw new Error('persistent ALT reverse artifact must declare LITTLE_ENDIAN');
  }

  const width = scalarByteWidth(snapshot.distanceValueType);
  const expectedBytes = snapshot.landmarkCount * snapshot.nodeCount * width;
  if (input.forwardBytes.byteLength !== expectedBytes) throw new Error('ALT forward artifact byte length mismatch');
  if (snapshot.directed && input.reverseBytes?.byteLength !== expectedBytes) {
    throw new Error('ALT reverse artifact byte length mismatch');
  }

  const forwardView = new DataView(input.forwardBytes.buffer, input.forwardBytes.byteOffset, input.forwardBytes.byteLength);
  const reverseView = input.reverseBytes
    ? new DataView(input.reverseBytes.buffer, input.reverseBytes.byteOffset, input.reverseBytes.byteLength)
    : null;

  const byteOffset = (landmarkIndex: number, nodeOrdinal: number): number => {
    if (!Number.isInteger(landmarkIndex) || landmarkIndex < 0 || landmarkIndex >= snapshot.landmarkCount) {
      throw new Error('ALT landmark index out of range');
    }
    if (!Number.isInteger(nodeOrdinal) || nodeOrdinal < 0 || nodeOrdinal >= snapshot.nodeCount) {
      throw new Error('ALT node ordinal out of range');
    }
    return (landmarkIndex * snapshot.nodeCount + nodeOrdinal) * width;
  };

  const read = (view: DataView, offset: number): number => {
    switch (snapshot.distanceValueType) {
      case 'UINT32_HOPS': {
        const value = view.getUint32(offset, true);
        return value === 0xffffffff ? Number.POSITIVE_INFINITY : value;
      }
      case 'UINT64_SCALED_COST': {
        const value = view.getBigUint64(offset, true);
        if (value === 0xffffffffffffffffn) return Number.POSITIVE_INFINITY;
        if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error('UINT64 ALT value exceeds JavaScript safe integer range');
        }
        return Number(value);
      }
      case 'FLOAT32_COST': return view.getFloat32(offset, true);
      case 'FLOAT64_COST': return view.getFloat64(offset, true);
    }
  };

  return {
    forward: (landmarkIndex, nodeOrdinal) => read(forwardView, byteOffset(landmarkIndex, nodeOrdinal)),
    ...(snapshot.directed
      ? { reverse: (landmarkIndex: number, nodeOrdinal: number) => {
          if (!reverseView) throw new Error('ALT reverse artifact missing');
          return read(reverseView, byteOffset(landmarkIndex, nodeOrdinal));
        } }
      : {}),
  };
}

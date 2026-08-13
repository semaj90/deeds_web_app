export const ACE_LATENT_DIM = 64 as const;

export type FloatVector64 = Float32Array;

export type AceClusterPacketVectorSource = {
  packetKey?: string;
  packet_key?: string;
  representationId?: string;
  representation_id?: string;
  cluster?: { id?: number };
  cluster_id?: number;
};

export type AcePacketVector = {
  packetKey: string;
  representationId?: string;
  clusterId?: number;
  latent64: FloatVector64;
  centroid64?: FloatVector64;
};

function assertFiniteVector(
  name: string,
  value: Float32Array,
  expectedDim = ACE_LATENT_DIM,
): void {
  if (!(value instanceof Float32Array)) {
    throw new TypeError(`${name} must be a Float32Array`);
  }
  if (value.length !== expectedDim) {
    throw new RangeError(
      `${name} must contain exactly ${expectedDim} values; got ${value.length}`,
    );
  }
  for (let i = 0; i < value.length; i += 1) {
    if (!Number.isFinite(value[i])) {
      throw new TypeError(`${name}[${i}] must be finite`);
    }
  }
}

export function resolveCanonicalPacketKey(
  packet: AceClusterPacketVectorSource,
): string {
  const key = packet.packetKey ?? packet.packet_key;
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('ACE packet is missing canonical packet key');
  }
  return key;
}

export function buildAcePacketVector(
  packet: AceClusterPacketVectorSource,
  latent64: Float32Array,
  centroid64?: Float32Array,
): AcePacketVector {
  assertFiniteVector('latent64', latent64);

  if (centroid64 !== undefined) {
    assertFiniteVector('centroid64', centroid64);
  }

  const packetKey = resolveCanonicalPacketKey(packet);
  const representationId =
    packet.representationId ?? packet.representation_id;
  const clusterId = packet.cluster?.id ?? packet.cluster_id;

  return Object.freeze({
    packetKey,
    ...(representationId ? { representationId } : {}),
    ...(Number.isFinite(clusterId) ? { clusterId } : {}),
    latent64: new Float32Array(latent64),
    ...(centroid64
      ? { centroid64: new Float32Array(centroid64) }
      : {}),
  });
}

export function assertAcePacketVector(
  vector: AcePacketVector,
): AcePacketVector {
  if (!vector || typeof vector !== 'object') {
    throw new TypeError('ACE packet vector is required');
  }
  if (!vector.packetKey) {
    throw new Error('ACE packet vector is missing packetKey');
  }

  assertFiniteVector('latent64', vector.latent64);

  if (vector.centroid64 !== undefined) {
    assertFiniteVector('centroid64', vector.centroid64);
  }

  return vector;
}

export type CanonicalIdentitySource =
  | 'symbol_version_id'
  | 'packet_key'
  | 'source_ref'
  | 'lane_id_fallback';

export type CanonicalIdentityStatus = 'canonical' | 'degraded';

export interface CanonicalIdentityResolution {
  value: string;
  source: CanonicalIdentitySource;
  status: CanonicalIdentityStatus;
  backendLocalId: string | null;
}

export interface CanonicalIdentityInput {
  symbolVersionId?: string | null;
  packetKey?: string | null;
  sourceRef?: string | null;
  laneIdFallback?: string | null;
  backendLocalId?: string | null;
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

export function resolveCanonicalIdentity(input: CanonicalIdentityInput): CanonicalIdentityResolution {
  const backendLocalId = cleanText(input.backendLocalId);
  const symbolVersionId = cleanText(input.symbolVersionId);
  if (symbolVersionId) {
    return { value: symbolVersionId, source: 'symbol_version_id', status: 'canonical', backendLocalId };
  }

  const packetKey = cleanText(input.packetKey);
  if (packetKey) {
    return { value: packetKey, source: 'packet_key', status: 'canonical', backendLocalId };
  }

  const sourceRef = cleanText(input.sourceRef);
  if (sourceRef) {
    return { value: sourceRef, source: 'source_ref', status: 'degraded', backendLocalId };
  }

  const laneFallback = cleanText(input.laneIdFallback);
  if (laneFallback) {
    return { value: laneFallback, source: 'lane_id_fallback', status: 'degraded', backendLocalId };
  }

  throw new Error('Unable to resolve canonical identity');
}

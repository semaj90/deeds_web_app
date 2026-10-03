import {
  AceBitfrostCacheIdentityV1Schema,
  buildAceBitfrostCacheKeyV1,
  type AceBitfrostCacheIdentityV1,
} from '../atlas/cache/ace-bitfrost-cache-identity-v1.js';

export type AceRouteCacheAdmissionV1 =
  | {
      status: 'ADMITTED';
      identity: AceBitfrostCacheIdentityV1;
      cacheKey: string;
      reason: null;
    }
  | {
      status: 'BLOCKED_IDENTITY';
      identity: null;
      cacheKey: null;
      reason: 'ACE_ROUTE_IDENTITY_REQUIRED' | 'ACE_ROUTE_IDENTITY_INVALID';
    };

/**
 * Route boundary for production ACE packet cache use.
 *
 * A route may use the revisioned packet cache only when its caller supplies a
 * complete, schema-validated BitFrost identity. Legacy query-only cache keys
 * are intentionally not admitted here: they remain readable by diagnostic
 * callers, but cannot be reported as current evidence.
 */
export function admitAceRouteCacheIdentityV1(
  input: unknown,
  expectedRequestHash: string,
): AceRouteCacheAdmissionV1 {
  if (input === undefined || input === null) {
    return {
      status: 'BLOCKED_IDENTITY',
      identity: null,
      cacheKey: null,
      reason: 'ACE_ROUTE_IDENTITY_REQUIRED',
    };
  }

  const parsed = AceBitfrostCacheIdentityV1Schema.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.cacheKind !== 'ACE_PACKET' ||
    parsed.data.requestHash !== expectedRequestHash
  ) {
    return {
      status: 'BLOCKED_IDENTITY',
      identity: null,
      cacheKey: null,
      reason: 'ACE_ROUTE_IDENTITY_INVALID',
    };
  }

  return {
    status: 'ADMITTED',
    identity: parsed.data,
    cacheKey: buildAceBitfrostCacheKeyV1(parsed.data),
    reason: null,
  };
}

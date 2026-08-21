const UUID_V8_VERSION_MASK = 0x80;
const UUID_RFC4122_VARIANT_MASK = 0x80;

export const UUID_DERIVATION_REVISION = 'atlas.uuid.derive.sha256-canonical-json-uuidv8.v1' as const;

export type UUIDAttributes = Record<string, string>;

function canonicalizeAttributes(attributes: UUIDAttributes): UUIDAttributes {
  return Object.fromEntries(
    Object.entries(attributes)
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key]) => key.length > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function canonicalUUIDDerivationInput(
  domainClass: string,
  attributes: UUIDAttributes,
): string {
  const normalizedDomainClass = domainClass.trim();
  if (!normalizedDomainClass) throw new Error('UUID_DERIVE_DOMAIN_CLASS_REQUIRED');

  const normalizedAttributes = canonicalizeAttributes(attributes);
  return JSON.stringify({
    domainClass: normalizedDomainClass,
    attributes: normalizedAttributes,
  });
}

function formatUuidV8FromDigest(digest: ArrayBuffer): string {
  const bytes = new Uint8Array(digest.slice(0, 16));

  // RFC 9562 UUIDv8: application-defined payload with version/variant bits fixed.
  bytes[6] = (bytes[6] & 0x0f) | UUID_V8_VERSION_MASK;
  bytes[8] = (bytes[8] & 0x3f) | UUID_RFC4122_VARIANT_MASK;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function deriveUUID(
  domainClass: string,
  attributes: UUIDAttributes,
): Promise<string> {
  const input = canonicalUUIDDerivationInput(domainClass, attributes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return formatUuidV8FromDigest(digest);
}

/**
 * Namespace-style API requested by Parent Atlas callers.
 *
 * `uuid.derive()` is deterministic and intentionally asynchronous because it
 * uses Web Crypto SHA-256. It never uses crypto.randomUUID().
 */
export const uuid = Object.freeze({
  derive: deriveUUID,
});

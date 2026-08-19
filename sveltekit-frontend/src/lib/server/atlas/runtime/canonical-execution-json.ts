import { createHash } from 'node:crypto';

export type CanonicalJsonScalar = null | boolean | number | string;
export type CanonicalJsonValue = CanonicalJsonScalar | CanonicalJsonValue[] | { [key: string]: CanonicalJsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Convert execution identity/configuration data into a deterministic JSON-safe
 * tree. Object keys are sorted recursively; array order is preserved because
 * array order is often semantic (top-K, DAG dependencies, route precedence).
 *
 * Unsupported/ambiguous JavaScript values are rejected rather than silently
 * coerced. This keeps cache keys and execution fingerprints reproducible.
 */
export function canonicalizeExecutionValue(value: unknown, path = '$'): CanonicalJsonValue {
  if (value === null) return null;

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number': {
      if (!Number.isFinite(value)) throw new TypeError(`non-finite number at ${path}`);
      return Object.is(value, -0) ? 0 : value;
    }
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      throw new TypeError(`unsupported canonical JSON value ${typeof value} at ${path}`);
    case 'object':
      break;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalizeExecutionValue(entry, `${path}[${index}]`));
  }

  if (!isPlainObject(value)) {
    throw new TypeError(`canonical execution JSON requires plain objects at ${path}`);
  }

  const out: Record<string, CanonicalJsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalizeExecutionValue(value[key], `${path}.${key}`);
  }
  return out;
}

export function canonicalExecutionJson(value: unknown): string {
  return JSON.stringify(canonicalizeExecutionValue(value));
}

export function canonicalExecutionSha256(value: unknown): string {
  return createHash('sha256').update(canonicalExecutionJson(value), 'utf8').digest('hex');
}

export function canonicalExecutionBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalExecutionJson(value));
}

/**
 * Hash only algorithm/config inputs that actually change execution semantics.
 * Runtime measurements such as elapsedMs should not be included in this input.
 */
export function executionParameterFingerprint(input: {
  algorithmId: string;
  representationRevision: string | null;
  parameters: unknown;
  implementationRevision?: string | null;
}): string {
  return canonicalExecutionSha256({
    algorithmId: input.algorithmId,
    implementationRevision: input.implementationRevision ?? null,
    parameters: input.parameters,
    representationRevision: input.representationRevision,
  });
}

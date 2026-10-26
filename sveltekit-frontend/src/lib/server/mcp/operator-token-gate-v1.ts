import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';

/**
 * Operator-token gate for ops.* write tools (scaffold, not yet wired into trace-mcp-server).
 *
 * Deny by default. The registry (hashes only, never raw secrets) is supplied by the caller;
 * where it lives is an open operator decision. Issuance and revocation are out of band.
 * Every decision carries canonicalAuthority:false and never echoes the presented token.
 */
export const OPERATOR_TOKEN_GATE_V1_REVISION = 'atlas.operator-token-gate.v1' as const;

export type OperatorTokenRecordV1 = {
  id: string;
  /** SHA-256 hex of the operator secret. The secret itself is never stored. */
  tokenHash: string;
  scopes: string[];
  expiresAt: string;
  revoked: boolean;
  issuedBy: string;
};

export type OperatorGateReasonV1 =
  | 'ALLOWED'
  | 'REGISTRY_UNAVAILABLE'
  | 'MISSING_TOKEN'
  | 'UNKNOWN_TOKEN'
  | 'REVOKED'
  | 'EXPIRED'
  | 'SCOPE_DENIED'
  | 'REPLAYED_NONCE';

export type OperatorGateDecisionV1 = {
  allowed: boolean;
  reasonCode: OperatorGateReasonV1;
  tokenId: string | null;
  tool: string;
  revision: typeof OPERATOR_TOKEN_GATE_V1_REVISION;
  canonicalAuthority: false;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function hashOperatorToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Validates a registry document. Throws on any malformed entry rather than guessing. */
export function parseOperatorTokenRegistryV1(raw: unknown): OperatorTokenRecordV1[] {
  if (!Array.isArray(raw)) throw new Error('OPERATOR_REGISTRY_NOT_ARRAY');
  const seen = new Set<string>();
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`OPERATOR_REGISTRY_ENTRY_INVALID:${index}`);
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || e.id.trim() === '') throw new Error(`OPERATOR_REGISTRY_ID_INVALID:${index}`);
    if (seen.has(e.id)) throw new Error(`OPERATOR_REGISTRY_DUPLICATE_ID:${e.id}`);
    seen.add(e.id);
    if (typeof e.tokenHash !== 'string' || !SHA256_HEX.test(e.tokenHash)) {
      throw new Error(`OPERATOR_REGISTRY_HASH_INVALID:${e.id}`);
    }
    if (!Array.isArray(e.scopes) || e.scopes.some((s) => typeof s !== 'string' || s.trim() === '')) {
      throw new Error(`OPERATOR_REGISTRY_SCOPES_INVALID:${e.id}`);
    }
    if (typeof e.expiresAt !== 'string' || Number.isNaN(Date.parse(e.expiresAt))) {
      throw new Error(`OPERATOR_REGISTRY_EXPIRY_INVALID:${e.id}`);
    }
    if (typeof e.revoked !== 'boolean') throw new Error(`OPERATOR_REGISTRY_REVOKED_INVALID:${e.id}`);
    if (typeof e.issuedBy !== 'string' || e.issuedBy.trim() === '') {
      throw new Error(`OPERATOR_REGISTRY_ISSUER_INVALID:${e.id}`);
    }
    return {
      id: e.id,
      tokenHash: e.tokenHash,
      scopes: [...(e.scopes as string[])],
      expiresAt: e.expiresAt,
      revoked: e.revoked,
      issuedBy: e.issuedBy,
    };
  });
}

/**
 * Reads a registry file whose path the operator supplies (option (a) in the open decision).
 * Returns null when the file is absent, which the gate treats as deny-all.
 */
export function loadOperatorTokenRegistryV1(filePath: string): OperatorTokenRecordV1[] | null {
  if (!fs.existsSync(filePath)) return null;
  return parseOperatorTokenRegistryV1(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function decision(
  reasonCode: OperatorGateReasonV1,
  tool: string,
  tokenId: string | null,
): OperatorGateDecisionV1 {
  return {
    allowed: reasonCode === 'ALLOWED',
    reasonCode,
    tokenId,
    tool,
    revision: OPERATOR_TOKEN_GATE_V1_REVISION,
    canonicalAuthority: false,
  };
}

export type EvaluateOperatorTokenInputV1 = {
  presentedToken: unknown;
  tool: string;
  now: Date;
  registry: OperatorTokenRecordV1[] | null;
  /** Nonce for single-use write authorization. Caller records it after an ALLOWED decision. */
  nonce?: string;
  usedNonces?: ReadonlySet<string>;
};

export function evaluateOperatorTokenV1(input: EvaluateOperatorTokenInputV1): OperatorGateDecisionV1 {
  const { presentedToken, tool, now, registry, nonce, usedNonces } = input;
  if (!registry) return decision('REGISTRY_UNAVAILABLE', tool, null);
  if (typeof presentedToken !== 'string' || presentedToken.trim() === '') {
    return decision('MISSING_TOKEN', tool, null);
  }

  const presentedHash = Buffer.from(hashOperatorToken(presentedToken), 'hex');
  const match = registry.find((record) => {
    const recordHash = Buffer.from(record.tokenHash, 'hex');
    return recordHash.length === presentedHash.length && timingSafeEqual(recordHash, presentedHash);
  });
  if (!match) return decision('UNKNOWN_TOKEN', tool, null);
  if (match.revoked) return decision('REVOKED', tool, match.id);
  if (Date.parse(match.expiresAt) <= now.getTime()) return decision('EXPIRED', tool, match.id);
  if (!match.scopes.includes(tool)) return decision('SCOPE_DENIED', tool, match.id);
  if (nonce !== undefined && usedNonces?.has(nonce)) return decision('REPLAYED_NONCE', tool, match.id);
  return decision('ALLOWED', tool, match.id);
}

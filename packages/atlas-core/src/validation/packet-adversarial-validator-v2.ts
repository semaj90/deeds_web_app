/**
 * GAN-VALIDATOR-EXTRACT-01 — the ONE pure owner of packet / source_ref / SQL / blocked-term / operation-order validation.
 * No I/O, no clients, no globals: callers pass values in. GanAuditOrchestrator, the read-only live proof runner and the adversarial
 * probes all call these exact functions, so a proof can never re-implement "slightly different rules".
 *
 * Error codes are the historical ones (ERR_*) so ADV001-006 keep their meanings. Probes assert actualErrorCode === expectedErrorCode.
 *
 * source_ref rule is STRUCTURAL, not language-specific: a file extension belongs to language classification, not canonical source
 * identity. It was derived from a live census (61,718 rows: 0 backslashes, 0 `..`, 0 leading slashes, 0 control bytes, 0 double slashes;
 * 62 scheme refs `proto:`/`cluster:`; 231 root-level file refs, including dotfiles and compound suffixes; four nonblank junk refs plus one blank ref have neither `/` nor a filename dot).
 */

import { ERR_INVALID_SOURCE_REF, validateSourceRefV1 } from './source-ref-validation-v1.js';
export { ERR_INVALID_SOURCE_REF, validateSourceRefV1 };

export const ERR_MISSING_PACKET_KEY = 'ERR_MISSING_PACKET_KEY' as const;
export const ERR_MISSING_FEATURE_ID = 'ERR_MISSING_FEATURE_ID' as const;
export const ERR_UNKNOWN_TABLE = 'ERR_UNKNOWN_TABLE' as const;
export const ERR_BLOCKED_TERM = 'ERR_BLOCKED_TERM' as const;
export const ERR_WRITE_ORDER_VIOLATION = 'ERR_WRITE_ORDER_VIOLATION' as const;
export const ERR_EVENT_ORDER_VIOLATION = 'ERR_EVENT_ORDER_VIOLATION' as const;

export type ValidatorErrorCodeV2 =
  | typeof ERR_MISSING_PACKET_KEY | typeof ERR_INVALID_SOURCE_REF | typeof ERR_MISSING_FEATURE_ID
  | typeof ERR_UNKNOWN_TABLE | typeof ERR_BLOCKED_TERM | typeof ERR_WRITE_ORDER_VIOLATION | typeof ERR_EVENT_ORDER_VIOLATION;

export type ValidationResultV2 = { ok: true } | { ok: false; code: ValidatorErrorCodeV2; reason: string };

export interface PacketForValidationV2 {
  packet_key?: unknown;
  source_ref?: unknown;
  feature_id?: unknown;
  summary?: unknown;
  title?: unknown;
  embedding?: unknown;
  ganValidated?: unknown;
  summary_confidence?: unknown;
}

export interface PacketValidationOptionsV2 {
  /** Only enforce these soft warnings when the corresponding column exists in the caller's source (live `atlas_packets` has neither). */
  requireTitle?: boolean;
  requireGanFlag?: boolean;
}

export type PacketValidationV2 =
  | { status: 'HARD_FAIL'; hardFailure: { code: ValidatorErrorCodeV2; reason: string; historicalProbe: 'ADV001' | 'ADV002' }; warnings: [] }
  | { status: 'PASS'; hardFailure: null; warnings: string[] };

const blank = (v: unknown) => typeof v !== 'string' || v.trim() === '';

/** Hard failures short-circuit in this fixed order: packet_key, source_ref, feature_id. Soft warnings are reported only for packets that pass. */
export function validatePacketForAtlasV2(packet: PacketForValidationV2, options: PacketValidationOptionsV2 = {}): PacketValidationV2 {
  if (blank(packet.packet_key)) {
    return { status: 'HARD_FAIL', hardFailure: { code: ERR_MISSING_PACKET_KEY, reason: 'missing_packet_key', historicalProbe: 'ADV001' }, warnings: [] };
  }
  const ref = validateSourceRefV1(packet.source_ref);
  if (!ref.ok) {
    return { status: 'HARD_FAIL', hardFailure: { code: ERR_INVALID_SOURCE_REF, reason: 'invalid_source_ref', historicalProbe: 'ADV002' }, warnings: [] };
  }
  if (blank(packet.feature_id)) {
    return { status: 'HARD_FAIL', hardFailure: { code: ERR_MISSING_FEATURE_ID, reason: 'missing_feature_id', historicalProbe: 'ADV001' }, warnings: [] };
  }
  const warnings: string[] = [];
  if (!packet.summary) warnings.push('missing_summary');
  if (options.requireTitle && !packet.title) warnings.push('missing_title');
  if (!packet.embedding) warnings.push('missing_embedding');
  if (typeof packet.summary_confidence === 'number' && packet.summary_confidence < 0.7) warnings.push('low_summary_confidence');
  if (options.requireGanFlag && !packet.ganValidated) warnings.push('missing_gan_validation_flag');
  return { status: 'PASS', hardFailure: null, warnings };
}

/** Tables referenced after FROM / INTO / UPDATE / JOIN, unquoted and without schema. Deliberately simple: this gate rejects; it does not parse SQL. */
export function extractSqlTablesV2(sql: string): string[] {
  const tables: string[] = [];
  const re = /\b(?:from|into|update|join)\s+(?:only\s+)?((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?)/gi;
  for (const m of sql.matchAll(re)) {
    const last = m[1]!.split('.').pop()!.trim().replace(/^"|"$/g, '');
    tables.push(last.toLowerCase());
  }
  return tables;
}

/** ADV003 owner: every referenced table must be in the caller-supplied allowlist (e.g. the live `information_schema.tables` set). */
export function validateSqlAgainstAllowlistV2(sql: string, allowedTables: readonly string[]): ValidationResultV2 {
  const allowed = new Set(allowedTables.map((t) => t.toLowerCase()));
  for (const table of extractSqlTablesV2(sql)) {
    if (!allowed.has(table)) return { ok: false, code: ERR_UNKNOWN_TABLE, reason: `TABLE_NOT_IN_ALLOWLIST:${table}` };
  }
  return { ok: true };
}

export const BLOCKED_TERMS_V1 = ['fake_', '??', 'TODO', 'TBD', 'FIXME'] as const;

/** ADV004 owner. */
export function validateBlockedTermsV2(text: string): ValidationResultV2 {
  const hit = BLOCKED_TERMS_V1.find((term) => text.includes(term));
  return hit ? { ok: false, code: ERR_BLOCKED_TERM, reason: `BLOCKED_TERM:${hit}` } : { ok: true };
}

/**
 * ADV005 / ADV006 owner: Postgres (truth) must be written before any cache or event side effect.
 * Operations are `system.action` strings: `postgres.write`, `redis.*`, `nats.*`. Anything else is ignored.
 * A cache/event operation before the first `postgres.write` (or with no `postgres.write` at all) is a violation; the FIRST offender decides the code.
 */
export function validateOperationOrderV2(sequence: readonly string[]): ValidationResultV2 {
  for (const op of sequence) {
    if (op.startsWith('postgres.write')) return { ok: true };
    if (op.startsWith('redis')) return { ok: false, code: ERR_WRITE_ORDER_VIOLATION, reason: `CACHE_BEFORE_TRUTH:${op}` };
    if (op.startsWith('nats')) return { ok: false, code: ERR_EVENT_ORDER_VIOLATION, reason: `EVENT_BEFORE_TRUTH:${op}` };
  }
  return { ok: true };
}

/**
 * SOURCE-REF-CONTRACT-01 — SourceRefValidationV1: is this a structurally usable source reference? Pure, no I/O.
 *
 * It validates SYNTAX only. It deliberately has NO language/extension allowlist: what kind of file a ref points at is language classification,
 * not source identity. The rule was derived from a live read-only inventory of atlas_packets (docs/reports/source-ref-inventory-v1-*.json):
 * 61,718 refs, 492 distinct extensions, 23,534 with uppercase, 921 bracket routes, 1,310 route groups, 6,371 containing `+`, 83 with spaces,
 * 62 scheme namespaces (proto:, cluster:); 0 backslashes / absolute paths / `..` segments / control characters / double slashes.
 *
 * Three DIFFERENT concepts, never merged:
 *   source_ref            original producer reference; spelling and case preserved. THIS is what is validated.
 *   source_ref_key        normalized comparison key (deterministic separators/canonical form). Comparison only; never authority.
 *   canonical_source_ref  admitted authority-selected reference, set only by an authority process. Live it is NOT lower(source_ref)
 *                         (19,959 rows differ) and NOT source_ref_key; do not derive one from the other.
 * This module never normalizes, lowercases, or rewrites a ref. A valid ref is returned as-is.
 */
export const ERR_INVALID_SOURCE_REF = 'ERR_INVALID_SOURCE_REF' as const;

/** Non-file source namespaces observed live or documented in CLAUDE.md (`task:123`, `feature:auth`). Anything else with a scheme is unrecognized. */
export const RECOGNIZED_SOURCE_SCHEMES_V1 = ['proto', 'cluster', 'task', 'feature', 'file'] as const;
const SOURCE_REF_MAX_LENGTH = 1024;

export type SourceRefValidationV1 =
  | { ok: true; namespace: 'PATH' | `SCHEME:${string}` }
  | { ok: false; code: typeof ERR_INVALID_SOURCE_REF; reason: string };

export function validateSourceRefV1(ref: unknown): SourceRefValidationV1 {
  const bad = (reason: string): SourceRefValidationV1 => ({ ok: false, code: ERR_INVALID_SOURCE_REF, reason });
  if (typeof ref !== 'string') return bad('NOT_A_STRING');
  if (ref.length === 0 || ref.trim().length === 0) return bad('EMPTY');
  if (ref !== ref.trim()) return bad('LEADING_OR_TRAILING_WHITESPACE');
  if (ref.length > SOURCE_REF_MAX_LENGTH) return bad('TOO_LONG');
  if (/[\u0000-\u001f\u007f]/.test(ref)) return bad('CONTROL_CHARACTER');
  if (ref.includes('\\')) return bad('BACKSLASH_SEPARATOR');
  if (ref.includes('//')) return bad('EMPTY_PATH_SEGMENT');
  if (ref.startsWith('/') || /^[A-Za-z]:/.test(ref)) return bad('ABSOLUTE_PATH');
  if (ref.split('/').includes('..')) return bad('PATH_TRAVERSAL');

  const scheme = /^([a-z][a-z0-9+.-]+):(.*)$/.exec(ref);
  if (scheme) {
    if (!(RECOGNIZED_SOURCE_SCHEMES_V1 as readonly string[]).includes(scheme[1]!)) return bad('UNRECOGNIZED_SOURCE_NAMESPACE');
    if (scheme[2]!.length === 0) return bad('EMPTY_SCHEME_BODY');
    return { ok: true, namespace: `SCHEME:${scheme[1]}` };
  }
  // A path needs structure: a directory separator, or a root-level filename with a dotted name/suffix.
  // Permit dotfiles and compound suffixes such as `.python-version` and `.code-workspace`.
  // "NOT_A_FILE_PATH" and "1" have neither.
  if (!ref.includes('/') && !/\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ref)) return bad('NO_PATH_STRUCTURE');
  if (ref.endsWith('/')) return bad('DIRECTORY_NOT_A_SOURCE');
  return { ok: true, namespace: 'PATH' };
}

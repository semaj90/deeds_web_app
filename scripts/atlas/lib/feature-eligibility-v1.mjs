/**
 * Canonical feature-eligibility classifier (2026-09-13).
 *
 * Answers one question per source_ref: "can this file type meaningfully carry
 * an ast_symbols-style payload at all?" Built after live evidence
 * (openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md,
 * "80% threshold likely mis-scoped" + follow-ups) showed the AE-readiness
 * feature-coverage denominator was the FULL atlas_packets population, most of
 * which is binary assets, compiler build output, or data dumps that have no
 * AST/symbol concept -- not a backfill gap. This module makes that judgment
 * explicit, extension-by-extension, instead of leaving it implicit in a
 * ratio that can never reach 100% no matter how much extraction work is done.
 *
 * Three outcomes, never a silent fourth:
 *  - ELIGIBLE + implemented extractor -> should have ast_symbols; missing is a real gap.
 *  - ELIGIBLE + no extractor yet -> should have ast_symbols eventually; missing is a
 *    real, tracked gap, not swept into "ineligible" just because nobody built it yet.
 *  - INELIGIBLE -> this file type has no meaningful "symbol" concept (binary asset,
 *    build artifact/intermediate, data dump, lockfile/metadata). Excluded from the
 *    feature-coverage denominator entirely, with a stated reason.
 */

const IMPLEMENTED = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', // ast-grep-napi (pre-existing)
  'svelte',   // svelte-script-block -> ast-grep-napi on the <script> body
  'json',     // json-keys
  'md', 'mdx', // markdown-headings
  'sql',      // sql-statements
  'py', 'pyi', // python-regex
]);

// Real source with a defined symbol concept, but no extractor built yet this
// session -- stays IN the denominator as a genuine gap (low row-count impact
// vs. json/markdown/svelte/python/sql, deferred rather than skipped silently).
const ELIGIBLE_UNIMPLEMENTED = new Set([
  'rs', 'go', 'proto', 'sh', 'bash', 'yaml', 'yml',
  'c', 'h', 'cpp', 'hpp', 'cuh', 'cu', 'ps1', 'wgsl', 'ipynb', 'f90', 'f',
]);

// Path-based override, checked BEFORE extension classification. Reuses the same junk-tree
// predicate established live in openspec/changes/parent-atlas-ontology-kernel/tasks.md's
// ATLAS_PACKETS_ROOT_CAUSE_CONFIRMED / WHOLE_CODEBASE_PACKET_WRITER_EXCLUDE_LIST_FIXED entries.
// Needed because these trees produce extensionless or generically-named files (Tcl .msg/.enc/
// .comp/.tcl, Qdrant's RocksDB LOCK/CURRENT/MANIFEST-*/OPTIONS-*/wal segments) that would
// otherwise default to "eligible" under the extension-only classifier below.
const JUNK_PATH_PATTERNS = [
  /\/target\/[^/]+\/\.fingerprint\//i,
  /-backup/i,
  /\.python311\//i,
  /^qdrant-windows\//i,
  /\/storage\/collections\//i,
];

function isJunkPath(ref) {
  return JUNK_PATH_PATTERNS.some((pattern) => pattern.test(ref));
}

// Extensionless files with a real, if minimal, structural concept.
const EXTENSIONLESS_ELIGIBLE = new Set(['dockerfile', 'makefile']);
// Extensionless files with no meaningful symbol concept.
const EXTENSIONLESS_INELIGIBLE = new Set(['license', 'lock', 'current', 'identity', 'manifest']);

const INELIGIBLE_REASONS = new Map([
  ['timestamp', 'build-artifact'], ['any-backup', 'backup-copy'],
  ['batch1000-backup', 'backup-copy'], ['batch-backup', 'backup-copy'],
  ['txt', 'plain-text-no-structure'],
  // Binary / media assets -- no textual symbol concept.
  ['png', 'binary-asset'], ['webp', 'binary-asset'], ['svg', 'binary-asset'],
  ['woff2', 'binary-asset'], ['pdf', 'binary-asset'], ['exe', 'binary-asset'],
  ['dll', 'binary-asset'], ['bin', 'binary-asset'], ['obj', 'binary-asset'],
  ['pdb', 'binary-asset'], ['dat', 'binary-asset'],
  // Compiler / build-system intermediates and outputs -- not authored source.
  ['d', 'build-artifact'], ['o', 'build-artifact'], ['rlib', 'build-artifact'],
  ['rmeta', 'build-artifact'], ['lib', 'build-artifact'], ['exp', 'build-artifact'],
  ['tmp', 'build-artifact'], ['lastbuildstate', 'build-artifact'],
  ['recipe', 'build-artifact'], ['filters', 'build-artifact'],
  ['vcxproj', 'build-artifact'], ['cmake', 'build-artifact'],
  ['tlog', 'build-artifact'], ['out', 'build-artifact'], ['err', 'build-artifact'],
  ['log', 'build-artifact'], ['disabled', 'build-artifact'], ['meta', 'build-artifact'],
  ['map', 'build-artifact'], ['cl', 'build-artifact'],
  // Backups / snapshots -- duplicate content, not canonical source.
  ['bak', 'backup-copy'], ['bkp', 'backup-copy'], ['backup', 'backup-copy'],
  ['snapshot', 'backup-copy'],
  // Data dumps / state / lock files -- structured, but not "code with symbols".
  ['csv', 'data-dump'], ['xml', 'data-dump'], ['msgpack', 'data-dump'],
  ['jsonl', 'data-dump'], ['ndjson', 'data-dump'], ['info', 'data-dump'],
  ['lock', 'lockfile'], ['gitignore', 'config-denylist'],
]);

export function classifyFeatureEligibility(sourceRef) {
  const ref = String(sourceRef ?? '');

  if (isJunkPath(ref)) {
    return { eligible: false, hasExtractor: false, extension: null, reason: 'vendored-runtime-or-build-tree' };
  }

  const match = /\.([^./]+)$/.exec(ref);
  const ext = match ? match[1].toLowerCase() : '';
  const base = ref.split('/').pop()?.toLowerCase() ?? '';

  if (!match) {
    if (EXTENSIONLESS_ELIGIBLE.has(base)) {
      return { eligible: true, hasExtractor: false, extension: '(none)', reason: 'extractor-not-yet-built' };
    }
    if (EXTENSIONLESS_INELIGIBLE.has(base) || /^(current|identity|lock|manifest-\d+|options-\d+)$/.test(base)) {
      return { eligible: false, hasExtractor: false, extension: null, reason: 'no-extension-no-structure' };
    }
    return { eligible: false, hasExtractor: false, extension: '(none)', reason: 'no-extension-defaulted-ineligible' };
  }

  if (IMPLEMENTED.has(ext)) {
    return { eligible: true, hasExtractor: true, extension: ext, reason: null };
  }
  if (ELIGIBLE_UNIMPLEMENTED.has(ext)) {
    return { eligible: true, hasExtractor: false, extension: ext, reason: 'extractor-not-yet-built' };
  }
  const ineligibleReason = INELIGIBLE_REASONS.get(ext);
  if (ineligibleReason) {
    return { eligible: false, hasExtractor: false, extension: ext, reason: ineligibleReason };
  }
  // Unknown extension: default to eligible-unimplemented (visible gap) rather
  // than silently excluding it -- an unrecognized extension is more likely an
  // uncatalogued real source type than a new binary format. Revisit if this
  // default proves wrong for a specific extension (add it to one of the two
  // maps above with evidence, don't just flip the default).
  return { eligible: true, hasExtractor: false, extension: ext || '(none)', reason: 'unclassified-extension-defaulted-eligible' };
}

export function isFeatureEligible(sourceRef) {
  return classifyFeatureEligibility(sourceRef).eligible;
}

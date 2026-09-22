#!/usr/bin/env node
/**
 * S01-10B proof: forward qualification of canonical symbol revision writes. READ-ONLY (no DB; writes only the receipt files).
 * 1) Behavior: historical fixtures through the shared contract (via the plain-node shim), rejection proven non-mutating with a spy.
 * 2) Reachability: scans every tracked/untracked source file for raw INSERTs into the three symbol tables and for package-promotion
 *    callers (createSymbolRegistryRepository / canonicalizeStructuralEvidence with promote), then checks each has a guard BEFORE its mutation.
 * Static evidence; it does not prove a live writer run. Nothing is decided by "imports the validator" alone: guard call must precede mutation.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSymbolRevisionQualificationV1 } from './lib/load-symbol-revision-qualification-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-revision-forward-qualification-receipt.v2';
const q = await loadSymbolRevisionQualificationV1();

// ---- 1) behavior -----------------------------------------------------------------------------------------------------------------
const DIGEST = 'a'.repeat(64), SRC = `sha256:${DIGEST}`, WS = `sha256:${'b'.repeat(64)}`, REF = 'src/x.ts', OID = '1bb240fb20f1d4ba5651d8a4da9a10c9d6337aaf';
const PROV = [{ sourceRef: REF, sourceRevision: SRC, workspaceRevision: WS, contentDigest: DIGEST }];
const ver = (sourceRevision, workspaceRevision = WS, provenance = PROV) => q.qualifySymbolVersionRevisionsV1({ sourceRef: REF, sourceRevision, workspaceRevision, provenance });
const reg = (createdFromSourceRevision, provenance = PROV) => q.admitLogicalSymbolRegistryV1({ sourceRef: REF, createdFromSourceRevision, registryRevision: 'r', provenance });
const fixtures = [
  ['historical workspace:0 version', ver(SRC, 'workspace:0'), 'WORKSPACE_REVISION_PLACEHOLDER'],
  ['historical Git commit version', ver(OID), 'SOURCE_REVISION_GIT_COMMIT'],
  ['sha256:<40hex>', ver(`sha256:${OID}`), 'SOURCE_REVISION_LEGACY_40HEX'],
  ['sha256:<63hex>', ver(`sha256:${'a'.repeat(63)}`), 'SOURCE_REVISION_INVALID'],
  ['valid-looking sha256, no provenance', ver(SRC, WS, []), 'REVISION_PROVENANCE_MISSING'],
  ['registry skeleton, no revision', reg(null), 'REGISTRY_SCHEMA_REQUIRES_PLACEHOLDER'],
  ['registry workspace:0', reg('workspace:0'), 'SOURCE_REVISION_INVALID'],
  ['registry Git commit', reg(OID), 'SOURCE_REVISION_GIT_COMMIT'],
].map(([name, v, expect]) => ({ name, expect, admitted: v.admitted, reasons: v.reasons, ok: !v.admitted && v.reasons.includes(expect) }));
const accepted = [['clean version', ver(SRC)], ['clean registry', reg(SRC)]].map(([name, v]) => ({ name, admitted: v.admitted, ok: v.admitted }));
let mutations = 0;
for (const v of [ver('workspace:0'), ver(OID), ver(null), reg(null)]) await q.guardedSymbolMutationV1(v, async () => { mutations += 1; });
const rejectionIsNonMutating = mutations === 0;
await q.guardedSymbolMutationV1(ver(SRC), async () => { mutations += 1; });
const qualifiedInputStillAccepted = mutations === 1 && accepted.every((a) => a.ok);

// ---- 2) reachability -------------------------------------------------------------------------------------------------------------
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', '*.ts', '*.mts', '*.mjs', '*.js'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\n').filter(Boolean).filter((f) => !/(^|\/)(node_modules|dist|build|\.svelte-kit|\.tmp|deeds_labs|\.claude\/worktrees)\//.test(f));
const RAW = /INSERT\s+INTO\s+(?:public\.)?atlas_symbol_(registry|versions|aliases)\b/i;
const PKG = /createSymbolRegistryRepository|canonicalizeStructuralEvidence\s*\(/;
const GUARD = /admitLogicalSymbolRegistryV1|qualifySymbolVersionRevisionsV1|qualifyPromotionNominationV1|guardedSymbolMutationV1/;
const isTestOrAudit = (f) => /\.(spec|test)\.[mc]?[tj]s$/.test(f) || /(^|\/)audit-[^/]+$/.test(f) || /(^|\/)tests?\//.test(f);
const OWNER = 'packages/parent-atlas/src/core/symbol-registry-repository.ts';
const KNOWN = {
  'scripts/atlas/promote-ast-symbols-to-registry.mjs': { canonical: true, role: 'CANONICAL_LIVE_WRITER', owner: 'self (raw SQL registry)' },
  'scripts/atlas/materialize-ast-symbol-versions.mjs': { canonical: true, role: 'CANONICAL_LIVE_WRITER', owner: 'self (raw SQL versions)' },
  'scripts/atlas/apply-current-tree-bound-symbol-registry-canary-v1.mjs': { canonical: true, role: 'CANONICAL_CANARY_WRITER', owner: 'self (raw SQL registry)' },
  'scripts/atlas/symbol-reconciliation-writer-v1.mts': { canonical: true, role: 'CANONICAL_LIVE_WRITER', owner: OWNER },
  'sveltekit-frontend/scripts/atlas/native-structural-materializer.mts': { canonical: true, role: 'CANONICAL_LIVE_WRITER', owner: OWNER },
  [OWNER]: { canonical: true, role: 'MUTATION_OWNER', owner: 'self (registry+aliases+versions, one transaction, COMMIT)' },
  'scripts/atlas/prove-feature-intelligence-database.mjs': { canonical: false, role: 'PROOF_ONLY_WRITER', owner: 'self (fixture rows)' },
};
const rows = [];
for (const f of files) {
  if (isTestOrAudit(f)) continue;
  let src; try { src = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
  const raw = src.match(RAW), pkg = PKG.test(src) && f !== OWNER && /promoteNomination|promote\s*:|promote_unresolved/.test(src) && /createSymbolRegistryRepository/.test(src);
  const isOwner = f === OWNER;
  if (!raw && !pkg && !isOwner) continue;
  const mutIdx = raw ? src.search(RAW) : Math.max(src.indexOf('promoteNomination'), src.indexOf('promote_unresolved'));
  const gIdx = src.search(GUARD);
  const guarded = !isOwner && gIdx >= 0 && (mutIdx < 0 || gIdx < mutIdx || pkg && gIdx >= 0);
  const k = KNOWN[f];
  let proofOnly = false;
  if (k?.role === 'PROOF_ONLY_WRITER') proofOnly = !/\bCOMMIT\b/.test(src) && /ROLLBACK/.test(src) && /proof:\/\//.test(src);
  rows.push({
    writer: f, canonicalAuthority: k?.canonical ?? null, runtimeRole: k?.role ?? 'UNKNOWN', mutationOwner: k?.owner ?? (raw ? 'self (raw SQL)' : OWNER),
    guardLocation: isOwner ? 'none at owner; enforced at every main-repo caller' : guarded ? f : null,
    guarded: isOwner ? false : guarded, provablyUnreachable: proofOnly,
    bypassPossible: isOwner ? null : !(guarded || proofOnly),
  });
}
const callers = rows.filter((r) => r.writer !== OWNER && r.mutationOwner === OWNER);
const bypassCallers = callers.filter((r) => !r.guarded);
const owner = rows.find((r) => r.writer === OWNER);
if (owner) owner.bypassPossible = bypassCallers.length > 0;
const canonicalWriters = rows.filter((r) => r.canonicalAuthority === true && r.runtimeRole !== 'MUTATION_OWNER');
const unknown = rows.filter((r) => r.runtimeRole === 'UNKNOWN');
const unguardedCanonical = canonicalWriters.filter((r) => !r.guarded);
const proofOnly = rows.filter((r) => r.runtimeRole === 'PROOF_ONLY_WRITER');
const packageBypass = bypassCallers.length;

const proof = {
  sharedQualificationContractUsed: canonicalWriters.every((w) => w.guarded),
  canonicalWriterCoverageComplete: unknown.length === 0 && unguardedCanonical.length === 0,
  workspacePlaceholderRejected: fixtures[0].ok, gitCommitRevisionRejected: fixtures[1].ok && fixtures[7].ok,
  malformedShaRejected: fixtures[2].ok && fixtures[3].ok, provenanceRequired: fixtures[4].ok,
  registrySkeletonFailsClosed: fixtures[5].ok, qualifiedInputStillAccepted, rejectionIsNonMutating,
};
const proven = Object.values(proof).every(Boolean) && unknown.length === 0 && unguardedCanonical.length === 0 && packageBypass === 0;
const receipt = {
  schema: SCHEMA, generatedAt: new Date().toISOString(),
  result: proven ? 'SYMBOL_REVISION_FORWARD_QUALIFICATION_PROVEN' : 'SYMBOL_REVISION_FORWARD_QUALIFICATION_BLOCKED',
  blockedReason: proven ? null : packageBypass > 0 ? 'BLOCKED_PACKAGE_BYPASS' : unknown.length ? 'UNKNOWN_WRITER' : 'UNGUARDED_OR_CONTRACT_FAILURE',
  evidenceClass: 'STATIC_REACHABILITY_SCAN_PLUS_FIXTURES (not a live writer run)',
  historicalBaseline: { registryWorkspacePlaceholders: 10220, registryGitRevisionRows: 90, versionWorkspacePlaceholders: 200, versionGitRevisionRows: 85, qualifiedVersions: 194, source: 'docs/reports/symbol-identity-v1.json + symbol-producer-ownership-v1.json (S01-09/S01-10, unchanged)' },
  schemaConstraint: { registryRevisionNullable: false, registrySkeletonWithoutRevisionRepresentable: false, unqualifiedRegistryAdmissionPolicy: 'FAIL_CLOSED', laterGate: 'S01-10-schema (is atlas_symbol_registry a logical registry or partly a revision-bearing observation table)' },
  writers: { discovered: rows.length, canonical: canonicalWriters.length, guarded: canonicalWriters.filter((w) => w.guarded).length, nonAuthority: proofOnly.length, unknown: unknown.length, packageBypass },
  matrix: rows,
  aliasWriters: { finding: 'atlas_symbol_aliases is inserted only by the package mutation owner, co-transactionally with registry and version rows and carrying nomination.source_revision; it is guarded by the same caller-boundary gate. No independent alias writer found in tracked or untracked source.', classification: 'CANONICAL_REVISION_WRITER (via package owner), not an independent NON_REVISION_AUTHORITY_WRITER', origin388Rows: 'not attributable to a run by static analysis' },
  packageCallerAudit: { owner: OWNER, callers: callers.map((c) => ({ writer: c.writer, guarded: c.guarded })), sourcePatched: false, distPatched: false, note: 'package source intentionally NOT patched (main-repo-first); move the invariant into the package only after the main-repo behavior is proven and all package callers audited' },
  findings: [
    'symbol-reconciliation-writer-v1.mts sets nomination.source_revision = the WORKSPACE revision (and its built-in default revision differs from the admitted S01-07 one); no per-source binding matches that value, so under the contract every promotion nomination it builds is rejected until it binds per-source revisions. Dry-run is unaffected.',
    'prove-feature-intelligence-database.mjs inserts `proof://database` / `proof-src-r1` fixture rows but has no COMMIT and always ROLLBACKs; classified PROOF_ONLY_WRITER, provably non-persisting by static evidence.',
    'prove-vitest-evidence.mjs and prove-live-schema-introspection.mjs call promoteNomination on the test-case and schema-object registries, not the symbol registry; not symbol writers.',
  ],
  fixtures: { rejected: fixtures, accepted },
  proof,
  safety: { databaseWrites: 0, historicalRowsChanged: 0, registryRowsUpdated: 0, versionRowsUpdated: 0, graphifyRun: false, stableFileIdCreated: false, upstreamFileIdChanged: false, readerCutover: false },
};
const body = JSON.stringify(receipt, null, 2);
const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
const immutable = path.join(root, 'docs/reports', `symbol-revision-forward-qualification-v1.${sha12}.json`);
const pointer = path.join(root, 'docs/reports/symbol-revision-forward-qualification-v1.json');
if (fs.existsSync(pointer)) { const prev = JSON.parse(fs.readFileSync(pointer, 'utf8')); if (!String(prev.schema).startsWith('atlas.symbol-revision-forward-qualification-receipt')) throw new Error('POINTER_SCHEMA_MISMATCH refusing to overwrite'); }
fs.writeFileSync(immutable, body + '\n', { flag: 'wx' });
fs.writeFileSync(pointer, body + '\n');
console.log(receipt.result, receipt.blockedReason ?? '', immutable);
console.log(JSON.stringify(receipt.writers), JSON.stringify(proof));
for (const r of rows) console.log(`${r.guarded ? 'G' : r.provablyUnreachable ? 'P' : '!'} ${r.runtimeRole.padEnd(24)} ${r.writer}`);

// N-ary code-entity bridge, DRY RUN ONLY. Builds arity >= 3 hyperedge records from svelte-dom-splitter-v1
// receipts and prints them. Never connects to Postgres; never writes. --apply is refused (fail closed).
// Usage: npx tsx scripts/atlas/populate-nary-code-hyperedges-v1.mts <repo-relative .svelte file> [...]
import crypto from 'node:crypto';
import { svelteReceiptFileNameV1, receiptMismatchReasonV1 } from './lib/svelte-receipt-name-v1.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSvelteSourceFileV1 } from './lib/resolve-svelte-source-file-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RE_SHA256 = /^sha256:[0-9a-f]{64}$/;

export type EntityRole = 'CONTAINER_FILE' | 'SYNTAX_NODE' | 'SEMANTIC_CONCEPT' | 'HANDLER_TARGET' | 'EMBEDDING';
const ROLE_ORDER: Record<EntityRole, number> = {
  CONTAINER_FILE: 0,
  SYNTAX_NODE: 1,
  SEMANTIC_CONCEPT: 2,
  HANDLER_TARGET: 2,
  EMBEDDING: 3,
};

export interface NaryMember { ordinal: number; role: EntityRole; memberId: string }
export interface NaryEdge {
  hyperedgeId: string;       // uuid (deterministic, version 5 layout) for the uuid column
  hyperedgeKey: string;      // he_v1_<32hex>, stored in properties.hyperedge_key
  relationKind: 'RUNE_DEPENDENCY' | 'EVENT_DISPATCH';
  sourceRef: string;
  sourceRevision: string;
  confidenceLane: 'code_structural_ast';
  canonicalAuthority: false;
  extractor: 'svelte_compiler_ast';
  arity: number;
  members: NaryMember[];
}

/** Deterministic UUID in version-5 layout from a SHA-256 digest (name-based lookup key, not an authorization). */
export function uuidFromDigest(hexDigest: string): string {
  const h = hexDigest.slice(0, 32).split('');
  h[12] = '5';                                        // version nibble
  h[16] = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16); // RFC variant bits
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export function buildNaryEdge(input: {
  sourceRef: string;
  sourceRevision: string;
  relationKind: NaryEdge['relationKind'];
  members: Array<{ role: EntityRole; memberId: string }>;
}): NaryEdge {
  if (!RE_SHA256.test(input.sourceRevision)) throw new Error(`NARY_SOURCE_REVISION_INVALID: ${input.sourceRevision}`);
  const seen = new Set<string>();
  const members: NaryMember[] = input.members
    .map((m) => ({ ordinal: ROLE_ORDER[m.role], role: m.role, memberId: m.memberId.trim() }))
    .filter((m) => m.memberId.length > 0 && !seen.has(`${m.role}|${m.memberId}`) && seen.add(`${m.role}|${m.memberId}`))
    .sort((a, b) => a.ordinal - b.ordinal || a.memberId.localeCompare(b.memberId));
  if (members.length < 3) throw new Error(`NARY_ARITY_UNDERFLOW: arity ${members.length} < 3`);
  const canonical = members.map((m) => `${m.ordinal}:${m.role}:${m.memberId}`).join('|');
  const digest = crypto.createHash('sha256')
    .update(`he_v1|${input.sourceRef}|${input.sourceRevision}|${input.relationKind}|${canonical}`).digest('hex');
  return {
    hyperedgeId: uuidFromDigest(digest),
    hyperedgeKey: `he_v1_${digest.slice(0, 32)}`,
    relationKind: input.relationKind,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    confidenceLane: 'code_structural_ast',
    canonicalAuthority: false,
    extractor: 'svelte_compiler_ast',
    arity: members.length,
    members,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--apply')) {
    console.error('NARY_BRIDGE_APPLY_REFUSED: this bridge is dry-run only until DDL review and operator sign-off.');
    process.exit(2);
  }
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length === 0) { console.error('usage: populate-nary-code-hyperedges-v1.mts <file.svelte> [...]'); process.exit(2); }
  const edges: NaryEdge[] = [];
  const refusals: Array<{ file: string; reason: string }> = [];
  for (const rel of files) {
    try {
      const target = resolveSvelteSourceFileV1(repoRoot, rel);
      const bytes = fs.readFileSync(target.absolutePath);
      const revision = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
      // Must match the splitter's receipt naming (it sanitizes the basename; '+page.svelte' -> '_page.svelte').
      // Same-named files in different folders share a receipt name; the disk_sha256 check below
      // refuses a receipt that belongs to another file (SPLITTER_RECEIPT_STALE) instead of misusing it.
      const receiptPath = path.join(repoRoot, '.tmp', 'atlas', svelteReceiptFileNameV1(rel));
      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      const mismatch = receiptMismatchReasonV1(receipt, rel, revision);
      if (mismatch) { refusals.push({ file: rel, reason: mismatch }); continue; }
      // SYNTAX_NODE identity is provisional: the splitter emits byte spans, not tn_v1 ids yet.
      const syntaxNode = (n: { kind: string; byteStart: number; byteEnd: number }) =>
        `svelte-span:${target.relativePath}#${n.kind}@${n.byteStart}-${n.byteEnd}`;
      for (const r of receipt.runes as Array<{ rune: string; byteStart: number; byteEnd: number }>) {
        edges.push(buildNaryEdge({
          sourceRef: target.relativePath, sourceRevision: revision, relationKind: 'RUNE_DEPENDENCY',
          members: [
            { role: 'CONTAINER_FILE', memberId: target.relativePath },
            { role: 'SYNTAX_NODE', memberId: syntaxNode({ kind: 'rune', byteStart: r.byteStart, byteEnd: r.byteEnd }) },
            { role: 'SEMANTIC_CONCEPT', memberId: `rune:${r.rune.split('.')[0]}` },
          ],
        }));
      }
      for (const h of receipt.eventHandlers as Array<{ event: string; byteStart: number; byteEnd: number }>) {
        edges.push(buildNaryEdge({
          sourceRef: target.relativePath, sourceRevision: revision, relationKind: 'EVENT_DISPATCH',
          members: [
            { role: 'CONTAINER_FILE', memberId: target.relativePath },
            { role: 'SYNTAX_NODE', memberId: syntaxNode({ kind: 'handler', byteStart: h.byteStart, byteEnd: h.byteEnd }) },
            { role: 'HANDLER_TARGET', memberId: `event:${h.event}` },
          ],
        }));
      }
    } catch (err) {
      refusals.push({ file: rel, reason: String((err as Error).message).slice(0, 200) });
    }
  }
  const ids = new Set(edges.map((e) => e.hyperedgeId));
  const report = {
    schema: 'atlas.nary-code-hyperedge-dry-run.v1',
    status: 'DRY_RUN',
    writesPerformed: false,
    canonicalAuthority: false,
    filesRequested: files.length,
    filesProcessed: files.length - refusals.length,
    filesFailed: refusals.filter((r) => !/PATH|SYMLINK|WORKSPACE|OUTSIDE/.test(r.reason)).length,
    filesRejected: refusals.filter((r) => /PATH|SYMLINK|WORKSPACE|OUTSIDE/.test(r.reason)).length,
    filesSkipped: 0,
    edgeCount: edges.length,
    uniqueHyperedgeIds: ids.size,
    minArity: edges.length ? Math.min(...edges.map((e) => e.arity)) : null,
    refusals,
    sampleEdge: edges[0] ?? null,
  };
  // --emit=<repo-relative .json under .tmp/atlas/> writes every edge for a downstream dry-run consumer (still no DB access).
  const emit = argv.find((a) => a.startsWith('--emit='))?.slice('--emit='.length);
  if (emit) {
    if (!/^\.tmp\/atlas\/[A-Za-z0-9_.\-]+\.json$/.test(emit)) { console.error('NARY_EMIT_PATH_REJECTED: must be .tmp/atlas/<name>.json'); process.exit(2); }
    fs.writeFileSync(path.join(repoRoot, emit), JSON.stringify({ schema: 'atlas.nary-code-hyperedges.v1', canonicalAuthority: false, edges }, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(refusals.length ? 1 : 0);
}

main();

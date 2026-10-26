/**
 * pg18-indexed-file-subhelpers-v1.mjs
 *
 * Read-only, revision-qualified sub-helper coordinator for indexed PostgreSQL 18 files.
 * Bridges canonical PostgreSQL 18 rows (atlas_packets, atlas_workspace_source_bindings,
 * graphify_files, graphify_symbols, atlas_ast_nodes, atlas_representations) to the four
 * structural/domain observation lanes:
 *   1. Tree-sitter CST (:8095 sidecar)
 *   2. ast-grep structural pattern matcher (:8095 sidecar / CLI; excludes .svelte)
 *   3. LSP document-symbol sub-helper (typescript-language-server)
 *   4. NLP grounded span extraction (:8095 miniforge sidecar)
 *
 * Authority invariants:
 * - Never equates file-level `source_ref` with fragment locator `atlas_ast_nodes.source_ref_key`.
 * - Never equates `atlas_packets.tree_node_id` (UUID document locator) with `atlas_ast_nodes.tree_node_id` (AST hash).
 * - All outputs carry `canonicalAuthority: false` and `writesPerformed: false`.
 */

import crypto from 'node:crypto';
import { adaptTreeSitterEvidence } from './treesitter-structural-observation-v1.mjs';
import { verifySidecarRuntimeBindingV1 } from './sidecar-runtime-binding-v1.mjs';
import { matchPacketAstObservationsToCanonicalSymbolsV1 } from './packet-ast-canonical-symbol-crosswalk-v1.mjs';

export const PG18_SUBHELPER_COORDINATOR_SCHEMA = 'atlas.pg18-indexed-file-subhelpers.v1';

const SHA256_RE = /^sha256:[0-9a-f]{64}$/i;
const MUTATING_SQL_RE = /\b(UPDATE|INSERT|DELETE|CREATE|ALTER|DROP|TRUNCATE|REFRESH|MERGE|CALL)\b/i;

export function assertReadOnlySqlV1(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new Error('PG18_SUBHELPER_SQL_REQUIRED');
  }
  if (MUTATING_SQL_RE.test(sql)) {
    throw new Error(`PG18_SUBHELPER_MUTATION_BLOCKED:${sql}`);
  }
  return sql;
}

export function normalizeCanonicalPathV1(rawPath) {
  const cleaned = String(rawPath ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..') || cleaned.includes('#')) {
    throw new Error(`PG18_SUBHELPER_INVALID_FILE_PATH:${rawPath}`);
  }
  return cleaned;
}

/**
 * Resolves why `WHERE source_ref_key = ANY($1::text[])` fails when `$1` holds file-level paths:
 * `atlas_ast_nodes.source_ref_key` is a node-grain fragment locator (`path#symbol@start:end`),
 * whereas `atlas_ast_nodes.relative_path` is the normalized lowercased file path.
 */
export function buildPg18IndexedFileLineageQueriesV1() {
  const queries = {
    sourceVersionBindingJoin: assertReadOnlySqlV1(`
      SELECT b.canonical_source_ref,
             b.source_revision,
             b.workspace_revision,
             gf.file_id,
             gf.parse_status,
             gf.content_hash
        FROM atlas_workspace_source_bindings b
        LEFT JOIN graphify_files gf
          ON gf.source_ref = b.canonical_source_ref
         AND COALESCE(gf.code_source_revision, gf.source_revision) = b.source_revision
       WHERE b.repo_id = 'deeds-web-app'
         AND b.canonical_source_ref = ANY($1::text[])
       ORDER BY b.canonical_source_ref ASC;
    `),
    astFileAndSpanJoin: assertReadOnlySqlV1(`
      SELECT relative_path,
             source_ref_key,
             tree_node_id,
             node_kind,
             qualified_symbol,
             source_revision,
             source_content_hash,
             start_byte,
             end_byte
        FROM atlas_ast_nodes
       WHERE relative_path = ANY($1::text[])
       ORDER BY relative_path ASC, start_byte ASC, end_byte ASC;
    `),
    graphifySymbolSpanJoin: assertReadOnlySqlV1(`
      SELECT gf.source_ref,
             COALESCE(gf.code_source_revision, gf.source_revision) AS source_revision,
             gs.symbol_id,
             gs.file_id,
             gs.stable_symbol_key,
             gs.qualified_name,
             gs.symbol_kind,
             gs.start_byte,
             gs.end_byte,
             gs.source_text_hash,
             gs.ast_fingerprint
        FROM graphify_files gf
        JOIN graphify_symbols gs
          ON gs.file_id = gf.file_id
       WHERE gf.source_ref = ANY($1::text[])
       ORDER BY gf.source_ref ASC, gs.start_byte ASC, gs.end_byte ASC;
    `),
    representationRegistryJoin: assertReadOnlySqlV1(`
      SELECT representation_id,
             verification_status,
             lifecycle_status,
             artifact_digest,
             dimension_method
        FROM atlas_representations
       WHERE representation_id = ANY($1::text[])
       ORDER BY representation_id ASC;
    `),
  };

  return Object.freeze(queries);
}

/**
 * Qualifies an indexed PostgreSQL 18 packet/file cohort against exact source revisions,
 * AST node spans, Graphify symbols, and the `atlas_representations` registry.
 */
export function qualifyIndexedPg18PacketCohortV1({
  packets,
  sourceBindings,
  astNodes,
  graphifySymbols,
  representations,
}) {
  if (!Array.isArray(packets)) throw new Error('PG18_SUBHELPER_PACKETS_REQUIRED');

  const bindingsByRef = new Map();
  for (const b of sourceBindings ?? []) {
    if (!b?.canonical_source_ref) continue;
    const key = normalizeCanonicalPathV1(b.canonical_source_ref);
    if (!bindingsByRef.has(key)) bindingsByRef.set(key, []);
    bindingsByRef.get(key).push(b);
  }

  const astByLowerPath = new Map();
  for (const node of astNodes ?? []) {
    if (!node?.relative_path) continue;
    const key = normalizeCanonicalPathV1(node.relative_path).toLowerCase();
    if (!astByLowerPath.has(key)) astByLowerPath.set(key, []);
    astByLowerPath.get(key).push(node);
  }

  const symbolsByRef = new Map();
  for (const sym of graphifySymbols ?? []) {
    if (!sym?.source_ref) continue;
    const key = normalizeCanonicalPathV1(sym.source_ref);
    if (!symbolsByRef.has(key)) symbolsByRef.set(key, []);
    symbolsByRef.get(key).push(sym);
  }

  const verifiedRepresentations = new Map();
  for (const rep of representations ?? []) {
    if (
      rep?.representation_id &&
      rep?.artifact_digest &&
      rep.artifact_digest !== 'unknown' &&
      ['STATIC_VERIFIED', 'SAMPLE_VERIFIED', 'PRODUCTION_VERIFIED'].includes(rep.verification_status)
    ) {
      verifiedRepresentations.set(rep.representation_id, rep);
    }
  }

  const results = [];
  let sourceVersionJoinedCount = 0;
  let astSpanJoinedCount = 0;
  let symbolSpanJoinedCount = 0;
  let representationJoinedCount = 0;

  for (const pkt of packets) {
    const rawRef = pkt?.canonical_source_ref || pkt?.source_ref;
    if (!rawRef) {
      results.push({
        packetId: pkt?.packet_id ?? null,
        status: 'MISSING_SOURCE_REF',
        sourceVersionJoined: false,
        astSpanJoined: false,
        symbolSpanJoined: false,
        representationJoined: false,
      });
      continue;
    }

    const normRef = normalizeCanonicalPathV1(rawRef);
    const matchingBindings = (bindingsByRef.get(normRef) ?? []).filter(
      (b) =>
        SHA256_RE.test(b.source_revision ?? '') &&
        (!pkt.source_revision || b.source_revision === pkt.source_revision) &&
        (!pkt.workspace_revision || !b.workspace_revision || b.workspace_revision === pkt.workspace_revision),
    );
    const uniqueBySourceRevision = new Map(matchingBindings.map((b) => [b.source_revision, b]));
    const sourceVersionJoined = uniqueBySourceRevision.size === 1;
    if (sourceVersionJoined) sourceVersionJoinedCount += 1;

    const boundRevision = sourceVersionJoined
      ? [...uniqueBySourceRevision.keys()][0]
      : pkt.source_revision;
    const pktStart = Number.isInteger(pkt?.byte_start) ? pkt.byte_start : null;
    const pktEnd = Number.isInteger(pkt?.byte_end) ? pkt.byte_end : null;

    const lowerFull = normRef.toLowerCase();
    const lowerStripped = lowerFull.replace(/^sveltekit-frontend\//, '');
    const rawAstCandidates = [
      ...(astByLowerPath.get(lowerFull) ?? []),
      ...(lowerStripped !== lowerFull ? (astByLowerPath.get(lowerStripped) ?? []) : []),
    ];
    const astCandidates = rawAstCandidates.filter((n) => {
      const revOk = !boundRevision || !n.source_revision || n.source_revision === boundRevision;
      const spanOk =
        pktStart === null ||
        pktEnd === null ||
        (Number.isInteger(n.start_byte) &&
          Number.isInteger(n.end_byte) &&
          n.start_byte >= pktStart &&
          n.end_byte <= pktEnd);
      return revOk && spanOk;
    });
    const astSpanJoined = astCandidates.length > 0;
    if (astSpanJoined) astSpanJoinedCount += 1;

    const symCandidates = (symbolsByRef.get(normRef) ?? []).filter((s) => {
      const revOk = !boundRevision || !s.source_revision || s.source_revision === boundRevision;
      const spanOk =
        pktStart === null ||
        pktEnd === null ||
        (Number.isInteger(s.start_byte) &&
          Number.isInteger(s.end_byte) &&
          s.start_byte >= pktStart &&
          s.end_byte <= pktEnd);
      return revOk && spanOk && Boolean(s.stable_symbol_key);
    });
    const symbolSpanJoined = symCandidates.length > 0;
    if (symbolSpanJoined) symbolSpanJoinedCount += 1;

    const hasLatent64 = Buffer.isBuffer(pkt?.latent_64)
      ? pkt.latent_64.length === 256
      : pkt?.latent_64_byte_length === 256;
    const representationJoined = hasLatent64 && verifiedRepresentations.has('latent_64');
    if (representationJoined) representationJoinedCount += 1;

    results.push({
      packetId: pkt.packet_id,
      packetKey: pkt.packet_key ?? null,
      canonicalSourceRef: normRef,
      sourceRevision: boundRevision ?? null,
      sourceVersionJoined,
      astSpanJoined,
      astMatchCount: astCandidates.length,
      symbolSpanJoined,
      symbolMatchCount: symCandidates.length,
      representationJoined,
      status:
        sourceVersionJoined && (astSpanJoined || symbolSpanJoined) && representationJoined
          ? 'QUALIFIED'
          : 'PARTIAL_OR_UNQUALIFIED',
    });
  }

  return {
    schema: PG18_SUBHELPER_COORDINATOR_SCHEMA,
    canonicalAuthority: false,
    writesPerformed: false,
    totalPackets: packets.length,
    sourceVersionJoinedCount,
    astSpanJoinedCount,
    symbolSpanJoinedCount,
    representationJoinedCount,
    results,
  };
}

/**
 * Sub-Helper 1: Tree-sitter CST observation adapter for an indexed PostgreSQL 18 file.
 */
export function runTreeSitterIndexedSubHelperV1({ fileRow, sidecarResponse }) {
  if (!fileRow?.source_ref || !SHA256_RE.test(fileRow?.source_revision ?? '')) {
    throw new Error('TREESITTER_SUBHELPER_INDEXED_FILE_BINDING_REQUIRED');
  }
  const adapted = adaptTreeSitterEvidence({
    sourceRef: normalizeCanonicalPathV1(fileRow.source_ref),
    sourceRevision: fileRow.source_revision,
    response: sidecarResponse,
  });
  return {
    ...adapted,
    fileId: fileRow.file_id ?? null,
    workspaceRevision: fileRow.workspace_revision ?? null,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

/**
 * Sub-Helper 2: ast-grep structural pattern matcher for an indexed PostgreSQL 18 file.
 * Enforces the `.svelte` exclusion boundary (Svelte files belong to `svelte-dom-splitter-v1.mjs`).
 */
export function runAstGrepIndexedSubHelperV1({ fileRow, matches }) {
  if (!fileRow?.source_ref || !SHA256_RE.test(fileRow?.source_revision ?? '')) {
    throw new Error('ASTGREP_SUBHELPER_INDEXED_FILE_BINDING_REQUIRED');
  }
  const sourceRef = normalizeCanonicalPathV1(fileRow.source_ref);
  if (sourceRef.toLowerCase().endsWith('.svelte')) {
    return {
      schema: 'atlas.ast-grep-indexed-observation.v1',
      sourceRef,
      sourceRevision: fileRow.source_revision,
      status: 'SKIPPED_SVELTE_DOM_SPLITTER_AUTHORITY',
      observations: [],
      canonicalAuthority: false,
      writesPerformed: false,
    };
  }

  const observations = (matches ?? []).map((m, idx) => {
    const byteStart = Number(m?.range?.byteOffset?.start ?? m?.byteStart);
    const byteEnd = Number(m?.range?.byteOffset?.end ?? m?.byteEnd);
    if (!Number.isSafeInteger(byteStart) || !Number.isSafeInteger(byteEnd) || byteEnd <= byteStart || byteStart < 0) {
      throw new Error(`ASTGREP_SUBHELPER_INVALID_SPAN:${sourceRef}#${idx}`);
    }
    const ruleId = String(m?.ruleId ?? 'ast-grep-pattern').trim();
    const matchedText = String(m?.text ?? '');
    const observationId = `sg:${crypto
      .createHash('sha256')
      .update(JSON.stringify({ sourceRef, sourceRevision: fileRow.source_revision, ruleId, byteStart, byteEnd }))
      .digest('hex')
      .slice(0, 32)}`;

    return {
      observation_id: observationId,
      source_ref: sourceRef,
      source_revision: fileRow.source_revision,
      rule_id: ruleId,
      byte_start: byteStart,
      byte_end: byteEnd,
      text_sha256: `sha256:${crypto.createHash('sha256').update(matchedText).digest('hex')}`,
      captures: m?.captures ?? {},
      canonical_authority: false,
    };
  });

  return {
    schema: 'atlas.ast-grep-indexed-observation.v1',
    sourceRef,
    sourceRevision: fileRow.source_revision,
    status: 'OK',
    observations,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

/**
 * Sub-Helper 3: LSP symbol crosswalk sub-helper for an indexed PostgreSQL 18 packet.
 */
export function runLspIndexedSymbolCrosswalkSubHelperV1({
  packetKey,
  sourceRef,
  sourceRevision,
  workspaceRevision,
  lspObservations,
  canonicalSymbols,
}) {
  return {
    ...matchPacketAstObservationsToCanonicalSymbolsV1({
      observations: lspObservations,
      symbols: canonicalSymbols,
      packetKey,
      sourceRef: normalizeCanonicalPathV1(sourceRef),
      sourceRevision,
      workspaceRevision,
    }),
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

/**
 * Sub-Helper 4: NLP grounded extraction sub-helper against :8095 sidecar.
 */
export function runNlpIndexedExtractionSubHelperV1({
  fileRow,
  sourceBytes,
  sidecarHealth,
  expectedModuleDigests,
  proposedSpans,
}) {
  if (!fileRow?.source_ref || !SHA256_RE.test(fileRow?.source_revision ?? '')) {
    throw new Error('NLP_SUBHELPER_INDEXED_FILE_BINDING_REQUIRED');
  }
  const bindingCheck = verifySidecarRuntimeBindingV1({
    health: sidecarHealth,
    expectedModuleDigests,
  });
  if (bindingCheck.status !== 'RUNTIME_BINDING_MATCH') {
    return {
      schema: 'atlas.nlp-indexed-observation.v1',
      sourceRef: normalizeCanonicalPathV1(fileRow.source_ref),
      sourceRevision: fileRow.source_revision,
      status: bindingCheck.status,
      groundedSpans: [],
      canonicalAuthority: false,
      writesPerformed: false,
    };
  }

  const rawBuffer = Buffer.isBuffer(sourceBytes) ? sourceBytes : Buffer.from(String(sourceBytes ?? ''), 'utf8');
  const actualDigest = `sha256:${crypto.createHash('sha256').update(rawBuffer).digest('hex')}`;
  if (actualDigest !== fileRow.source_revision) {
    throw new Error('NLP_SUBHELPER_SOURCE_REVISION_MISMATCH');
  }

  const groundedSpans = [];
  for (const span of proposedSpans ?? []) {
    const startByte = Number(span?.startByte);
    const endByte = Number(span?.endByte);
    if (
      !Number.isSafeInteger(startByte) ||
      !Number.isSafeInteger(endByte) ||
      startByte < 0 ||
      endByte <= startByte ||
      endByte > rawBuffer.length
    ) {
      throw new Error('NLP_SUBHELPER_SPAN_OUT_OF_BOUNDS');
    }
    const sliceBytes = rawBuffer.subarray(startByte, endByte);
    const spanDigest = `sha256:${crypto.createHash('sha256').update(sliceBytes).digest('hex')}`;
    groundedSpans.push({
      label: String(span?.label ?? 'entity').trim(),
      startByte,
      endByte,
      spanDigest,
      canonicalAuthority: false,
    });
  }

  return {
    schema: 'atlas.nlp-indexed-observation.v1',
    sourceRef: normalizeCanonicalPathV1(fileRow.source_ref),
    sourceRevision: fileRow.source_revision,
    status: 'GROUNDED_OK',
    groundedSpans,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

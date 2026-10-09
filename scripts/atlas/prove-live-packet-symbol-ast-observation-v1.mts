import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { projectAstPrefillRowToObservationV1 } from './lib/ast-prefill-observation-bridge-v1.mts';
import { buildSymbolSpanDiagnosticV1, compareCurrentNominationSpanV1 } from './lib/symbol-span-diagnostic-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputArg = process.argv[2] ?? `.tmp/atlas/live-packet-symbol-ast-observation-v1-${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}.json`;
const requestedSourceRefs = process.argv.flatMap((value, index, all) => value === '--source-ref' && all[index + 1] ? [all[index + 1]] : []);
const workspaceArgIndex = process.argv.indexOf('--workspace-revision');
const requestedWorkspaceRevision = workspaceArgIndex >= 0 ? process.argv[workspaceArgIndex + 1] : null;
if (requestedWorkspaceRevision && !/^sha256:[0-9a-f]{64}$/i.test(requestedWorkspaceRevision)) throw new Error('INVALID_REQUESTED_WORKSPACE_REVISION');
const outputPath = path.resolve(root, outputArg);
const scratchRoot = path.join(root, '.tmp', 'atlas') + path.sep;
if (!outputPath.startsWith(scratchRoot)) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');

const frontendRequire = createRequire(path.join(root, 'sveltekit-frontend', 'package.json'));
const astGrepPackage = frontendRequire('@ast-grep/napi/package.json');
const { extractAstFeatures } = await import('../../sveltekit-frontend/src/lib/server/analysis/ast-grep-extractor.ts');
const nominationPath = path.join(root, '.tmp', 'atlas', 'graphify-file-index-v1', 'ast-symbol-nominations.jsonl');
const nominationBytes = fs.existsSync(nominationPath) ? fs.readFileSync(nominationPath) : null;
const nominationRows: Array<Record<string, any>> = nominationBytes
  ? nominationBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  : [];
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 12000,
  application_name: 'atlas-live-packet-symbol-ast-observation-proof-v1',
});

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

let receipt: Record<string, unknown>;
const client = await pool.connect();
try {
  await client.query('BEGIN TRANSACTION READ ONLY ISOLATION LEVEL REPEATABLE READ');
  await client.query("SET LOCAL statement_timeout = '12000ms'");
  const candidates = await client.query(`
    SELECT p.packet_key, p.source_ref, p.source_revision,
           p.workspace_revision_key AS workspace_revision,
           v.symbol_version_id, v.stable_symbol_id, v.qualified_name,
           v.source_revision AS symbol_source_revision,
           v.workspace_revision AS symbol_workspace_revision,
           v.byte_start, v.byte_end, v.producer_revision AS symbol_producer_revision,
           v.callable_metadata
      FROM public.atlas_packets p
      JOIN public.atlas_symbol_versions v
        ON v.packet_key = p.packet_key
       AND v.source_ref = p.source_ref
       AND v.source_revision = p.source_revision
       AND v.workspace_revision = p.workspace_revision_key
     WHERE p.source_revision ~ '^sha256:[0-9a-f]{64}$'
       AND p.workspace_revision_key ~ '^sha256:[0-9a-f]{64}$'
       AND v.byte_start IS NOT NULL AND v.byte_end > v.byte_start
       AND v.qualified_name IS NOT NULL
       AND ($1::text[] IS NULL OR p.source_ref = ANY($1::text[]))
     ORDER BY p.source_ref, v.qualified_name, v.symbol_version_id
     LIMIT 100
  `, [requestedSourceRefs.length ? requestedSourceRefs : null]);
  const packetRows = requestedSourceRefs.length
    ? await client.query(`
        SELECT packet_key, source_ref, source_revision, workspace_revision_key
          FROM public.atlas_packets
         WHERE source_ref = ANY($1::text[])
         ORDER BY source_ref, source_revision, packet_key
         LIMIT 500
      `, [requestedSourceRefs])
    : { rows: [] };
  const symbolDiagnostics = requestedSourceRefs.length
    ? await client.query(`
        SELECT p.packet_key, p.source_ref, p.source_revision, p.workspace_revision_key,
          count(v.symbol_version_id)::int AS symbol_row_count,
          count(v.symbol_version_id) FILTER (WHERE v.source_ref = p.source_ref)::int AS source_ref_match_count,
          count(v.symbol_version_id) FILTER (WHERE v.source_revision = p.source_revision)::int AS source_revision_match_count,
          count(v.symbol_version_id) FILTER (WHERE v.workspace_revision = p.workspace_revision_key)::int AS workspace_revision_match_count,
          count(v.symbol_version_id) FILTER (
            WHERE v.source_ref = p.source_ref
              AND v.source_revision = p.source_revision
              AND v.workspace_revision = p.workspace_revision_key
          )::int AS exact_packet_symbol_match_count,
          count(v.symbol_version_id) FILTER (
            WHERE v.source_ref = p.source_ref
              AND v.source_revision = p.source_revision
              AND v.workspace_revision = p.workspace_revision_key
              AND v.byte_start IS NOT NULL AND v.byte_end > v.byte_start
              AND v.qualified_name IS NOT NULL
          )::int AS usable_exact_symbol_count
        FROM public.atlas_packets p
        LEFT JOIN public.atlas_symbol_versions v ON v.packet_key = p.packet_key
        WHERE p.source_ref = ANY($1::text[])
        GROUP BY p.packet_key, p.source_ref, p.source_revision, p.workspace_revision_key
        ORDER BY p.source_ref, p.source_revision, p.packet_key
      LIMIT 500
      `, [requestedSourceRefs])
    : { rows: [] };
  const graphifySymbolDiagnostics = requestedSourceRefs.length
    ? await client.query(`
        SELECT p.packet_key, p.source_ref, p.source_revision, p.workspace_revision_key,
          count(DISTINCT gs.symbol_id)::int AS graphify_symbol_count,
          count(DISTINCT gs.symbol_id) FILTER (WHERE gf.code_source_revision = p.source_revision)::int AS source_revision_match_count,
          count(DISTINCT gs.symbol_id) FILTER (WHERE gf.workspace_revision = p.workspace_revision_key)::int AS workspace_revision_match_count,
          count(DISTINCT gs.symbol_id) FILTER (
            WHERE gf.code_source_revision = p.source_revision
              AND gf.workspace_revision = p.workspace_revision_key
          )::int AS exact_source_workspace_symbol_count,
          count(DISTINCT gf.file_id)::int AS graphify_file_count,
          count(DISTINCT b.canonical_source_ref)::int AS admitted_binding_count,
          count(DISTINCT gs.symbol_id) FILTER (
            WHERE b.canonical_source_ref IS NOT NULL
              AND gf.code_source_revision = b.source_revision
          )::int AS symbols_matching_admitted_binding_count,
          count(DISTINCT v.symbol_version_id)::int AS existing_symbol_version_links,
          count(DISTINCT v.symbol_version_id) FILTER (
            WHERE v.source_ref = p.source_ref
              AND v.source_revision = p.source_revision
              AND v.workspace_revision = p.workspace_revision_key
          )::int AS exact_packet_revision_symbol_version_links,
          array_agg(DISTINCT gf.workspace_revision) FILTER (WHERE gf.file_id IS NOT NULL) AS graphify_workspace_revisions,
          array_agg(DISTINCT gf.code_source_revision) FILTER (WHERE gf.file_id IS NOT NULL) AS graphify_code_source_revisions
        FROM public.atlas_packets p
        LEFT JOIN public.graphify_files gf ON gf.source_ref = p.source_ref
        LEFT JOIN public.graphify_symbols gs ON gs.file_id = gf.file_id
        LEFT JOIN public.atlas_symbol_versions v
          ON v.upstream_symbol_id = gs.symbol_id::text
          OR v.upstream_node_id = gs.symbol_id::text
        LEFT JOIN public.atlas_workspace_source_bindings b
          ON b.repo_id = 'deeds-web-app'
         AND b.workspace_revision = $2::text
         AND b.canonical_source_ref = p.source_ref
         AND b.source_revision = p.source_revision
        WHERE p.source_ref = ANY($1::text[])
        GROUP BY p.packet_key, p.source_ref, p.source_revision, p.workspace_revision_key
        ORDER BY p.source_ref, p.source_revision, p.packet_key
        LIMIT 500
      `, [requestedSourceRefs, requestedWorkspaceRevision])
    : { rows: [] };
  const graphifySymbolRows = requestedSourceRefs.length && requestedWorkspaceRevision
    ? await client.query(`
        SELECT p.packet_key, p.source_ref, p.source_revision, p.workspace_revision_key,
          b.source_revision AS binding_source_revision,
          b.workspace_revision AS binding_workspace_revision,
          gs.symbol_id, gs.stable_symbol_key, gs.symbol_kind, gs.qualified_name,
          gs.start_byte, gs.end_byte, gs.source_text_hash, gs.ast_fingerprint
        FROM public.atlas_packets p
        JOIN public.atlas_workspace_source_bindings b
          ON b.repo_id = 'deeds-web-app'
         AND b.workspace_revision = $2::text
         AND b.canonical_source_ref = p.source_ref
         AND b.source_revision = p.source_revision
        JOIN public.graphify_files gf
          ON gf.source_ref = b.canonical_source_ref
         AND gf.code_source_revision = b.source_revision
        JOIN public.graphify_symbols gs ON gs.file_id = gf.file_id
        WHERE p.source_ref = ANY($1::text[])
          AND p.workspace_revision_key = $2::text
        ORDER BY p.source_ref, gs.qualified_name, gs.symbol_id
        LIMIT 1000
      `, [requestedSourceRefs, requestedWorkspaceRevision])
    : { rows: [] };
  const graphifySpanDiagnostics = graphifySymbolRows.rows.map((row) => {
    const sourcePath = path.resolve(root, row.source_ref);
    const relative = path.relative(root, sourcePath);
    const pathSafe = Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    const sourceBytes = pathSafe && fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath) : null;
    const sourceRevisionMatches = sourceBytes !== null && sha256(sourceBytes) === row.source_revision
      && row.binding_source_revision === row.source_revision
      && row.binding_workspace_revision === requestedWorkspaceRevision;
    const startByte = Number(row.start_byte);
    const endByte = Number(row.end_byte);
    const spanBoundsValid = sourceBytes !== null && Number.isInteger(startByte) && Number.isInteger(endByte)
      && startByte >= 0 && endByte > startByte && endByte <= sourceBytes.length;
    const spanBytes = spanBoundsValid && sourceBytes !== null ? sourceBytes.subarray(startByte, endByte) : null;
    const spanSha256 = spanBytes ? createHash('sha256').update(spanBytes).digest('hex') : null;
    const sourceTextHashMatches = spanSha256 !== null && spanSha256.slice(0, 12) === String(row.source_text_hash ?? '').toLowerCase();
    const astFingerprintMatches = spanSha256 !== null && spanSha256 === String(row.ast_fingerprint ?? '').toLowerCase();
    return {
      packetKey: row.packet_key,
      symbolId: row.symbol_id,
      stableSymbolKey: row.stable_symbol_key,
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
      workspaceRevision: row.workspace_revision_key,
      symbolKind: row.symbol_kind,
      qualifiedName: row.qualified_name,
      startByte,
      endByte,
      sourceRevisionMatches,
      spanBoundsValid,
      sourceTextHashMatches,
      astFingerprintMatches,
      spanStatus: sourceRevisionMatches && spanBoundsValid && sourceTextHashMatches && astFingerprintMatches
        ? 'RAW_SOURCE_SPAN_AND_HASHES_MATCH'
        : 'UNVERIFIED_OR_MISMATCHED',
      canonicalAuthority: false,
    };
  });
  const graphifySpanSummary = {
    rowCount: graphifySpanDiagnostics.length,
    sourceRevisionMatches: graphifySpanDiagnostics.filter((row) => row.sourceRevisionMatches).length,
    spanBoundsValid: graphifySpanDiagnostics.filter((row) => row.spanBoundsValid).length,
    sourceTextHashMatches: graphifySpanDiagnostics.filter((row) => row.sourceTextHashMatches).length,
    astFingerprintMatches: graphifySpanDiagnostics.filter((row) => row.astFingerprintMatches).length,
    fullyVerified: graphifySpanDiagnostics.filter((row) => row.spanStatus === 'RAW_SOURCE_SPAN_AND_HASHES_MATCH').length,
    sample: graphifySpanDiagnostics.slice(0, 12),
  };
  const packetDiagnostics = packetRows.rows.map((row) => {
    const sourcePath = path.resolve(root, row.source_ref);
    const relative = path.relative(root, sourcePath);
    let sourceByteRevisionMatches = false;
    if (!relative.startsWith('..') && !path.isAbsolute(relative) && fs.existsSync(sourcePath)) {
      sourceByteRevisionMatches = sha256(fs.readFileSync(sourcePath)) === row.source_revision;
    }
    return {
      packetKey: row.packet_key,
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
      workspaceRevision: row.workspace_revision_key,
      sourceByteRevisionMatches,
      workspaceRevisionMatchesRequested: requestedWorkspaceRevision
        ? row.workspace_revision_key === requestedWorkspaceRevision
        : null,
    };
  });

  let proven: Record<string, unknown> | null = null;
  const spanMismatches: Array<Record<string, unknown>> = [];
  const spanDiagnostics: Array<Record<string, unknown>> = [];
  const attemptedSources = new Map<string, { bytes: Buffer; sourceText: string; features: Awaited<ReturnType<typeof extractAstFeatures>> }>();
  for (const candidate of candidates.rows) {
    const sourcePath = path.resolve(root, candidate.source_ref);
    const relative = path.relative(root, sourcePath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(sourcePath)) continue;
    const sourceRealPath = realpathSync(sourcePath);
    const realRelative = path.relative(root, sourceRealPath);
    if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) continue;
    let parsed = attemptedSources.get(candidate.source_ref);
    if (!parsed) {
      const bytes = fs.readFileSync(sourceRealPath);
      if (sha256(bytes) !== candidate.source_revision) continue;
      const sourceText = bytes.toString('utf8');
      const features = await extractAstFeatures(sourceText, candidate.source_ref);
      parsed = { bytes, sourceText, features };
      attemptedSources.set(candidate.source_ref, parsed);
    }
    if (candidate.symbol_source_revision !== candidate.source_revision
      || candidate.symbol_workspace_revision !== candidate.workspace_revision) continue;
    const startByte = Number(candidate.byte_start);
    const endByte = Number(candidate.byte_end);
    const namedMatches = parsed.features.filter((feature) =>
      (feature.name === candidate.qualified_name || feature.name.endsWith(`.${candidate.qualified_name}`))
      && ['ast_function', 'ast_class', 'ast_method'].includes(feature.type));
    const match = namedMatches.find((feature) => feature.byteStart === startByte && feature.byteEnd === endByte);
    for (const feature of namedMatches) {
      const nodeKind = feature.type === 'ast_method' ? 'method_definition'
        : feature.type === 'ast_class' ? 'class_declaration' : 'function_declaration';
      const diagnostic = buildSymbolSpanDiagnosticV1({
        stored: {
          packetKey: candidate.packet_key,
          symbolVersionId: candidate.symbol_version_id,
          sourceRef: candidate.source_ref,
          sourceRevision: candidate.source_revision,
          name: candidate.qualified_name,
          start: startByte,
          end: endByte,
          producerRevision: candidate.symbol_producer_revision,
          sourceKind: candidate.callable_metadata?.kind ?? null,
          sourceLanguage: candidate.callable_metadata?.language ?? null,
          sourceExtractor: candidate.callable_metadata?.extractor ?? null,
          nominationId: candidate.callable_metadata?.nomination_id ?? null,
          coordinateEncoding: null,
          nodeKind: null,
          spanSemantic: null,
        },
        observed: {
          name: feature.name,
          start: feature.byteStart,
          end: feature.byteEnd,
          grammarId: `@ast-grep/napi@${astGrepPackage.version}`,
          nodeKind,
          producerRevision: `@ast-grep/napi@${astGrepPackage.version}`,
        },
        sourceBytes: parsed.bytes,
        sourceText: parsed.sourceText,
      });
      spanDiagnostics.push({
        ...diagnostic,
        currentNominationCrosscheck: compareCurrentNominationSpanV1({
          stored: {
            sourceRef: candidate.source_ref,
            sourceRevision: candidate.source_revision,
            name: candidate.qualified_name,
            start: startByte,
            end: endByte,
            nominationId: candidate.callable_metadata?.nomination_id ?? null,
          },
          observed: { start: feature.byteStart, end: feature.byteEnd },
          nominationRows,
        }),
      });
    }
    if (!match) {
      for (const feature of namedMatches) {
        spanMismatches.push({
          packetKey: candidate.packet_key,
          symbolVersionId: candidate.symbol_version_id,
          qualifiedName: candidate.qualified_name,
          storedSpan: { byteStart: startByte, byteEnd: endByte },
          astGrepSpan: { byteStart: feature.byteStart, byteEnd: feature.byteEnd },
          startDeltaBytes: feature.byteStart == null ? null : startByte - feature.byteStart,
          endDeltaBytes: feature.byteEnd == null ? null : endByte - feature.byteEnd,
          sourceRevision: candidate.source_revision,
          storedProducerRevision: candidate.symbol_producer_revision,
          observedProducerRevision: `@ast-grep/napi@${astGrepPackage.version}`,
        });
      }
      continue;
    }
    const syntaxKind = match.type === 'ast_class' ? 'class_declaration'
      : match.type === 'ast_method' ? 'method_definition' : 'function_declaration';
    const bridge = await projectAstPrefillRowToObservationV1({
      repoRoot: root,
      row: {
        packet_key: candidate.packet_key,
        source_ref: candidate.source_ref,
        source_revision: candidate.source_revision,
        workspace_revision: candidate.workspace_revision,
        resolved_path: candidate.source_ref,
        start_byte: startByte,
        end_byte: endByte,
        name: candidate.qualified_name,
        symbol_kind: syntaxKind,
        ast_kind: syntaxKind,
        extractor_revision: `@ast-grep/napi@${astGrepPackage.version}`,
      },
    });
    if ('rejection' in bridge) continue;
    if (!proven) proven = {
      packetKey: candidate.packet_key,
      sourceRef: candidate.source_ref,
      sourceRevision: candidate.source_revision,
      workspaceRevision: candidate.workspace_revision,
      stableSymbolId: candidate.stable_symbol_id,
      symbolVersionId: candidate.symbol_version_id,
      qualifiedName: candidate.qualified_name,
      symbolProducerRevision: candidate.symbol_producer_revision,
      byteStart: startByte,
      byteEnd: endByte,
      sourceBytesChecksum: candidate.source_revision,
      spanChecksum: createHash('sha256').update(parsed.bytes.subarray(startByte, endByte)).digest('hex'),
      astGrepExtractorRevision: `@ast-grep/napi@${astGrepPackage.version}`,
      astObservation: bridge.row.observation,
      admissionStatus: bridge.row.admissionStatus,
      canonicalAuthority: false,
    };
  }
  const status = proven ? 'READ_ONLY_SOURCE_AND_AST_OBSERVATION_MATCH'
    : spanMismatches.length ? 'BLOCKED_SYMBOL_SPAN_MISMATCH' : 'BLOCKED_NO_EXACT_AST_MATCH';
  const payload = {
    schema: 'atlas.live-packet-symbol-ast-observation-proof.v1',
    status,
    candidateRowsInspected: candidates.rows.length,
    packetRowsForRequestedSources: packetDiagnostics,
    symbolDiagnostics: symbolDiagnostics.rows,
    graphifySymbolDiagnostics: graphifySymbolDiagnostics.rows,
    graphifySpanSummary,
    requestedSourceRefs: requestedSourceRefs.length ? requestedSourceRefs : null,
    requestedWorkspaceRevision,
    sourceFilesParsed: attemptedSources.size,
    exactBinding: proven,
    spanMismatchCount: spanMismatches.length,
    spanMismatchSamples: spanMismatches.slice(0, 12),
    spanDiagnosticCount: spanDiagnostics.length,
    spanDiagnosticSamples: spanDiagnostics.slice(0, 24),
    currentNominationArtifact: {
      path: '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl',
      present: nominationBytes !== null,
      checksum: nominationBytes ? sha256(nominationBytes) : null,
      rowCount: nominationRows.length,
      authority: 'DIAGNOSTIC_ONLY',
    },
    databaseTransaction: 'REPEATABLE_READ_READ_ONLY_ROLLED_BACK',
    canonicalAuthority: false,
    persistentStoreWritesPerformed: false,
  };
  receipt = { ...payload, checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as typeof receipt;
const { checksum: readbackChecksum, ...readbackPayload } = readback;
const recomputed = createHash('sha256').update(JSON.stringify(readbackPayload)).digest('hex');
if (recomputed !== readbackChecksum) throw new Error('PROOF_RECEIPT_READBACK_CHECKSUM_MISMATCH');
console.log(JSON.stringify({
  status: readback.status,
  packetKey: (readback.exactBinding as Record<string, any> | null)?.packetKey ?? null,
  symbolVersionId: (readback.exactBinding as Record<string, any> | null)?.symbolVersionId ?? null,
  sourceRevision: (readback.exactBinding as Record<string, any> | null)?.sourceRevision ?? null,
  observationId: (readback.exactBinding as Record<string, any> | null)?.astObservation?.observation_id ?? null,
  spanMismatchCount: readback.spanMismatchCount,
  packetRowsForRequestedSources: (readback.packetRowsForRequestedSources as unknown[] | undefined)?.length ?? 0,
  registryCompilation: 'NOT_RUN_REVIEW_REQUIRED',
  receiptReadback: 'MATCH',
  reportPath: path.relative(root, outputPath),
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
}, null, 2));

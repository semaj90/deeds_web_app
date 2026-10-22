#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { compareFunctionNativeAstReadbackV1 } from './lib/function-native-source-alignment-v1.mjs';
import { assertCompleteAstScan } from './lib/source-observation-http-v1.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const symbolArg = process.argv.find((arg) => arg.startsWith('--symbol-version-id='));
const symbolVersionId = symbolArg?.slice('--symbol-version-id='.length).trim();
const nativeAstArg = process.argv.find((arg) => arg.startsWith('--ast-url='));
const nativeAstUrl = nativeAstArg ? new URL('/ast/chunk', nativeAstArg.slice('--ast-url='.length)) : null;
if (nativeAstUrl && (!['http:', 'https:'].includes(nativeAstUrl.protocol) || nativeAstUrl.username || nativeAstUrl.password)) {
  throw new Error('AST_URL_INVALID');
}
if (!symbolVersionId || symbolVersionId.length > 256) {
  console.error('Usage: node scripts/atlas/audit-function-source-readback-v1.mjs --symbol-version-id=<canonical-id> [--ast-url=<sidecar-base-url>]');
  process.exit(2);
}

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 12000,
  application_name: 'atlas-function-source-readback-audit-v1',
});

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalizeDigest = (value) => String(value ?? '').replace(/^sha256:/i, '').toLowerCase();
const sourcePath = (sourceRef) => {
  if (!sourceRef || sourceRef.length > 2048 || path.isAbsolute(sourceRef) || sourceRef.includes('\0')) return null;
  const normalized = sourceRef.replaceAll('\\', '/');
  if (normalized.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  const resolved = path.resolve(root, normalized);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
};

const client = await pool.connect();
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const transactionReadOnly = (await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only === 'on';
  if (!transactionReadOnly) throw new Error('FUNCTION_SOURCE_READ_ONLY_NOT_CONFIRMED');
  const symbols = (await client.query(`
    SELECT symbol_version_id, packet_key, source_ref, source_revision, workspace_revision,
      byte_start, byte_end, qualified_name, upstream_node_id, upstream_symbol_id,
      callable_metadata->>'language' AS language
    FROM public.atlas_symbol_versions
    WHERE symbol_version_id = $1
    LIMIT 2
  `, [symbolVersionId])).rows;
  if (symbols.length !== 1) {
    console.log(JSON.stringify({ schema: 'atlas.function-source-readback-audit.v1', status: symbols.length ? 'AMBIGUOUS_SYMBOL' : 'SYMBOL_NOT_FOUND', symbolVersionId, symbolRows: symbols.length, writesPerformed: false }, null, 2));
    await client.query('ROLLBACK');
    process.exitCode = 0;
  } else {
    const symbol = symbols[0];
    const bindings = await client.query(`SELECT repo_id, canonical_source_ref, source_revision, workspace_revision, content_digest, byte_length, git_blob_oid, binding_checksum FROM public.atlas_workspace_source_bindings WHERE canonical_source_ref = $1 AND source_revision = $2 AND workspace_revision = $3 LIMIT 3`, [symbol.source_ref, symbol.source_revision, symbol.workspace_revision]);
    const packets = await client.query(`SELECT packet_key, source_ref, source_revision, workspace_revision_key, content_hash, artifact_id, ARRAY(SELECT e.key FROM jsonb_each(payload) e) AS payload_keys FROM public.atlas_packets WHERE packet_key = $1 LIMIT 3`, [symbol.packet_key]);
    const packetRegistry = await client.query(`SELECT packet_key, source_ref, canonical_source_ref, file_path, seaweedfs_filer_path, total_size_bytes, title_id, tree_node_id, status FROM public.atlas_packet_registry WHERE packet_key = $1 OR canonical_source_ref = $2 OR source_ref = $2 LIMIT 10`, [symbol.packet_key, symbol.source_ref]);
    const rpcPackets = await client.query(`SELECT packet_key, source_ref, content_hash, payload_contract_version, octet_length(msgpack) AS msgpack_bytes FROM public.atlas_rpc_packets WHERE packet_key = $1 AND source_ref = $2 LIMIT 3`, [symbol.packet_key, symbol.source_ref]);
    const artifacts = await client.query(`SELECT artifact_id::text, artifact_type, storage_backend, (storage_location IS NOT NULL) AS has_storage_location, content_hash, status FROM public.atlas_artifacts WHERE packet_key = $1 AND source_ref = $2 LIMIT 16`, [symbol.packet_key, symbol.source_ref]);
    const sourceRefs = await client.query(`SELECT source_ref_key, content_hash, CASE WHEN jsonb_typeof(fragments) = 'array' THEN jsonb_array_length(fragments) ELSE NULL END AS fragment_count, octet_length(fragments::text) AS fragments_json_bytes FROM public.atlas_source_refs WHERE relative_path = $1 AND content_hash = ANY($2::text[]) LIMIT 8`, [symbol.source_ref, [symbol.source_revision, normalizeDigest(symbol.source_revision)]]);
    const chunks = await client.query(`SELECT id::text AS chunk_row_id, source_ref, line_start, line_end, content, file_content_hash, source_revision, workspace_revision, metadata->>'packet_key' AS metadata_packet_key, output_meta->>'packet_key' AS output_packet_key, metadata->>'symbol_version_id' AS metadata_symbol_version_id, output_meta->>'symbol_version_id' AS output_symbol_version_id, COUNT(*) OVER ()::int AS total_matching_rows FROM public.codebase_chunk_index WHERE relative_path = $1 AND file_content_hash = $2 ORDER BY line_start, line_end, id LIMIT 128`, [symbol.source_ref, normalizeDigest(symbol.source_revision)]);
    const packetChunkLineage = await client.query(`SELECT id::text AS lineage_id, canonical_chunk_id, chunk_row_id::text AS chunk_row_id, source_revision, membership_status, revision_status FROM public.atlas_packet_chunk_lineage WHERE packet_key = $1 AND source_ref = $2 ORDER BY id LIMIT 129`, [symbol.packet_key, symbol.source_ref]);

    const expectedDigest = normalizeDigest(symbol.source_revision);
    const localPath = sourcePath(symbol.source_ref);
    let local = { available: false, digestMatches: false, byteLength: null };
    let verifiedLocalBytes = null;
    if (localPath) {
      try {
        const [rootReal, fileReal] = await Promise.all([realpath(root), realpath(localPath)]);
        if (fileReal.startsWith(`${rootReal}${path.sep}`) && (await stat(fileReal)).size <= 16 * 1024 * 1024) {
          const bytes = await readFile(fileReal);
          const digest = sha256(bytes);
          local = { available: true, digestMatches: digest === expectedDigest, byteLength: bytes.byteLength };
          if (digest === expectedDigest && bytes.byteLength <= 16 * 1024 * 1024) verifiedLocalBytes = bytes;
        }
      } catch {}
    }

    const lineMap = new Map();
    const conflicts = new Set();
    const missingRows = [];
    let maxLine = 0;
    for (const chunk of chunks.rows) {
      const start = Number(chunk.line_start);
      const end = Number(chunk.line_end);
      maxLine = Math.max(maxLine, end);
      const lines = String(chunk.content).replace(/\r\n/g, '\n').split('\n');
      if (lines.at(-1) === '') lines.pop();
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || lines.length !== end - start + 1) {
        missingRows.push({ start, end, contentLines: lines.length });
        continue;
      }
      lines.forEach((line, offset) => {
        const number = start + offset;
        if (lineMap.has(number) && lineMap.get(number) !== line) conflicts.add(number);
        else lineMap.set(number, line);
      });
    }
    const missingLines = [];
    for (let line = 1; line <= maxLine; line += 1) if (!lineMap.has(line)) missingLines.push(line);
    const assembled = Array.from({ length: maxLine }, (_, index) => lineMap.get(index + 1) ?? '');
    const chunkMatches = [];
    if (missingLines.length === 0 && conflicts.size === 0 && missingRows.length === 0) {
      for (const newline of ['\n', '\r\n']) {
        for (const finalNewline of ['', newline]) {
          const bytes = Buffer.from(assembled.join(newline) + finalNewline, 'utf8');
          if (sha256(bytes) === expectedDigest) chunkMatches.push({ byteLength: bytes.byteLength, newline: newline === '\n' ? 'LF' : 'CRLF', finalNewline: Boolean(finalNewline) });
        }
      }
    }

    const commits = execFileSync('git', ['rev-list', '--all', '--max-count=2000', '--', symbol.source_ref], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim().split(/\r?\n/).filter(Boolean);
    const gitMatches = [];
    for (const commit of commits) {
      try {
        const bytes = execFileSync('git', ['show', `${commit}:${symbol.source_ref}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
        if (sha256(bytes) === expectedDigest) gitMatches.push({ commit, byteLength: bytes.byteLength });
      } catch {}
    }

    const binding = bindings.rows.length === 1 ? bindings.rows[0] : null;
    const bindingValid = Boolean(binding
      && normalizeDigest(binding.content_digest) === expectedDigest
      && Number(binding.byte_length) > 0);
    const exactPacketRows = packets.rows.filter((row) => row.packet_key === symbol.packet_key
      && row.source_ref === symbol.source_ref
      && row.source_revision === symbol.source_revision
      && row.workspace_revision_key === symbol.workspace_revision).length;
    const expectedByteLength = binding ? Number(binding.byte_length) : null;
    const exactBytesAvailable = (local.digestMatches && local.byteLength === expectedByteLength)
      || chunkMatches.some((match) => match.byteLength === expectedByteLength)
      || gitMatches.some((match) => match.byteLength === expectedByteLength);
    const status = (exactBytesAvailable && bindingValid && exactPacketRows === 1)
      ? 'EXACT_SOURCE_BYTES_FOUND'
      : 'EXACT_SOURCE_BYTES_NOT_FOUND';
    let nativeAst = { status: 'NOT_REQUESTED', reason: null };
    if (nativeAstUrl) {
      nativeAst = { status: 'REJECTED', reason: 'EXACT_LOCAL_SOURCE_NOT_AVAILABLE' };
      if (status === 'EXACT_SOURCE_BYTES_FOUND' && verifiedLocalBytes && local.byteLength === expectedByteLength) {
        try {
          const sourceBytes = verifiedLocalBytes;
          const sourceText = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
          if (sourceText.length > 200000) throw new Error('NATIVE_SOURCE_LIMIT_EXCEEDED');
          if (!['typescript', 'tsx', 'javascript', 'jsx', 'python', 'cpp'].includes(symbol.language)) throw new Error('NATIVE_LANGUAGE_UNSUPPORTED');
          const response = await fetch(nativeAstUrl, {
            method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error',
            body: JSON.stringify({ source: sourceText, language: symbol.language, filePath: symbol.source_ref, sourceRevision: symbol.source_revision }),
            signal: AbortSignal.timeout(20000),
          });
          if (!response.ok) throw new Error(`NATIVE_HTTP_${response.status}`);
          if (!response.body) throw new Error('NATIVE_RESPONSE_BODY_MISSING');
          const responseChunks = [];
          let responseByteCount = 0;
          for await (const chunk of response.body) {
            responseByteCount += chunk.byteLength;
            if (responseByteCount > 8 * 1024 * 1024) throw new Error('NATIVE_RESPONSE_LIMIT_EXCEEDED');
            responseChunks.push(chunk);
          }
          const responseBytes = Buffer.concat(responseChunks, responseByteCount);
          const evidence = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(responseBytes));
          // Fail closed: a partial or unreceipted native scan is REJECTED, never compared as admitted evidence.
          assertCompleteAstScan(evidence);
          nativeAst = { ...compareFunctionNativeAstReadbackV1({
            symbol: { symbolVersionId, packetKey: symbol.packet_key, sourceRef: symbol.source_ref,
              sourceRevision: symbol.source_revision, workspaceRevision: symbol.workspace_revision,
              qualifiedName: symbol.qualified_name, language: symbol.language, upstreamNodeId: symbol.upstream_node_id,
              upstreamSymbolId: symbol.upstream_symbol_id, startByte: Number(symbol.byte_start), endByte: Number(symbol.byte_end) },
            sourceBytes, evidence,
          }), responseSha256: sha256(responseBytes) };
        } catch (error) {
          nativeAst = { status: 'REJECTED', reason: error instanceof Error ? error.message : 'NATIVE_READ_FAILED' };
        }
      }
      if (nativeAst.status !== 'SOURCE_NATIVE_AST_ALIGNED') process.exitCode = 3;
    }
    console.log(JSON.stringify({
      schema: 'atlas.function-source-readback-audit.v1',
      status,
      transactionReadOnly,
      auditImplementationChecksum: `sha256:${sha256(await readFile(new URL(import.meta.url)))}`,
      canonical: { symbolVersionId, packetKey: symbol.packet_key, sourceRef: symbol.source_ref, sourceRevision: symbol.source_revision, workspaceRevision: symbol.workspace_revision, byteStart: symbol.byte_start, byteEnd: symbol.byte_end },
      binding: { rowCount: bindings.rows.length, uniqueExactBinding: bindings.rows.length === 1, byteLength: binding?.byte_length ?? null, gitBlobOidPresent: Boolean(binding?.git_blob_oid), contentDigestMatchesSourceRevision: binding ? normalizeDigest(binding.content_digest) === expectedDigest : false, bindingValid },
      packetRows: packets.rows.length,
      exactPacketRows,
      packetPayloadKeys: packets.rows[0]?.payload_keys ?? [],
      packetRegistry: packetRegistry.rows.map((row) => ({ packetKey: row.packet_key, sourceRef: row.source_ref, canonicalSourceRef: row.canonical_source_ref, filePathPresent: Boolean(row.file_path), seaweedfsFilerPathPresent: Boolean(row.seaweedfs_filer_path), totalSizeBytes: row.total_size_bytes, titleIdPresent: Boolean(row.title_id), treeNodeIdPresent: Boolean(row.tree_node_id), status: row.status })),
      rpcPackets: rpcPackets.rows,
      artifacts: artifacts.rows,
      sourceRefProjection: sourceRefs.rows,
      chunkProjection: {
        rowCount: chunks.rows.length,
        totalMatchingRows: chunks.rows[0]?.total_matching_rows ?? 0,
        truncated: (chunks.rows[0]?.total_matching_rows ?? 0) > chunks.rows.length,
        rows: chunks.rows.map((row) => ({
          chunkRowId: row.chunk_row_id,
          sourceRef: row.source_ref,
          lineStart: row.line_start,
          lineEnd: row.line_end,
          sourceRevision: row.source_revision,
          workspaceRevision: row.workspace_revision,
          metadataPacketKey: row.metadata_packet_key,
          outputPacketKey: row.output_packet_key,
          metadataSymbolVersionId: row.metadata_symbol_version_id,
          outputSymbolVersionId: row.output_symbol_version_id,
          sourceRevisionMatches: row.source_revision === symbol.source_revision,
          workspaceRevisionMatches: row.workspace_revision === symbol.workspace_revision,
        })),
        maxLine, coveredLines: lineMap.size, missingLineCount: missingLines.length,
        conflictingLineCount: conflicts.size, malformedChunkRows: missingRows.length,
        reconstructedDigestMatches: chunkMatches.length > 0, matchingVariants: chunkMatches,
      },
      packetChunkLineage: {
        rows: packetChunkLineage.rows.slice(0, 128),
        truncated: packetChunkLineage.rows.length > 128,
        canonicalAdmissionProven: false,
      },
      workingTree: local,
      gitHistory: { commitsExamined: commits.length, matchingBlobs: gitMatches },
      exactSourceBytesVerified: status === 'EXACT_SOURCE_BYTES_FOUND',
      nativeAst,
      contextManifestAdmitted: false,
      writesPerformed: false,
      canonicalAuthority: false,
    }, null, 2));
    await client.query('ROLLBACK');
  }
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

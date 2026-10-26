#!/usr/bin/env node
/**
 * HISTORICAL_CHUNK_01 Revision-Aware Historical Chunk Resolver (v2)
 *
 * Connects stored codebase chunks to current source bytes, AST symbols,
 * candidate ordinals, and historical Git revisions.
 *
 * Distinguishes:
 * - CURRENT_SOURCE_VERIFIED: chunk body matches current source bytes. Eligible for current repair.
 * - HISTORICAL_SOURCE_MATCH: chunk body matches an older Git revision. Labeled historical; BLOCKED from current repair.
 * - SOURCE_CONTENT_MISMATCH: chunk body does not match current source or historical Git commits.
 * - AMBIGUOUS_SOURCE_MATCH: chunk body matches multiple ambiguous commits or conflicting files.
 * - UNVERIFIED_DIGEST_SCOPE: hash scope or algorithm is undeclared or unverifiable.
 *
 * INVARIANTS:
 * - readOnly: true
 * - writesPerformed: false
 * - canonicalAuthority: false
 * - admissionAuthorized: false
 * - Never silently rewrites the chunk's canonical revision field.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMMIT_CAP_DEFAULT = 20;

export const SCHEMA_V2 = 'atlas.historical-chunk-resolver.v2';
export const GATE_NAME = 'HISTORICAL_CHUNK_01';

export function sha256Hex(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function normalizeLineBreaks(str) {
  return String(str ?? '').replace(/\r\n/g, '\n');
}

/**
 * Pure evaluation function for a single chunk against current source text and git history.
 *
 * @param {Object} chunk
 * @param {string|null} currentFileContent
 * @param {Array<{commit: string, content: string}>} historicalCommits
 * @returns {Object}
 */
export function evaluateChunkHistoricalLineage(chunk, currentFileContent, historicalCommits = []) {
  const storedContent = normalizeLineBreaks(chunk.content ?? '').trim();
  const storedBodySha256 = sha256Hex(storedContent);
  const mismatches = [];

  // Check digest scope
  let digestScope = 'UNKNOWN';
  if (chunk.content_hash_scope || chunk.content_hash_algorithm) {
    digestScope = `${chunk.content_hash_algorithm || 'SHA256'}_${chunk.content_hash_scope || 'EXACT'}`;
  } else if (chunk.content_hash) {
    digestScope = 'UNKNOWN';
  }

  // Digest scope check
  if (!chunk.content_hash_scope && !chunk.content_hash_algorithm && chunk.requireStrictScope) {
    mismatches.push('UNVERIFIED_DIGEST_SCOPE: content_hash_scope and algorithm not declared');
    return {
      chunkId: chunk.id,
      relativePath: chunk.relative_path,
      sourceRef: chunk.source_ref ?? chunk.relative_path,
      candidateOrdinal: chunk.candidate_ordinal ?? null,
      currentGitRevision: chunk.currentGitRevision,
      historicalGitRevision: null,
      status: 'UNVERIFIED_DIGEST_SCOPE',
      storedBodySha256,
      currentBodySha256: null,
      historicalBodySha256: null,
      digestScope,
      storedPacketChunkLineage: {
        lineageStatus: chunk.lineage_status || 'PROVEN',
        storedContentHash: chunk.content_hash || null,
        storedFileContentHash: chunk.file_content_hash || null,
        lineRange: [Number(chunk.line_start ?? 0), Number(chunk.line_end ?? 0)],
      },
      mismatches,
      affectedSymbolVersions: extractSymbolVersions(chunk),
      currentSourceSpanVerified: false,
      eligibleForCurrentRepair: false,
    };
  }

  // 1. Current Source Evaluation
  if (currentFileContent != null) {
    const currentNorm = normalizeLineBreaks(currentFileContent);
    const lines = currentNorm.split('\n');
    const startLine = Math.max(0, Number(chunk.line_start ?? 1) - 1);
    const endLine = Math.max(startLine, Number(chunk.line_end ?? lines.length));
    const windowText = lines.slice(startLine, endLine).join('\n').trim();

    const inWindow = storedContent.length > 0 && windowText.includes(storedContent);
    const inFullFile = storedContent.length > 0 && currentNorm.includes(storedContent);

    if (inWindow || inFullFile) {
      if (!inWindow && inFullFile) {
        mismatches.push('LINE_WINDOW_OFFSET: content found in current file but outside recorded [line_start, line_end]');
      }
      return {
        chunkId: chunk.id,
        relativePath: chunk.relative_path,
        sourceRef: chunk.source_ref ?? chunk.relative_path,
        candidateOrdinal: chunk.candidate_ordinal ?? null,
        currentGitRevision: chunk.currentGitRevision,
        historicalGitRevision: null,
        status: 'CURRENT_SOURCE_VERIFIED',
        storedBodySha256,
        currentBodySha256: sha256Hex(inWindow ? windowText : storedContent),
        historicalBodySha256: null,
        digestScope,
        storedPacketChunkLineage: {
          lineageStatus: chunk.lineage_status || 'PROVEN',
          storedContentHash: chunk.content_hash || null,
          storedFileContentHash: chunk.file_content_hash || null,
          lineRange: [Number(chunk.line_start ?? 0), Number(chunk.line_end ?? 0)],
        },
        mismatches,
        affectedSymbolVersions: extractSymbolVersions(chunk),
        currentSourceSpanVerified: inWindow,
        eligibleForCurrentRepair: true,
      };
    }
  } else {
    mismatches.push('SOURCE_MISSING: file does not exist on disk at current worktree');
  }

  // 2. Historical Git Commits Evaluation
  mismatches.push('CURRENT_CONTENT_ABSENT: stored chunk body not present in current source');
  const matchedCommits = [];

  for (const { commit, content } of historicalCommits) {
    if (!content) continue;
    const histNorm = normalizeLineBreaks(content);
    if (storedContent.length > 0 && histNorm.includes(storedContent)) {
      matchedCommits.push({ commit, sha256: sha256Hex(storedContent) });
    }
  }

  if (matchedCommits.length === 1) {
    const match = matchedCommits[0];
    mismatches.push(`REVISION_ALIAS: chunk content matches older revision ${match.commit}`);
    return {
      chunkId: chunk.id,
      relativePath: chunk.relative_path,
      sourceRef: chunk.source_ref ?? chunk.relative_path,
      candidateOrdinal: chunk.candidate_ordinal ?? null,
      currentGitRevision: chunk.currentGitRevision,
      historicalGitRevision: match.commit,
      status: 'HISTORICAL_SOURCE_MATCH',
      storedBodySha256,
      currentBodySha256: null,
      historicalBodySha256: match.sha256,
      digestScope,
      storedPacketChunkLineage: {
        lineageStatus: chunk.lineage_status || 'PROVEN',
        storedContentHash: chunk.content_hash || null,
        storedFileContentHash: chunk.file_content_hash || null,
        lineRange: [Number(chunk.line_start ?? 0), Number(chunk.line_end ?? 0)],
      },
      mismatches,
      affectedSymbolVersions: extractSymbolVersions(chunk),
      currentSourceSpanVerified: false,
      eligibleForCurrentRepair: false, // Strictly prohibited for current repair
    };
  }

  if (matchedCommits.length > 1) {
    mismatches.push(`AMBIGUOUS_REVISION_MATCH: chunk content appears in ${matchedCommits.length} historical commits`);
    return {
      chunkId: chunk.id,
      relativePath: chunk.relative_path,
      sourceRef: chunk.source_ref ?? chunk.relative_path,
      candidateOrdinal: chunk.candidate_ordinal ?? null,
      currentGitRevision: chunk.currentGitRevision,
      historicalGitRevision: matchedCommits[0].commit,
      status: 'AMBIGUOUS_SOURCE_MATCH',
      storedBodySha256,
      currentBodySha256: null,
      historicalBodySha256: matchedCommits[0].sha256,
      digestScope,
      storedPacketChunkLineage: {
        lineageStatus: chunk.lineage_status || 'PROVEN',
        storedContentHash: chunk.content_hash || null,
        storedFileContentHash: chunk.file_content_hash || null,
        lineRange: [Number(chunk.line_start ?? 0), Number(chunk.line_end ?? 0)],
      },
      mismatches,
      affectedSymbolVersions: extractSymbolVersions(chunk),
      currentSourceSpanVerified: false,
      eligibleForCurrentRepair: false,
    };
  }

  // 3. Not found in current or history
  mismatches.push('CONTENT_UNRESOLVED: chunk body absent from current file and inspected history');
  return {
    chunkId: chunk.id,
    relativePath: chunk.relative_path,
    sourceRef: chunk.source_ref ?? chunk.relative_path,
    candidateOrdinal: chunk.candidate_ordinal ?? null,
    currentGitRevision: chunk.currentGitRevision,
    historicalGitRevision: null,
    status: 'SOURCE_CONTENT_MISMATCH',
    storedBodySha256,
    currentBodySha256: null,
    historicalBodySha256: null,
    digestScope,
    storedPacketChunkLineage: {
      lineageStatus: chunk.lineage_status || 'PROVEN',
      storedContentHash: chunk.content_hash || null,
      storedFileContentHash: chunk.file_content_hash || null,
      lineRange: [Number(chunk.line_start ?? 0), Number(chunk.line_end ?? 0)],
    },
    mismatches,
    affectedSymbolVersions: extractSymbolVersions(chunk),
    currentSourceSpanVerified: false,
    eligibleForCurrentRepair: false,
  };
}

function extractSymbolVersions(chunk) {
  const versions = [];
  if (chunk.symbol) versions.push(chunk.symbol);
  if (Array.isArray(chunk.ast_symbols)) {
    for (const sym of chunk.ast_symbols) {
      if (typeof sym === 'string') versions.push(sym);
      else if (sym && sym.name) versions.push(sym.name);
    }
  } else if (chunk.ast_symbols && typeof chunk.ast_symbols === 'object') {
    if (chunk.ast_symbols.name) versions.push(chunk.ast_symbols.name);
    if (Array.isArray(chunk.ast_symbols.symbols)) {
      for (const s of chunk.ast_symbols.symbols) versions.push(typeof s === 'string' ? s : s?.name);
    }
  }
  return [...new Set(versions.filter(Boolean))];
}

/**
 * Git query helpers.
 */
export function getCurrentGitRevision(root = ROOT) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'UNKNOWN_GIT_HEAD';
  }
}

export function getFileHistoryCommits(relativePath, commitCap = COMMIT_CAP_DEFAULT, root = ROOT) {
  try {
    const output = execFileSync('git', ['log', `-n${commitCap}`, '--format=%H', '--', relativePath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function getHistoricalFileContent(commit, relativePath, root = ROOT) {
  try {
    const gitPath = relativePath.split(path.sep).join('/');
    return execFileSync('git', ['show', `${commit}:${gitPath}`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * CLI runner for audit and receipt generation.
 */
export async function runHistoricalChunkResolverAudit(options = {}) {
  const root = options.root ?? ROOT;
  const limit = Number(options.limit ?? 50);
  const commitCap = Number(options.commitCap ?? COMMIT_CAP_DEFAULT);
  const filterSourceRef = options.filterSourceRef ?? null;
  const currentGitRev = getCurrentGitRevision(root);

  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 2,
    statement_timeout: 60000,
    application_name: 'historical-chunk-resolver-v2',
  });

  const client = await pool.connect();
  const analyses = [];
  const recommendedRebuildCohort = [];
  const summary = {
    currentSourceVerified: 0,
    historicalSourceMatch: 0,
    sourceContentMismatch: 0,
    ambiguousSourceMatch: 0,
    unverifiedDigestScope: 0,
    sourceMissing: 0,
  };

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const query = filterSourceRef
      ? `
        SELECT c.id, c.relative_path, c.source_ref, c.symbol, c.kind,
               c.line_start, c.line_end, c.content, c.content_hash, c.file_content_hash,
               c.content_hash_scope, c.content_hash_algorithm, c.ast_symbols,
               l.revision_status AS lineage_status,
               l.source_revision AS stored_source_revision
        FROM public.codebase_chunk_index c
        LEFT JOIN public.atlas_packet_chunk_lineage l ON l.chunk_row_id = c.id
        WHERE c.content IS NOT NULL AND c.relative_path IS NOT NULL
          AND lower(regexp_replace(regexp_replace(btrim(c.relative_path), '\\\\', '/', 'g'), '^\\./', '')) = $2
        ORDER BY c.id
        LIMIT $1;
      `
      : `
        SELECT c.id, c.relative_path, c.source_ref, c.symbol, c.kind,
               c.line_start, c.line_end, c.content, c.content_hash, c.file_content_hash,
               c.content_hash_scope, c.content_hash_algorithm, c.ast_symbols,
               l.revision_status AS lineage_status,
               l.source_revision AS stored_source_revision
        FROM public.codebase_chunk_index c
        LEFT JOIN public.atlas_packet_chunk_lineage l ON l.chunk_row_id = c.id
        WHERE c.content IS NOT NULL AND c.relative_path IS NOT NULL
        ORDER BY c.id
        LIMIT $1;
      `;

    const params = filterSourceRef ? [limit, filterSourceRef.toLowerCase().replace(/\\/g, '/').replace(/^\.\//, '')] : [limit];
    const res = await client.query(query, params);

    const fileContentCache = new Map();
    const commitsCache = new Map();

    for (const row of res.rows) {
      const relPath = row.relative_path.split(path.sep).join('/');
      const absPath = path.resolve(root, relPath);

      let currentFileContent = null;
      if (fs.existsSync(absPath)) {
        if (!fileContentCache.has(relPath)) {
          try {
            fileContentCache.set(relPath, fs.readFileSync(absPath, 'utf8'));
          } catch {
            fileContentCache.set(relPath, null);
          }
        }
        currentFileContent = fileContentCache.get(relPath);
      } else {
        summary.sourceMissing += 1;
      }

      // Check commit history lazily ONLY if chunk body is missing from current file
      const storedContent = normalizeLineBreaks(row.content ?? '').trim();
      let historicalCommits = [];
      const currentNorm = currentFileContent ? normalizeLineBreaks(currentFileContent) : null;
      const isPresentInCurrent = currentNorm && storedContent.length > 0 && currentNorm.includes(storedContent);

      if (!isPresentInCurrent) {
        if (!commitsCache.has(relPath)) {
          const commitList = getFileHistoryCommits(relPath, commitCap, root);
          const loaded = [];
          for (const commit of commitList) {
            const content = getHistoricalFileContent(commit, relPath, root);
            if (content) loaded.push({ commit, content });
          }
          commitsCache.set(relPath, loaded);
        }
        historicalCommits = commitsCache.get(relPath);
      }

      const chunkInput = {
        ...row,
        currentGitRevision: currentGitRev,
      };

      const analysis = evaluateChunkHistoricalLineage(chunkInput, currentFileContent, historicalCommits);
      analyses.push(analysis);

      // Track summary counts
      switch (analysis.status) {
        case 'CURRENT_SOURCE_VERIFIED':
          summary.currentSourceVerified += 1;
          break;
        case 'HISTORICAL_SOURCE_MATCH':
          summary.historicalSourceMatch += 1;
          recommendedRebuildCohort.push({
            chunkId: analysis.chunkId,
            relativePath: analysis.relativePath,
            reason: `Matches older Git commit ${analysis.historicalGitRevision}; stale in current worktree`,
          });
          break;
        case 'SOURCE_CONTENT_MISMATCH':
          summary.sourceContentMismatch += 1;
          recommendedRebuildCohort.push({
            chunkId: analysis.chunkId,
            relativePath: analysis.relativePath,
            reason: 'Chunk content absent from current source and inspected history',
          });
          break;
        case 'AMBIGUOUS_SOURCE_MATCH':
          summary.ambiguousSourceMatch += 1;
          recommendedRebuildCohort.push({
            chunkId: analysis.chunkId,
            relativePath: analysis.relativePath,
            reason: 'Ambiguous matches across multiple historical commits',
          });
          break;
        case 'UNVERIFIED_DIGEST_SCOPE':
          summary.unverifiedDigestScope += 1;
          recommendedRebuildCohort.push({
            chunkId: analysis.chunkId,
            relativePath: analysis.relativePath,
            reason: 'Digest scope and algorithm unverified',
          });
          break;
      }
    }

    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }

  const generatedAt = new Date().toISOString();
  const receiptPayload = {
    schema: SCHEMA_V2,
    gate: GATE_NAME,
    readOnly: true,
    writesPerformed: false,
    canonicalAuthority: false,
    admissionAuthorized: false,
    generatedAt,
    currentGitRevision: currentGitRev,
    totalChunksInspected: analyses.length,
    summary,
    recommendedRebuildCohort,
    analyses,
  };

  const receiptJson = JSON.stringify(receiptPayload, null, 2);
  const receiptChecksum = `sha256:${sha256Hex(receiptJson)}`;
  receiptPayload.receiptChecksum = receiptChecksum;

  // Write receipt
  const tmpDir = path.resolve(root, '.tmp/atlas');
  const reportsDir = path.resolve(root, 'docs/reports');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });

  const tmpPath = path.resolve(tmpDir, 'historical-chunk-resolver-receipt-v2.json');
  const reportPath = path.resolve(reportsDir, 'historical-chunk-resolver-receipt-v2.json');

  const finalJson = `${JSON.stringify(receiptPayload, null, 2)}\n`;
  fs.writeFileSync(tmpPath, finalJson, 'utf8');
  fs.writeFileSync(reportPath, finalJson, 'utf8');

  return {
    receiptPath: reportPath,
    receiptChecksum,
    totalChunksInspected: analyses.length,
    summary,
    recommendedRebuildCohortCount: recommendedRebuildCohort.length,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 50;
  runHistoricalChunkResolverAudit({ limit })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

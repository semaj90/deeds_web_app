#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const inputPath = resolve(repoRoot, '.tmp/mapreduce-full-v5.ndjson');
const censusPath = resolve(repoRoot, 'docs/reports/large-corpus-enrichment-census-v1.json');
const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('-', '').replace(/\.\d{3}Z$/, 'Z');
const outputPath = resolve(repoRoot, `docs/reports/mapreduce-primary-postgres-crosswalk-v1-${timestamp}.json`);
const workspaceRevision = process.argv.find((arg) => arg.startsWith('--workspace-revision='))?.slice('--workspace-revision='.length);
if (!/^sha256:[0-9a-f]{64}$/.test(workspaceRevision ?? '')) {
	throw new Error('pass an explicit --workspace-revision=sha256:<64 lowercase hex> from the current admitted snapshot');
}

function sqlText(value) {
	if (value.includes('\0')) throw new Error('input contains NUL and cannot be compared as PostgreSQL text');
	return `'${value.replaceAll("'", "''")}'`;
}

const census = JSON.parse(await (await import('node:fs/promises')).readFile(censusPath, 'utf8'));
const sourceArtifact = census.artifacts.find((artifact) => artifact.path === '.tmp/mapreduce-full-v5.ndjson');
if (!sourceArtifact || census.status !== 'LARGE_CORPUS_ENRICHMENT_CENSUS_PROVEN') {
	throw new Error('a proven large-corpus census entry for the metadata input is required');
}
if (statSync(inputPath).size !== sourceArtifact.bytes) throw new Error('metadata input size drifted from its census');

const inputHash = createHash('sha256');
const inputStream = createReadStream(inputPath);
inputStream.on('data', (chunk) => inputHash.update(chunk));
const pathRows = new Map();
let rowCount = 0;
let malformedRows = 0;
const reader = createInterface({ input: inputStream, crlfDelay: Infinity });
for await (const line of reader) {
	if (!line.trim()) continue;
	rowCount++;
	let row;
	try { row = JSON.parse(line); } catch { malformedRows++; continue; }
	if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.filePath !== 'string') {
		malformedRows++;
		continue;
	}
	const entry = pathRows.get(row.filePath) ?? { rows: 0, hashes: new Set() };
	entry.rows++;
	if (typeof row.contentHash === 'string') entry.hashes.add(row.contentHash);
	pathRows.set(row.filePath, entry);
}
reader.close();
const actualInputSha256 = inputHash.digest('hex');
if (actualInputSha256 !== sourceArtifact.sha256 || rowCount !== sourceArtifact.records) {
	throw new Error('metadata input bytes or row count no longer match the census');
}

const values = [...pathRows.entries()].map(([filePath, entry]) =>
	`(${sqlText(filePath)}, ${entry.hashes.size === 1 ? sqlText([...entry.hashes][0]) : 'NULL'}, ${entry.rows}, ${entry.hashes.size})`
).join(',\n');
if (!values) throw new Error('metadata corpus contains no usable filePath values');

const sql = `BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '180s';
WITH input_paths(file_path, content_hash, source_rows, distinct_hashes) AS (VALUES
${values}
), binding_counts AS (
  SELECT i.file_path, count(b.repo_id) FILTER (WHERE b.repo_id = 'deeds-web-app') AS rows
  FROM input_paths i LEFT JOIN public.atlas_workspace_source_bindings b
    ON b.repo_id = 'deeds-web-app' AND b.canonical_source_ref = i.file_path
  GROUP BY i.file_path
), packet_counts AS (
  SELECT i.file_path,
    count(p.source_ref) FILTER (WHERE p.source_ref = i.file_path) AS source_ref_rows,
    count(p.file_path) FILTER (WHERE p.file_path = i.file_path) AS file_path_rows
  FROM input_paths i LEFT JOIN public.atlas_packets p
    ON p.source_ref = i.file_path OR p.file_path = i.file_path
  GROUP BY i.file_path
), chunk_counts AS (
  SELECT i.file_path,
    count(c.id) FILTER (WHERE c.source_ref = i.file_path) AS source_ref_rows,
    count(c.id) FILTER (WHERE c.relative_path = i.file_path) AS relative_path_rows,
    count(c.id) FILTER (WHERE c.file_content_hash = i.content_hash
      AND (c.source_ref = i.file_path OR c.relative_path = i.file_path)) AS path_and_hash_rows
  FROM input_paths i LEFT JOIN public.codebase_chunk_index c
    ON c.source_ref = i.file_path OR c.relative_path = i.file_path
  GROUP BY i.file_path
), revision_packet_paths AS (
  SELECT DISTINCT i.file_path
  FROM input_paths i
  JOIN public.atlas_workspace_source_bindings b
    ON b.repo_id = 'deeds-web-app' AND b.canonical_source_ref = i.file_path
  JOIN public.atlas_packets p
    ON p.source_ref = i.file_path
   AND p.source_revision = b.source_revision
   AND p.workspace_revision::text = b.workspace_revision::text
), digest_binding_candidates AS (
  SELECT h.content_hash, count(b.canonical_source_ref)::bigint AS binding_count,
    coalesce(json_agg(json_build_object(
      'sourceRef', b.canonical_source_ref,
      'sourceRevision', b.source_revision,
      'workspaceRevision', b.workspace_revision,
      'contentDigest', b.content_digest,
      'byteLength', b.byte_length,
      'bindingChecksum', b.binding_checksum,
      'producerRevision', b.producer_revision
    )) FILTER (WHERE b.canonical_source_ref IS NOT NULL), '[]'::json) AS bindings
  FROM (SELECT DISTINCT content_hash FROM input_paths WHERE content_hash ~ '^[0-9a-f]{64}$') h
  LEFT JOIN public.atlas_workspace_source_bindings b
    ON b.repo_id = 'deeds-web-app'
   AND b.workspace_revision = ${sqlText(workspaceRevision)}
   AND b.content_digest = h.content_hash
  GROUP BY h.content_hash
)
SELECT
  (SELECT count(*) FROM input_paths)::text || E'\\t' ||
  (SELECT coalesce(sum(source_rows),0) FROM input_paths)::text || E'\\t' ||
  (SELECT count(*) FROM binding_counts WHERE rows > 0)::text || E'\\t' ||
  (SELECT count(*) FROM binding_counts WHERE rows > 1)::text || E'\\t' ||
  (SELECT count(*) FROM packet_counts WHERE source_ref_rows > 0)::text || E'\\t' ||
  (SELECT count(*) FROM packet_counts WHERE file_path_rows > 0)::text || E'\\t' ||
  (SELECT count(*) FROM revision_packet_paths)::text || E'\\t' ||
  (SELECT count(*) FROM chunk_counts WHERE source_ref_rows > 0)::text || E'\\t' ||
  (SELECT count(*) FROM chunk_counts WHERE relative_path_rows > 0)::text || E'\\t' ||
  (SELECT count(*) FROM chunk_counts WHERE path_and_hash_rows > 0)::text || E'\\t' ||
  (SELECT count(*) FROM input_paths WHERE distinct_hashes > 1)::text || E'\\t' ||
  (SELECT count(*) FROM input_paths i
    WHERE NOT EXISTS (SELECT 1 FROM public.atlas_workspace_source_bindings b
      WHERE b.repo_id='deeds-web-app' AND b.canonical_source_ref=i.file_path)
      AND NOT EXISTS (SELECT 1 FROM public.atlas_packets p
        WHERE p.source_ref=i.file_path OR p.file_path=i.file_path)
      AND NOT EXISTS (SELECT 1 FROM public.codebase_chunk_index c
        WHERE c.source_ref=i.file_path OR c.relative_path=i.file_path))::text;
WITH input_paths(file_path, content_hash, source_rows, distinct_hashes) AS (VALUES
${values}
), input_hashes(content_hash) AS (
  SELECT DISTINCT content_hash FROM input_paths WHERE content_hash ~ '^[0-9a-f]{64}$'
), digest_binding_candidates AS (
  SELECT h.content_hash, count(b.canonical_source_ref)::bigint AS binding_count,
    coalesce(json_agg(json_build_object(
      'sourceRef', b.canonical_source_ref,
      'sourceRevision', b.source_revision,
      'workspaceRevision', b.workspace_revision,
      'contentDigest', b.content_digest,
      'byteLength', b.byte_length,
      'bindingChecksum', b.binding_checksum,
      'producerRevision', b.producer_revision
    )) FILTER (WHERE b.canonical_source_ref IS NOT NULL), '[]'::json) AS bindings
  FROM input_hashes h
  LEFT JOIN public.atlas_workspace_source_bindings b
    ON b.repo_id = 'deeds-web-app'
   AND b.workspace_revision = ${sqlText(workspaceRevision)}
   AND b.content_digest = h.content_hash
  GROUP BY h.content_hash
)
SELECT coalesce(json_agg(json_build_object(
  'contentHash', content_hash, 'bindingCount', binding_count, 'bindings', bindings
) ORDER BY content_hash), '[]'::json)::text FROM digest_binding_candidates;
ROLLBACK;`;

const child = spawn('docker', [
	'exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db',
	'-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'
], { stdio: ['pipe', 'pipe', 'pipe'] });
let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
child.stdin.end(sql);
const [exitCode] = await once(child, 'close');
if (exitCode !== 0) throw new Error(`read-only path crosswalk failed (${exitCode}): ${stderr.trim()}`);
const resultLine = stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => /^\d+\t/.test(line));
const counts = resultLine?.split('\t').map(Number);
if (!counts || counts.length !== 12 || counts.some((count) => !Number.isSafeInteger(count))) {
	throw new Error(`unexpected PostgreSQL crosswalk result: ${stdout.slice(-500)}`);
}
const [uniquePaths, inputRows, boundPaths, ambiguousBindings, packetSourceRefPaths,
	packetFilePathPaths, exactRevisionPacketPaths, chunkSourceRefPaths, chunkRelativePathPaths,
	chunkPathAndHashPaths, pathsWithConflictingInputHashes, noExactIndexMatches] = counts;
const candidateLine = stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith('[{') || line === '[]');
if (!candidateLine) throw new Error(`missing digest crosswalk JSON in PostgreSQL result: ${stdout.slice(-500)}`);
const digestCandidates = JSON.parse(candidateLine);
const verifiedBindings = [];
const digestCandidateStats = { hashesWithCurrentBinding: 0, uniqueDigestBindings: 0, ambiguousDigestBindings: 0, verifiedCurrentSourceFiles: 0, byteMismatchOrUnavailable: 0, verificationBytes: 0 };
const verifiedSourceRefs = new Set();
for (const candidate of digestCandidates) {
	if (candidate.bindingCount < 1) continue;
	digestCandidateStats.hashesWithCurrentBinding++;
	if (candidate.bindingCount !== 1 || candidate.bindings.length !== 1) {
		digestCandidateStats.ambiguousDigestBindings++;
		continue;
	}
	digestCandidateStats.uniqueDigestBindings++;
	const binding = candidate.bindings[0];
	if (binding.workspaceRevision !== workspaceRevision
		|| binding.contentDigest !== candidate.contentHash
		|| binding.sourceRevision !== `sha256:${candidate.contentHash}`
		|| !Number.isSafeInteger(Number(binding.byteLength))
		|| !/^[0-9a-f]{64}$/.test(binding.bindingChecksum ?? '')) {
		digestCandidateStats.byteMismatchOrUnavailable++;
		continue;
	}
	const sourceRef = binding.sourceRef;
	if (typeof sourceRef !== 'string' || !sourceRef || sourceRef.includes('\\') || sourceRef.split('/').includes('..') || sourceRef.startsWith('/')) {
		digestCandidateStats.byteMismatchOrUnavailable++;
		continue;
	}
	const candidatePath = resolve(repoRoot, sourceRef);
	let realPath;
	try { realPath = realpathSync(candidatePath); } catch { digestCandidateStats.byteMismatchOrUnavailable++; continue; }
	const relativePath = relative(repoRoot, realPath);
	if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
		digestCandidateStats.byteMismatchOrUnavailable++;
		continue;
	}
	const fileStat = statSync(realPath);
	if (!fileStat.isFile() || fileStat.size !== Number(binding.byteLength)) {
		digestCandidateStats.byteMismatchOrUnavailable++;
		continue;
	}
	const fileHash = createHash('sha256');
	for await (const chunk of createReadStream(realPath)) fileHash.update(chunk);
	digestCandidateStats.verificationBytes += fileStat.size;
	if (fileHash.digest('hex') !== candidate.contentHash) {
		digestCandidateStats.byteMismatchOrUnavailable++;
		continue;
	}
	digestCandidateStats.verifiedCurrentSourceFiles++;
	verifiedSourceRefs.add(sourceRef);
	verifiedBindings.push({
		inputContentHash: candidate.contentHash,
		canonicalSourceRef: sourceRef,
		sourceRevision: binding.sourceRevision,
		workspaceRevision: binding.workspaceRevision,
		contentDigest: binding.contentDigest,
		byteLength: fileStat.size,
		bindingChecksum: binding.bindingChecksum,
		producerRevision: binding.producerRevision,
		currentSourceBytesVerified: true,
		canonicalAuthority: false
	});
}
const report = {
	schema: 'atlas.mapreduce-primary-postgres-crosswalk.v1',
	status: 'READ_ONLY_EXACT_PATH_CROSSWALK_COMPLETE',
	generatedAt: new Date().toISOString(),
	input: {
		path: '.tmp/mapreduce-full-v5.ndjson',
		rows: inputRows,
		uniqueFilePaths: uniquePaths,
		sha256: actualInputSha256,
		malformedRows,
		pathsWithConflictingInputHashes
	},
	workspaceRevision,
	contentDigestSourceBinding: {
		owner: 'atlas_workspace_source_bindings + scripts/atlas/lib/canonical-source-binding-v1.mjs content-proven unique-digest contract',
		candidateHashCount: digestCandidates.length,
		...digestCandidateStats,
		uniqueVerifiedSourceRefs: verifiedSourceRefs.size,
		verifiedBindings
	},
	postgresExactPathCrosswalk: {
		sourceAuthorityRepoId: 'deeds-web-app',
		matchingRule: 'BYTE_EXACT_FILEPATH_TO_CANONICAL_SOURCE_REF_OR_INDEXED_PATH; NO NORMALIZATION',
		pathsWithAdmittedSourceBinding: boundPaths,
		pathsWithAmbiguousBindings: ambiguousBindings,
		pathsMatchingPacketSourceRef: packetSourceRefPaths,
		pathsMatchingPacketFilePath: packetFilePathPaths,
		pathsWithExactPacketSourceAndWorkspaceRevision: exactRevisionPacketPaths,
		pathsMatchingChunkSourceRef: chunkSourceRefPaths,
		pathsMatchingChunkRelativePath: chunkRelativePathPaths,
		pathsMatchingChunkPathAndInputContentHash: chunkPathAndHashPaths,
		pathsMatchingNoIndexedIdentityPath: noExactIndexMatches,
		identityPromoted: false,
		unresolvedFieldsRemainNull: true
	},
	policy: {
		ftsOrFuzzySearchUsedAsIdentity: false,
		pathAliasesInferred: false,
		contentHashUsedAsIdentity: false,
		databaseTransaction: 'READ ONLY; ROLLBACK',
		databaseWrites: 0,
		projectionWrites: 0
	},
	nextGate: 'USE_EXISTING_ADMITTED_NAMESPACE_AND_SOURCE_REF_OWNER_FOR_ANY_NON-EXACT_PATH_CANDIDATE; OTHERWISE KEEP_UNRESOLVED'
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, ...report.postgresExactPathCrosswalk, reportPath: outputPath }, null, 2));

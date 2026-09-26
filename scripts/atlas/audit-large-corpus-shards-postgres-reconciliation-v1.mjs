#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestArg = process.argv.slice(2).find((arg) => arg.startsWith('--manifest='))?.slice('--manifest='.length);
if (!manifestArg) throw new Error('pass an explicit --manifest=<sealed local shard manifest path>');
const manifestPath = resolve(repoRoot, manifestArg);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.status !== 'LOCAL_SHARDS_SEALED_NONCANONICAL' || manifest.canonicalAuthority !== false) {
	throw new Error('manifest is not a sealed noncanonical local shard manifest');
}

const outputPath = resolve(repoRoot, 'docs/reports/large-corpus-shards-postgres-reconciliation-v1.json');
const sourceRefs = new Set();
const verifiedShards = [];
let shardRecordCount = 0;
let metadataIdentityUnresolved = 0;
let representationOnly = 0;
let inputRevisionPresent = 0;
let inputWorkspaceRevisionPresent = 0;

for (const artifact of manifest.artifacts) {
	for (const shard of artifact.shards) {
		const shardPath = resolve(dirname(manifestPath), shard.path);
		const hash = createHash('sha256');
		const hashStream = createReadStream(shardPath);
		for await (const chunk of hashStream) hash.update(chunk);
		const actualHash = hash.digest('hex');
		if (actualHash !== shard.sha256) throw new Error(`shard checksum mismatch: ${shard.path}`);

		let count = 0;
		for await (const line of createInterface({ input: createReadStream(shardPath), crlfDelay: Infinity })) {
			const row = JSON.parse(line);
			if (row.canonicalAuthority !== false) throw new Error(`canonicalAuthority must remain false: ${shard.path}`);
			if (row.identity?.sourceRevision) inputRevisionPresent++;
			if (row.identity?.workspaceRevision) inputWorkspaceRevisionPresent++;
			if (row.corpus === 'PRIMARY_METADATA_CORPUS') metadataIdentityUnresolved++;
			if (row.corpus === 'REPRESENTATION_CORPUS') representationOnly++;
			if (row.identity?.sourceRef) sourceRefs.add(row.identity.sourceRef);
			count++;
		}
		if (count !== shard.records) throw new Error(`shard record count mismatch: ${shard.path}`);
		shardRecordCount += count;
		verifiedShards.push({ path: shard.path, records: count, sha256: actualHash });
	}
}

const references = [...sourceRefs];
if (references.some((ref) => ref.includes('\0'))) throw new Error('source_ref contains a NUL and cannot be safely compared as PostgreSQL text');
const values = references.map((ref) => `('${ref.replaceAll("'", "''")}')`).join(',');
const sql = `BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '120s';
WITH input_refs(source_ref) AS (VALUES ${values}),
chunk_counts AS (
  SELECT source_ref, count(*)::bigint AS rows,
         count(*) FILTER (WHERE source_revision IS NOT NULL AND btrim(source_revision) <> '')::bigint AS revision_rows
  FROM public.codebase_chunk_index GROUP BY source_ref
),
packet_counts AS (
  SELECT source_ref, count(*)::bigint AS rows,
         count(*) FILTER (WHERE source_revision IS NOT NULL AND btrim(source_revision) <> '')::bigint AS revision_rows
  FROM public.atlas_packets GROUP BY source_ref
),
matched AS (
  SELECT i.source_ref, coalesce(c.rows, 0) AS chunk_rows,
         coalesce(c.revision_rows, 0) AS chunk_revision_rows,
         coalesce(p.rows, 0) AS packet_rows,
         coalesce(p.revision_rows, 0) AS packet_revision_rows
  FROM input_refs i
  LEFT JOIN chunk_counts c USING (source_ref)
  LEFT JOIN packet_counts p USING (source_ref)
)
SELECT count(*)::text || E'\\t' ||
       count(*) FILTER (WHERE chunk_rows > 0)::text || E'\\t' ||
       count(*) FILTER (WHERE packet_rows > 0)::text || E'\\t' ||
       count(*) FILTER (WHERE chunk_rows = 0 AND packet_rows = 0)::text || E'\\t' ||
       sum(chunk_rows)::text || E'\\t' || sum(packet_rows)::text || E'\\t' ||
       count(*) FILTER (WHERE chunk_rows > 1)::text || E'\\t' ||
       count(*) FILTER (WHERE packet_rows > 1)::text || E'\\t' ||
       count(*) FILTER (WHERE chunk_revision_rows > 0)::text || E'\\t' ||
       count(*) FILTER (WHERE packet_revision_rows > 0)::text
FROM matched;
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
if (exitCode !== 0) throw new Error(`read-only PostgreSQL reconciliation failed (${exitCode}): ${stderr.trim()}`);
const resultLine = stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => /^\d+\t/.test(line));
const counts = resultLine?.split('\t').map(Number);
if (!counts || counts.length !== 10 || counts.some((value) => !Number.isSafeInteger(value))) {
	throw new Error(`unexpected psql result: ${stdout.slice(-500)}`);
}
const [uniqueSourceRefs, exactChunkRefMatches, exactPacketRefMatches, noExactMatches,
	chunkRows, packetRows, multiChunkRefs, multiPacketRefs, chunkRevisionRefs, packetRevisionRefs] = counts;

const report = {
	schema: 'atlas.large-corpus-shards-postgres-reconciliation.v1',
	status: inputRevisionPresent === 0 && inputWorkspaceRevisionPresent === 0
		? 'READ_ONLY_JOIN_COMPLETE_REVISION_QUALIFICATION_BLOCKED'
		: 'READ_ONLY_JOIN_COMPLETE_REVIEW_REQUIRED',
	generatedAt: new Date().toISOString(),
	manifestPath: manifestArg.replaceAll('\\', '/'),
	manifestRootSha256: manifest.rootSha256,
	verifiedShards,
	input: {
		shardRecords: shardRecordCount,
		metadataIdentityUnresolved,
		representationOnly,
		uniqueExactSourceRefs: uniqueSourceRefs,
		sourceRevisionPresent: inputRevisionPresent,
		workspaceRevisionPresent: inputWorkspaceRevisionPresent
	},
	postgresExactSourceRefJoin: {
		identityBasis: 'BYTE_EXACT_source_ref_ONLY_NOT_CANONICAL_IDENTITY',
		uniqueRefsMatchingCodebaseChunkIndex: exactChunkRefMatches,
		uniqueRefsMatchingAtlasPackets: exactPacketRefMatches,
		uniqueRefsMatchingNeither: noExactMatches,
		matchedCodebaseChunkIndexRows: chunkRows,
		matchedAtlasPacketRows: packetRows,
		refsWithMultipleChunkRows: multiChunkRefs,
		refsWithMultiplePacketRows: multiPacketRefs,
		refsWhoseMatchedChunkRowsHaveRevision: chunkRevisionRefs,
		refsWhoseMatchedPacketRowsHaveRevision: packetRevisionRefs,
		promotionEligibleRows: 0,
		classification: 'EXACT_SOURCE_REF_MATCH_REVISION_MISSING_OR_IDENTITY_UNRESOLVED'
	},
	decision: {
		canonicalityClaimed: false,
		sourceRefNormalized: false,
		pathFallbackUsed: false,
		contentHashSubstitutionUsed: false,
		databaseWrites: 0,
		graphifyRuns: 0,
		llmCalls: 0,
		blocker: 'INPUT_ARTIFACTS_LACK_SOURCE_REVISION_AND_WORKSPACE_REVISION'
	}
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, uniqueExactSourceRefs: uniqueSourceRefs, exactChunkRefMatches, exactPacketRefMatches, noExactMatches, promotionEligibleRows: 0, outputPath }, null, 2));

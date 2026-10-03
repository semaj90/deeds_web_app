#!/usr/bin/env node

/**
 * Read-only diagnostic crosswalk from the historical 768D Qdrant export and
 * metadata corpus to a pinned current-enriched-index shard manifest.
 *
 * normalizeSourceRef is used only to report candidate source-file groupings.
 * It does not establish chunk identity, vector-byte provenance, or admission.
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { normalizeSourceRef } from './lib/normalize-source-ref.mjs';

const ROOT = process.cwd();

function arg(name) {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function repoPath(value) {
	const resolved = path.resolve(ROOT, value ?? '');
	if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
		throw new Error(`PATH_OUTSIDE_REPOSITORY:${value}`);
	}
	return resolved;
}

async function scanJsonl(filePath, onRecord) {
	const stream = createReadStream(filePath);
	const hash = createHash('sha256');
	stream.on('data', (chunk) => hash.update(chunk));
	const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
	let records = 0;
	let blankLines = 0;
	let malformedLines = 0;
	for await (const line of lines) {
		if (!line.trim()) {
			blankLines += 1;
			continue;
		}
		let record;
		try {
			record = JSON.parse(line);
		} catch {
			malformedLines += 1;
			continue;
		}
		records += 1;
		onRecord(record);
	}
	return { records, blankLines, malformedLines, sha256: hash.digest('hex') };
}

function add(map, key, value) {
	if (!key) return;
	const values = map.get(key) ?? [];
	values.push(value);
	map.set(key, values);
}

function hashMatches(actual, expected, label) {
	if (actual !== expected) throw new Error(`${label}_SHA256_MISMATCH:${actual}:${expected}`);
}

const censusRel = arg('census');
const manifestRel = arg('manifest');
if (!censusRel || !manifestRel) {
	throw new Error('USAGE: node scripts/atlas/audit-large-corpus-source-ref-candidate-bridge-v1.mjs --census=docs/reports/large-corpus-enrichment-census-v2-20260927T1718Z.json --manifest=.tmp/atlas/current-enriched-index-shards-v1/<run>/manifest.json');
}

const censusPath = repoPath(censusRel);
const manifestPath = repoPath(manifestRel);
if (!existsSync(censusPath) || !existsSync(manifestPath)) throw new Error('PINNED_INPUT_NOT_FOUND');
const census = JSON.parse(readFileSync(censusPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const metadata = census.artifacts.find((artifact) => artifact.role === 'PRIMARY_METADATA_CORPUS');
const representation = census.artifacts.find((artifact) => artifact.role === 'REPRESENTATION_CORPUS');
if (!metadata || !representation || !Array.isArray(manifest.shards) || !manifest.rootSha256) {
	throw new Error('PINNED_CENSUS_OR_SHARD_MANIFEST_INVALID');
}

const metadataPath = repoPath(metadata.path);
const representationPath = repoPath(representation.path);
const currentByExactSourceRef = new Map();
const currentByNormalizedSourceRef = new Map();
const currentByContentHash = new Map();
const currentByExactPathAndHash = new Map();
const currentByNormalizedPathAndHash = new Map();
const currentIndexDir = path.dirname(manifestPath);
let shardTotal = 0;
let shardMalformed = 0;
const shardReceipts = [];
const hashPairSeparator = '\u0000';

for (const shard of manifest.shards) {
	const shardPath = repoPath(path.join(path.relative(ROOT, currentIndexDir), shard.path));
	if (!existsSync(shardPath)) throw new Error(`SHARD_NOT_FOUND:${shard.path}`);
	const scanned = await scanJsonl(shardPath, (row) => {
		const exact = typeof row.sourceRef === 'string' ? row.sourceRef : '';
		const normalized = normalizeSourceRef(exact);
		const sourceHash = typeof row.sourceContentHash === 'string' ? row.sourceContentHash.toLowerCase() : '';
		const candidate = {
			sourceRef: exact,
			packetKey: typeof row.packetKey === 'string' ? row.packetKey : null,
			sourceRevision: typeof row.sourceRevision === 'string' ? row.sourceRevision : null,
			workspaceRevision: typeof row.workspaceRevision === 'string' ? row.workspaceRevision : null,
			lineageState: typeof row.lineageState === 'string' ? row.lineageState : null,
		};
		add(currentByExactSourceRef, exact, candidate);
		add(currentByNormalizedSourceRef, normalized, candidate);
		add(currentByContentHash, sourceHash, candidate);
		add(currentByExactPathAndHash, `${exact}${hashPairSeparator}${sourceHash}`, candidate);
		add(currentByNormalizedPathAndHash, `${normalized}${hashPairSeparator}${sourceHash}`, candidate);
	});
	if (scanned.malformedLines !== 0 || scanned.blankLines !== 0) throw new Error(`SHARD_LINE_INTEGRITY_FAILURE:${shard.path}`);
	hashMatches(scanned.sha256, shard.sha256, `SHARD:${shard.path}`);
	shardTotal += scanned.records;
	shardMalformed += scanned.malformedLines;
	shardReceipts.push({ path: shard.path, records: scanned.records, sha256: scanned.sha256 });
}
if (shardTotal !== manifest.records || shardMalformed !== 0) throw new Error('SHARD_MANIFEST_RECORD_COUNT_MISMATCH');

let metadataCounts = { records: 0, exactPathMatches: 0, normalizedPathMatches: 0, contentHashMatches: 0, exactPathAndHashMatches: 0, normalizedPathAndHashMatches: 0, normalizedPathAndHashQualifiedPacketCandidates: 0, normalizedPairAmbiguous: 0, blankLines: 0, malformedLines: 0 };
const metadataScan = await scanJsonl(metadataPath, (row) => {
	metadataCounts.records += 1;
	const exactPath = typeof row.filePath === 'string' ? row.filePath : '';
	const normalizedPath = normalizeSourceRef(exactPath);
	const contentHash = typeof row.contentHash === 'string' ? row.contentHash.toLowerCase() : '';
	const exactMatches = currentByExactSourceRef.get(exactPath) ?? [];
	const normalizedMatches = currentByNormalizedSourceRef.get(normalizedPath) ?? [];
	const exactPairs = currentByExactPathAndHash.get(`${exactPath}${hashPairSeparator}${contentHash}`) ?? [];
	const normalizedPairs = currentByNormalizedPathAndHash.get(`${normalizedPath}${hashPairSeparator}${contentHash}`) ?? [];
	if (exactMatches.length) metadataCounts.exactPathMatches += 1;
	if (normalizedMatches.length) metadataCounts.normalizedPathMatches += 1;
	if (contentHash && currentByContentHash.has(contentHash)) metadataCounts.contentHashMatches += 1;
	if (exactPairs.length) metadataCounts.exactPathAndHashMatches += 1;
	if (normalizedPairs.length) {
		metadataCounts.normalizedPathAndHashMatches += 1;
		const distinct = new Set(normalizedPairs.map((item) => `${item.sourceRef}${hashPairSeparator}${item.packetKey ?? ''}${hashPairSeparator}${item.sourceRevision ?? ''}`));
		if (distinct.size > 1) metadataCounts.normalizedPairAmbiguous += 1;
		if (normalizedPairs.some((item) => item.lineageState === 'REVISION_QUALIFIED' && item.packetKey && item.sourceRevision && item.workspaceRevision === manifest.workspaceRevision)) {
			metadataCounts.normalizedPathAndHashQualifiedPacketCandidates += 1;
		}
	}
});
metadataCounts.blankLines = metadataScan.blankLines;
metadataCounts.malformedLines = metadataScan.malformedLines;
hashMatches(metadataScan.sha256, metadata.sha256, 'METADATA_INPUT');

const representationCounts = {
	records: 0,
	missingSourceRefs: 0,
	uniqueRawSourceRefs: 0,
	uniqueNormalizedSourceRefs: 0,
	exactSourceRefMatches: 0,
	uniqueExactSourceRefMatches: 0,
	normalizedFileCandidateRows: 0,
	uniqueNormalizedFileCandidates: 0,
	normalizedFileCandidatesWithQualifiedPacketSourceRows: 0,
	normalizedKeysWithMultipleRawSourceRefs: 0,
	blankLines: 0,
	malformedLines: 0,
};
const rawSourceRefs = new Set();
const normalizedSourceRefs = new Set();
const exactMatchedSourceRefs = new Set();
const normalizedMatchedSourceRefs = new Set();
const rawVariantsByNormalized = new Map();
const representationScan = await scanJsonl(representationPath, (row) => {
	representationCounts.records += 1;
	const raw = typeof row.source_ref === 'string' ? row.source_ref.trim() : '';
	if (!raw) {
		representationCounts.missingSourceRefs += 1;
		return;
	}
	const normalized = normalizeSourceRef(raw);
	rawSourceRefs.add(raw);
	normalizedSourceRefs.add(normalized);
	const variants = rawVariantsByNormalized.get(normalized) ?? new Set();
	variants.add(raw);
	rawVariantsByNormalized.set(normalized, variants);
	const exactCandidates = currentByExactSourceRef.get(raw) ?? [];
	if (exactCandidates.length) {
		representationCounts.exactSourceRefMatches += 1;
		exactMatchedSourceRefs.add(raw);
	}
	const normalizedCandidates = currentByNormalizedSourceRef.get(normalized) ?? [];
	if (normalizedCandidates.length) {
		representationCounts.normalizedFileCandidateRows += 1;
		normalizedMatchedSourceRefs.add(normalized);
		if (normalizedCandidates.some((item) => item.lineageState === 'REVISION_QUALIFIED' && item.packetKey && item.sourceRevision && item.workspaceRevision === manifest.workspaceRevision)) {
			representationCounts.normalizedFileCandidatesWithQualifiedPacketSourceRows += 1;
		}
	}
});
representationCounts.blankLines = representationScan.blankLines;
representationCounts.malformedLines = representationScan.malformedLines;
representationCounts.uniqueRawSourceRefs = rawSourceRefs.size;
representationCounts.uniqueNormalizedSourceRefs = normalizedSourceRefs.size;
representationCounts.uniqueExactSourceRefMatches = exactMatchedSourceRefs.size;
representationCounts.uniqueNormalizedFileCandidates = normalizedMatchedSourceRefs.size;
representationCounts.normalizedKeysWithMultipleRawSourceRefs = [...rawVariantsByNormalized.values()].filter((set) => set.size > 1).length;
hashMatches(representationScan.sha256, representation.sha256, 'REPRESENTATION_INPUT');
if (metadataCounts.records !== metadata.records || representationCounts.records !== representation.records
	|| metadataCounts.malformedLines !== 0 || representationCounts.malformedLines !== 0
	|| metadataCounts.blankLines !== 0 || representationCounts.blankLines !== 0) {
	throw new Error('CENSUS_INPUT_SHAPE_OR_CHECKSUM_MISMATCH');
}

const generatedAt = new Date().toISOString();
const stamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace('T', 'T').replace('Z', 'Z');
const reportDir = repoPath('docs/reports');
mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `large-corpus-source-ref-candidate-bridge-v1-${stamp}.json`);
const report = {
	schema: 'atlas.large-corpus-source-ref-candidate-bridge.v1',
	status: 'CANDIDATE_CROSSWALK_COMPLETE_NO_CHUNK_BINDING',
	generatedAt,
	mode: 'LOCAL_IMMUTABLE_ARTIFACT_SCAN_ONLY',
	inputs: {
		censusPath: path.relative(ROOT, censusPath),
		metadataPath: path.relative(ROOT, metadataPath),
		metadataSha256: metadataScan.sha256,
		representationPath: path.relative(ROOT, representationPath),
		representationSha256: representationScan.sha256,
		currentEnrichedManifestPath: path.relative(ROOT, manifestPath),
		currentEnrichedManifestRootSha256: manifest.rootSha256,
		currentEnrichedWorkspaceRevision: manifest.workspaceRevision,
		currentEnrichedShardCount: shardReceipts.length,
		currentEnrichedRows: shardTotal,
		currentEnrichedShardChecksumsVerified: true,
	},
	metadataCrosswalk: metadataCounts,
	representationCrosswalk: representationCounts,
	interpretation: {
		normalizationOwner: 'scripts/atlas/lib/normalize-source-ref.mjs',
		normalizationUse: 'candidate source-file grouping only; normalizer strips query/fragment suffixes and can collapse distinct raw refs',
		metadataPathAndHashJoin: 'candidate correlation only; content-hash equality and normalized path are not by themselves canonical identity or a packet/chunk join',
		representationJoin: 'source-file candidate only; export has numeric id and source_ref but no stable_key, chunk_row_id, packet_key, source_revision, or workspace_revision',
		vectorAdmission: false,
		canonicalAuthority: false,
		promotionReady: false,
	},
	writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, rabbitmq: 0, graphify: 0, modelCalls: 0 },
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(ROOT, reportPath), metadataCrosswalk: metadataCounts, representationCrosswalk: representationCounts, promotionReady: false }, null, 2));

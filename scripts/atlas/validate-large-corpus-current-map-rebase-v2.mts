#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	assertCandidateOrdinalMapIntegrityV1,
	candidateOrdinalMapV1Schema,
	type CandidateOrdinalMapV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = process.argv.slice(2).find((value) => value.startsWith('--manifest='))?.slice('--manifest='.length);
if (!arg) throw new Error('EXPLICIT_MANIFEST_REQUIRED');
const manifestPath = path.resolve(ROOT, arg);
const allowedRoot = path.resolve(ROOT, '.tmp/atlas/mapreduce-candidate-evidence-rebase-v2');
if (!manifestPath.startsWith(`${allowedRoot}${path.sep}`)) throw new Error('MANIFEST_OUTSIDE_REBASE_V2_ROOT');
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = (value: string | Buffer) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const canonicalJson = (value: unknown): string => {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
		.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
};

const manifest = readJson(manifestPath);
const manifestCore = { ...manifest };
delete manifestCore.receiptChecksum;
if (manifest.schema !== 'atlas.mapreduce-candidate-evidence-current-map-rebase.v2'
	|| manifest.mode !== 'SEALED_LOCAL_ARTIFACTS_ONLY'
	|| manifest.semantics?.canonicalAuthority !== false
	|| manifest.semantics?.featureAdmitted !== false
	|| manifest.receiptChecksum !== sha(canonicalJson(manifestCore))) throw new Error('REBASE_MANIFEST_INVALID');

const mapPath = path.resolve(ROOT, manifest.currentCandidateMap?.path ?? '');
if (!mapPath.startsWith(`${ROOT}${path.sep}`)) throw new Error('CURRENT_MAP_PATH_OUTSIDE_REPOSITORY');
const rawMap = readJson(mapPath);
const { lineageQualifiedRowCount, lineageRequired, canonicalOrderingPolicy, ...mapCore } = rawMap;
if (lineageQualifiedRowCount !== rawMap.rowCount || lineageRequired !== true
	|| canonicalOrderingPolicy !== 'CANONICAL_ID_ASCENDING') throw new Error('CURRENT_MAP_EXTENSION_METADATA_INVALID');
const map = candidateOrdinalMapV1Schema.parse(mapCore) as CandidateOrdinalMapV1;
assertCandidateOrdinalMapIntegrityV1(map);
if (map.ordinalMapChecksum !== manifest.currentCandidateMap.ordinalMapChecksum
	|| map.candidateSnapshotRevision !== manifest.currentCandidateMap.candidateSnapshotRevision
	|| map.rowCount !== manifest.currentCandidateMap.rowCount) throw new Error('CURRENT_MAP_BINDING_MISMATCH');

const rowsPath = path.resolve(ROOT, manifest.output?.path ?? '');
if (!rowsPath.startsWith(`${path.dirname(manifestPath)}${path.sep}`)) throw new Error('REBASE_ROWS_PATH_OUTSIDE_RUN_DIR');
const bytes = fs.readFileSync(rowsPath);
if (sha(bytes) !== manifest.output.sha256) throw new Error('REBASE_ROWS_CHECKSUM_MISMATCH');
const rows = bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
if (rows.length !== manifest.output.rows || rows.length !== manifest.counts.inputRows || rows.length !== manifest.counts.outputRows) throw new Error('REBASE_ROWS_NOT_CONSERVED');
const currentOrdinals: number[] = [];
for (const row of rows) {
	if (row.canonicalAuthority !== false || row.featureAdmitted !== false) throw new Error('REBASE_AUTHORITY_OR_ADMISSION_OVERCLAIM');
	if (row.currentMapResolution === 'EXACT_CURRENT_MAP_MATCH') {
		if (!row.identity || row.identity.ordinalMapChecksum !== map.ordinalMapChecksum
			|| row.identity.candidateSnapshotRevision !== map.candidateSnapshotRevision) throw new Error('REBASED_IDENTITY_NOT_CURRENT_MAP_BOUND');
		currentOrdinals.push(row.identity.candidateOrdinal);
	} else if (row.identity !== null) throw new Error('NONMATCH_ROW_HAS_CURRENT_IDENTITY');
}
if (new Set(currentOrdinals).size !== currentOrdinals.length
	|| currentOrdinals.length !== manifest.counts.exactCurrentMapMatches) throw new Error('REBASED_ORDINALS_DUPLICATE_OR_COUNT_MISMATCH');
if (manifest.sideEffects?.postgresWrites !== 0 || manifest.sideEffects?.qdrantWrites !== 0
	|| manifest.sideEffects?.valkeyWrites !== 0 || manifest.sideEffects?.neo4jWrites !== 0
	|| manifest.sideEffects?.modelCalls !== 0 || manifest.sideEffects?.graphifyRuns !== 0) throw new Error('SIDE_EFFECT_ASSERTION_FAILED');

console.log(JSON.stringify({
	status: 'VALIDATED_NONCANONICAL_REBASE',
	mapRows: map.rowCount,
	mapChecksum: map.ordinalMapChecksum,
	inputRows: rows.length,
	exactCurrentMapMatches: currentOrdinals.length,
	currentOrdinalsUnique: true,
	canonicalAuthority: false,
	featureAdmitted: false,
	datastoreWrites: 0,
	manifest: path.relative(ROOT, manifestPath).replaceAll('\\', '/'),
}, null, 2));

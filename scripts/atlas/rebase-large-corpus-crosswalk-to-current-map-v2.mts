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
import { projectCurrentOrdinalMapCoreV1, rebaseLargeCorpusCrosswalkV2 } from './lib/large-corpus-current-map-rebase-v2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name: string) => process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const input = (name: string) => {
	const value = arg(name);
	if (!value) throw new Error(`EXPLICIT_${name.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
	const absolute = path.resolve(ROOT, value);
	if (!absolute.startsWith(`${ROOT}${path.sep}`)) throw new Error(`INPUT_OUTSIDE_REPOSITORY:${name}`);
	return absolute;
};
const sha = (value: string | Buffer) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const canonicalJson = (value: unknown): string => {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
		.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
};
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

const priorManifestPath = input('prior-manifest');
const currentMapPath = input('current-map');
const priorManifest = readJson(priorManifestPath);
const manifestChecksum = priorManifest.receiptChecksum;
const priorManifestWithoutChecksum = { ...priorManifest };
delete priorManifestWithoutChecksum.receiptChecksum;
if (priorManifest.schema !== 'atlas.mapreduce-candidate-evidence-crosswalk-receipt.v1'
	|| priorManifest.mode !== 'SEALED_LOCAL_ARTIFACTS_ONLY'
	|| priorManifest.semantics?.canonicalAuthority !== false
	|| priorManifest.semantics?.featureAdmitted !== false
	|| manifestChecksum !== sha(canonicalJson(priorManifestWithoutChecksum))) {
	throw new Error('PRIOR_CROSSWALK_MANIFEST_INVALID_OR_UNSEALED');
}
const priorOutputPath = path.resolve(ROOT, priorManifest.output?.path ?? '');
const allowedPriorRoot = path.resolve(ROOT, '.tmp/atlas/mapreduce-candidate-evidence-crosswalk-v1');
if (!priorOutputPath.startsWith(`${allowedPriorRoot}${path.sep}`)) throw new Error('PRIOR_OUTPUT_PATH_OUTSIDE_EXPECTED_ROOT');
const priorBytes = fs.readFileSync(priorOutputPath);
if (sha(priorBytes) !== priorManifest.output.sha256) throw new Error('PRIOR_CROSSWALK_CHECKSUM_MISMATCH');
const priorRows = priorBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
if (priorRows.length !== priorManifest.output.rows) throw new Error('PRIOR_CROSSWALK_ROW_COUNT_MISMATCH');

const rawCurrentMap = readJson(currentMapPath);
const currentMap = candidateOrdinalMapV1Schema.parse(projectCurrentOrdinalMapCoreV1(rawCurrentMap)) as CandidateOrdinalMapV1;
assertCandidateOrdinalMapIntegrityV1(currentMap);
if (currentMap.workspaceRevision !== priorManifest.authority.workspaceRevision) throw new Error('WORKSPACE_REVISION_MISMATCH');
if (currentMap.rowCount > priorManifest.inputs.exactPacketCandidateRowsInCandidateMap) throw new Error('CURRENT_MAP_EXCEEDS_PRIOR_CANDIDATE_UNIVERSE');
const result = rebaseLargeCorpusCrosswalkV2({
	priorRows,
	currentMap,
	priorMapBinding: {
		candidateSnapshotRevision: priorManifest.authority.candidateSnapshotRevision,
		ordinalMapChecksum: priorManifest.authority.ordinalMapChecksum,
	},
});
if (result.rows.length !== priorRows.length) throw new Error('CROSSWALK_ROW_CONSERVATION_FAILED');

const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
const outputDir = path.resolve(ROOT, `.tmp/atlas/mapreduce-candidate-evidence-rebase-v2/${stamp}`);
fs.mkdirSync(path.dirname(outputDir), { recursive: true });
fs.mkdirSync(outputDir, { recursive: false });
const body = `${result.rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
const rowsPath = path.join(outputDir, 'crosswalk-rebased.ndjson');
fs.writeFileSync(rowsPath, body, { flag: 'wx' });
const receipt: Record<string, unknown> = {
	schema: 'atlas.mapreduce-candidate-evidence-current-map-rebase.v2',
	generatedAt: new Date().toISOString(),
	status: result.exactCurrentMapMatches > 0 ? 'PARTIAL_EXACT_CURRENT_MAP_REBASE' : 'NO_CURRENT_MAP_MATCHES',
	mode: 'SEALED_LOCAL_ARTIFACTS_ONLY',
	priorCrosswalk: {
		manifest: path.relative(ROOT, priorManifestPath).replaceAll('\\', '/'),
		manifestChecksum,
		rowsChecksum: sha(priorBytes),
		candidateSnapshotRevision: priorManifest.authority.candidateSnapshotRevision,
		ordinalMapChecksum: priorManifest.authority.ordinalMapChecksum,
	},
	currentCandidateMap: {
		path: path.relative(ROOT, currentMapPath).replaceAll('\\', '/'),
		candidateSnapshotRevision: currentMap.candidateSnapshotRevision,
		ordinalMapChecksum: currentMap.ordinalMapChecksum,
		rowCount: currentMap.rowCount,
		workspaceRevision: currentMap.workspaceRevision,
		validatedProducerExtensions: {
			lineageQualifiedRowCount: rawCurrentMap.lineageQualifiedRowCount,
			lineageRequired: rawCurrentMap.lineageRequired,
			canonicalOrderingPolicy: rawCurrentMap.canonicalOrderingPolicy,
		},
	},
	counts: {
		inputRows: priorRows.length,
		outputRows: result.rows.length,
		byCurrentMapResolution: result.counts,
		exactCurrentMapMatches: result.exactCurrentMapMatches,
	},
	output: { path: path.relative(ROOT, rowsPath).replaceAll('\\', '/'), rows: result.rows.length, sha256: sha(body) },
	semantics: {
		matchKey: ['packetKey', 'sourceRef', 'sourceRevision', 'workspaceRevision'],
		priorOrdinalsAreHistoricalOnly: true,
		unmatchedPriorOrdinalsCarriedIntoCurrentIdentity: false,
		canonicalAuthority: false,
		featureAdmitted: false,
	},
	sideEffects: { localArtifactFiles: 2, postgresWrites: 0, qdrantWrites: 0, valkeyWrites: 0, neo4jWrites: 0, modelCalls: 0, graphifyRuns: 0 },
};
receipt.receiptChecksum = sha(canonicalJson(receipt));
const receiptPath = path.join(outputDir, 'manifest.json');
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, counts: receipt.counts, output: receipt.output, receiptPath: path.relative(ROOT, receiptPath).replaceAll('\\', '/') }, null, 2));

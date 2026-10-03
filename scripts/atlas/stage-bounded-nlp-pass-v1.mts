import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Set(process.argv.slice(2));
const packetKeyArgument = process.argv.slice(2).find((arg) => arg.startsWith('--packet-key='));
const suppliedPacketKey = packetKeyArgument?.slice('--packet-key='.length).trim();
const apply = args.has('--apply');
const maxSourceBytes = 20_000;

if (!suppliedPacketKey || args.has('--help')) {
	console.log('Usage: npx tsx scripts/atlas/stage-bounded-nlp-pass-v1.mts --packet-key=<existing-key> [--apply]');
	console.log('Default mode is read-only. --apply stages exactly one successful linguistic pass.');
	process.exit(args.has('--help') ? 0 : 2);
}

const { loadRuntimeEnv } = await import('../../sveltekit-frontend/src/lib/server/config/load-runtime-env.js');
loadRuntimeEnv();

const [{ pool }, { resolveCanonicalPacketKey }, { createMiniforgeNlpSidecarClient }, {
	recordAnalysisPassResult,
}, { buildAnalysisPassOutputHash, buildStagedAnalysisPassInputChecksumV1 }] = await Promise.all([
	import('../../sveltekit-frontend/src/lib/server/db/client.js'),
	import('../../sveltekit-frontend/src/lib/server/atlas/identity/packet-identity-resolver.js'),
	import('../../sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.js'),
	import('../../sveltekit-frontend/src/lib/server/analysis/analysis-pass-results.js'),
	import('../../sveltekit-frontend/src/lib/server/db/schema/analysis-pass-results.js'),
]);

const reportId = `nlp-stage-${Date.now()}-${process.pid}`;
const reportPath = path.join(repoRoot, 'docs', 'reports', 'analysis-pass-staging', `${reportId}.json`);
const report: Record<string, unknown> = {
	schema: 'atlas.bounded-nlp-stage-run.v1',
	runId: reportId,
	status: 'PREFLIGHT',
	readOnly: !apply,
	canonicalAuthority: false,
	writes: { analysisPassLedger: false, canonicalFeatureState: false, qdrant: false, valkey: false, neo4j: false },
	input: { suppliedPacketKey, sourceRef: null, sourceRevision: null, workspaceRevision: null, sourceBytes: null },
	result: null,
	readback: null,
	error: null,
};

function sha256(value: string | Buffer): string {
	return createHash('sha256').update(value).digest('hex');
}

function fail(message: string): never {
	throw new Error(message);
}

async function persistReport(): Promise<void> {
	await mkdir(path.dirname(reportPath), { recursive: true });
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
}

try {
	const resolvedStoragePacketKey = await resolveCanonicalPacketKey(suppliedPacketKey);
	const packetResult = await pool.query(
		`SELECT packet_key, source_ref, source_revision, workspace_revision
		 FROM atlas_packets WHERE packet_key = $1 LIMIT 2`,
		[resolvedStoragePacketKey],
	);
	if (packetResult.rows.length !== 1) fail('STAGING_PACKET_ROW_NOT_UNIQUE');
	const packet = packetResult.rows[0] as {
		packet_key: string;
		source_ref: string;
		source_revision: string | null;
		workspace_revision: number | null;
	};
	if (!packet.source_ref?.trim()) fail('STAGING_SOURCE_REF_MISSING');
	const sourceRevision = packet.source_revision?.trim() || null;

	const realRepoRoot = await realpath(repoRoot);
	const sourcePath = await realpath(path.resolve(realRepoRoot, packet.source_ref));
	const sourceRelativePath = path.relative(realRepoRoot, sourcePath);
	if (!sourceRelativePath || sourceRelativePath === '..' || sourceRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(sourceRelativePath)) {
		fail('STAGING_SOURCE_PATH_OUTSIDE_WORKSPACE');
	}
	const sourceBytes = await readFile(sourcePath);
	if (sourceBytes.length === 0 || sourceBytes.length > maxSourceBytes) fail('STAGING_SOURCE_SIZE_OUT_OF_BOUNDS');
	const observedSourceRevision = `sha256:${sha256(sourceBytes)}`;
	if (sourceRevision && observedSourceRevision !== sourceRevision) fail('STAGING_SOURCE_REVISION_MISMATCH');
	const sourceText = sourceBytes.toString('utf8');
	if (!Buffer.from(sourceText, 'utf8').equals(sourceBytes)) fail('STAGING_SOURCE_NOT_UTF8_ROUNDTRIP');

	report.input = {
		suppliedPacketKey,
		resolvedStoragePacketKey,
		packetIdentityResolution: suppliedPacketKey === resolvedStoragePacketKey ? 'DIRECT_STORAGE_ROW' : 'EXISTING_ALIAS',
		sourceRef: packet.source_ref,
		sourceRevision,
		sourceRevisionDisposition: sourceRevision ? 'VERIFIED_AGAINST_SOURCE_BYTES' : 'MISSING_RETAINED_NULL',
		workspaceRevision: null,
		workspaceRevisionDisposition: packet.workspace_revision && packet.workspace_revision !== 0
			? 'OMITTED_UNVERIFIED_SOURCE_VALUE'
			: 'OMITTED_LEGACY_ZERO',
		sourceBytes: sourceBytes.length,
		sourceChecksum: `sha256:${sha256(sourceBytes)}`,
		passSelection: ['linguistic'],
	};

	if (!apply) {
		report.status = 'STAGING_PLAN_READY';
		await persistReport();
		console.log(JSON.stringify({ ...report, reportPath }, null, 2));
		process.exitCode = 0;
	} else {
		const sidecar = createMiniforgeNlpSidecarClient();
		const health = await sidecar.health();
		if (!health.ready || !health.capabilities?.spacy) fail('STAGING_SPACY_CAPABILITY_UNAVAILABLE');

		const startedAt = new Date().toISOString();
		const response = await sidecar.analyze({
			text: sourceText,
			sourceType: 'codebase',
			extractionMode: 'full',
			documentId: reportId,
			sourceRef: packet.source_ref,
			sourceRevision: sourceRevision ?? undefined,
			workspaceRevision: undefined,
			packetKey: resolvedStoragePacketKey,
			language: path.extname(sourcePath).slice(1) || 'text',
			maxChars: maxSourceBytes,
			passes: ['linguistic'],
		});
		const pass = response.pass_results?.filter((item) => item.status === 'succeeded' && item.family === 'linguistic');
		if (pass?.length !== 1) fail(`STAGING_EXPECTED_ONE_LINGUISTIC_PASS_GOT_${pass?.length ?? 0}`);
		const passResult = pass[0];
		if (!response.provider_revision?.trim()) fail('STAGING_PRODUCER_REVISION_MISSING');

		const qualifiedInputHash = sha256(JSON.stringify({
			schema: 'atlas.bounded-nlp-input.v1',
			packetKey: resolvedStoragePacketKey,
			sourceRef: packet.source_ref,
			sourceRevision,
			passName: passResult.passName,
			passRevision: passResult.passRevision,
			declaredInputHash: passResult.inputHash,
			producerRevision: response.provider_revision,
			backend: passResult.backend,
			backendVersion: passResult.backendVersion,
			passSelection: ['linguistic'],
			maxSourceBytes,
		}));
		const finishedAt = new Date().toISOString();
		const stablePassPayload = {
			family: passResult.family,
			passName: passResult.passName,
			passRevision: passResult.passRevision,
			backend: passResult.backend,
			backendVersion: passResult.backendVersion,
			device: passResult.device,
			inputHash: passResult.inputHash,
			outputHash: passResult.outputHash,
			features: passResult.features,
			artifacts: passResult.artifacts,
			evidence: passResult.evidence,
			warnings: passResult.warnings,
		};
		const ledgerInput = {
			analysisJobId: randomUUID(),
			evidenceId: randomUUID(),
			jobType: 'bounded_nlp_staging_v1',
			packetKey: suppliedPacketKey,
			sourceRef: packet.source_ref,
			sourceRevision: packet.source_revision,
			workspaceRevision: null,
			family: passResult.family,
			passName: passResult.passName,
			passRevision: passResult.passRevision,
			passType: passResult.passName,
			producerId: 'miniforge-nlp-sidecar',
			producerRevision: response.provider_revision,
			backend: passResult.backend,
			backendVersion: passResult.backendVersion,
			device: passResult.device,
			inputHash: qualifiedInputHash,
			outputHash: passResult.outputHash,
			status: 'succeeded' as const,
			startedAt,
			completedAt: finishedAt,
			payload: stablePassPayload,
			features: passResult.features,
			artifacts: passResult.artifacts,
			evidence: passResult.evidence,
			warnings: passResult.warnings,
		};
		const packetIdentity = { suppliedPacketKey, resolvedStoragePacketKey };
		const expectedInputChecksum = buildStagedAnalysisPassInputChecksumV1(ledgerInput, packetIdentity);
		const expectedOutputChecksum = buildAnalysisPassOutputHash(stablePassPayload);
		const saved = await recordAnalysisPassResult(ledgerInput, { stageAsCandidateOnly: true });
		if (!saved) fail('STAGING_LEDGER_UNAVAILABLE');

		const readbackResult = await pool.query(
			`SELECT id, packet_key, status, pass_key, pass_identity_hash, input_hash, source_revision, pass_revision, provenance
			 FROM analysis_pass_results WHERE pass_key = $1 ORDER BY id DESC LIMIT 2`,
			[saved.idempotencyKey],
		);
		if (readbackResult.rows.length !== 1) fail('STAGING_READBACK_NOT_UNIQUE');
		const stored = readbackResult.rows[0] as {
			id: string;
			packet_key: string;
			status: string;
			pass_key: string;
			pass_identity_hash: string | null;
			input_hash: string | null;
			source_revision: string | null;
			pass_revision: string | null;
			provenance: Record<string, unknown>;
		};
		const storedObservation = (stored.provenance?.stagedObservation ?? {}) as Record<string, unknown>;
		const readbackPassed = stored.packet_key === resolvedStoragePacketKey
			&& stored.status === 'succeeded'
			&& stored.source_revision === sourceRevision
			&& stored.pass_revision === passResult.passRevision
			&& storedObservation.admissionDisposition === 'CANDIDATE_ONLY'
			&& storedObservation.canonicalAuthority === false
			&& storedObservation.writesCanonicalState === false
			&& storedObservation.ledgerInputChecksum === expectedInputChecksum
			&& storedObservation.outputChecksum === expectedOutputChecksum
			&& storedObservation.workspaceRevision === null;
		if (!readbackPassed) fail('STAGING_READBACK_MISMATCH');

		report.status = saved.inserted ? 'STAGED_READBACK_PROVEN' : 'IDEMPOTENT_EXISTING_STAGE_READBACK_PROVEN';
		report.readOnly = false;
		report.writes = { analysisPassLedger: saved.inserted, canonicalFeatureState: false, qdrant: false, valkey: false, neo4j: false };
		report.result = {
			inserted: saved.inserted,
			rowId: stored.id,
			passName: passResult.passName,
			passRevision: passResult.passRevision,
			producerRevision: response.provider_revision,
			inputHash: qualifiedInputHash,
			outputHash: passResult.outputHash,
			stageInputChecksum: expectedInputChecksum,
			stageOutputChecksum: expectedOutputChecksum,
		};
		report.readback = { independentSelect: true, passed: true, rows: readbackResult.rows.length };
		await persistReport();
		console.log(JSON.stringify({ ...report, reportPath }, null, 2));
	}
} catch (error) {
	report.status = 'STAGING_FAILED_CLOSED';
	report.error = error instanceof Error ? error.message : String(error);
	try {
		await persistReport();
	} catch (reportError) {
		report.reportWriteError = reportError instanceof Error ? reportError.message : String(reportError);
	}
	console.error(JSON.stringify({ ...report, reportPath }, null, 2));
	process.exitCode = 1;
} finally {
	let shutdownTimer: NodeJS.Timeout | undefined;
	const shutdown = await Promise.race([
		pool.end().then(() => 'CLOSED' as const, () => 'FAILED' as const),
		new Promise<'TIMED_OUT'>((resolve) => {
			shutdownTimer = setTimeout(() => resolve('TIMED_OUT'), 5_000);
		}),
	]);
	if (shutdownTimer) clearTimeout(shutdownTimer);
	if (shutdown !== 'CLOSED') {
		console.error(`Database pool shutdown ${shutdown.toLowerCase()}; terminating one-shot CLI after completed work.`);
		process.exitCode = 1;
	}
	const exitCode = process.exitCode ?? 0;
	await new Promise<void>((resolve) => process.stdout.write('', () => resolve()));
	process.exit(exitCode);
}

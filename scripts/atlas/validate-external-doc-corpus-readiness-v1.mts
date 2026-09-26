#!/usr/bin/env node
/**
 * External-doc corpus + Studio readiness smoke: READ ONLY.
 * Validates the local docs corpus, compares captured doc versions to the runtime, reads PostgreSQL capability/catalog
 * state, checks the DOC-06A admission handoff against the admission contract WITHOUT calling the writer, audits the
 * ast-grep/LangExtract joins, records every filesystem input it consumed (and whether a fresh checkout would have it),
 * and writes docs/reports/external-doc-studio-readiness-v1.json.
 * Never crawls, never embeds, never writes Postgres/Qdrant/Valkey/Neo4j/Graphify.
 * Run from sveltekit-frontend/: npx tsx ../scripts/atlas/validate-external-doc-corpus-readiness-v1.mts
 * (the npm script first runs the deterministic offline prerequisite build-external-doc-admission-envelopes-v1.py).
 */
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

// ---- filesystem read recorder (installed BEFORE the read model is imported, so its named fs imports are traced) ----
type Touch = { kind: 'read' | 'exists' | 'dir'; existed: boolean };
const touched = new Map<string, Touch>();
function note(p: unknown, kind: Touch['kind'], existed: boolean) {
	if (typeof p !== 'string' && !(p instanceof URL)) return;
	const abs = resolve(typeof p === 'string' ? p : fileURLToPath(p));
	const prior = touched.get(abs);
	if (!prior || (existed && !prior.existed)) touched.set(abs, { kind, existed });
}
const original = { readFileSync: fs.readFileSync, existsSync: fs.existsSync, readdirSync: fs.readdirSync };
(fs as any).readFileSync = function (p: unknown, ...rest: unknown[]) {
	try { const out = (original.readFileSync as any).call(this, p, ...rest); note(p, 'read', true); return out; } catch (error) { note(p, 'read', false); throw error; }
};
(fs as any).existsSync = function (p: unknown) { const out = (original.existsSync as any).call(this, p); note(p, 'exists', !!out); return out; };
(fs as any).readdirSync = function (p: unknown, ...rest: unknown[]) { const out = (original.readdirSync as any).call(this, p, ...rest); note(p, 'dir', true); return out; };
syncBuiltinESMExports();

loadAtlasEnv();
const { REQUIRED_TERM_GROUPS, buildDocIntelligenceStudioSnapshotV1, findRepoRoot, readIndexes, scanRequiredTerms, searchDocCorpus } =
	await import('../../sveltekit-frontend/src/lib/server/atlas/docs/doc-intelligence-read-model.js');
const { validateExternalDocAdmissionHandoff } = await import('../../sveltekit-frontend/src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js');

const root = findRepoRoot(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const outputPath = resolve(process.argv[2] ?? join(root, 'docs', 'reports', 'external-doc-studio-readiness-v1.json'));

/** Inputs produced by a deterministic offline prerequisite that the npm smoke script runs first. */
const GENERATED_INPUTS = new Set(['docs/.okf/pinned/admission-envelopes-v1.json']);
/** Gitignored (`*.jsonl`) rebuildable indexes that the readers use only when present. */
const OPTIONAL_REBUILDABLE_INPUTS = new Set(['docs/.okf/dev/corpus.jsonl', 'docs/.okf/dev/symbol-index.jsonl', 'docs/.okf/langextract/corpus.jsonl']);

function declaredVectorType(table: string): { source: string | null; declaredType: string | null } {
	const manualDir = join(root, 'sveltekit-frontend', 'drizzle', 'manual');
	if (table.startsWith('atlas_external_doc')) {
		for (const f of fs.existsSync(manualDir) ? fs.readdirSync(manualDir).filter((n) => /external_doc_intelligence/.test(n)) : []) {
			const m = /content_embedding\s+([a-z0-9()]+)/i.exec(fs.readFileSync(join(manualDir, f), 'utf8'));
			if (m) return { source: `drizzle/manual/${f}`, declaredType: m[1] };
		}
		return { source: null, declaredType: null };
	}
	const schema = join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'db', 'schema-postgres.ts');
	const text = fs.readFileSync(schema, 'utf8');
	const comment = /content_embedding[^\n]*halfvec\((\d+)\)/.exec(text);
	return { source: 'src/lib/server/db/schema-postgres.ts (declaration comment)', declaredType: comment ? `halfvec(${comment[1]})` : null };
}

function readEnvelopeHandoff() {
	const envelopesPath = join(root, 'docs', '.okf', 'pinned', 'admission-envelopes-v1.json');
	const receiptPath = join(root, 'docs', 'reports', 'external-doc-admission-envelopes-v1.json');
	if (!fs.existsSync(envelopesPath) || !fs.existsSync(receiptPath)) {
		return { result: 'DOC_ADMISSION_HANDOFF_BLOCKED', blockers: [{ code: 'ENVELOPES_NOT_BUILT', detail: 'run scripts/atlas/build-external-doc-admission-envelopes-v1.py' }], pages: 0, chunks: 0 };
	}
	const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as { native?: { nativeChunks?: number; nativeChunksWithoutDocCoordinate?: number }; envelopesDigest?: string; manifestRevision?: string; coordinateSource?: string };
	const handoff = validateExternalDocAdmissionHandoff(JSON.parse(fs.readFileSync(envelopesPath, 'utf8')), receipt.native ?? {});
	return { ...handoff, manifestRevision: receipt.manifestRevision, envelopesDigest: receipt.envelopesDigest, coordinateSource: receipt.coordinateSource, native: receipt.native, calledRealWriter: false };
}

/** Classify every consumed path: tracked in git, generated by a deterministic prerequisite, environment, or missing. */
function auditInputs() {
	const repoRel = (abs: string) => relative(root, abs).replace(/\\/g, '/');
	const consumed = [...touched.entries()]
		.filter(([abs, t]) => t.existed && !abs.includes('node_modules') && !relative(root, abs).startsWith('..'))
		.map(([abs, t]) => ({ path: repoRel(abs), kind: t.kind }))
		.sort((a, b) => a.path.localeCompare(b.path));
	const isDirectory = (p: string) => { try { return fs.statSync(join(root, p)).isDirectory(); } catch { return false; } };
	const files = consumed.filter((c) => c.kind !== 'dir' && !isDirectory(c.path)).map((c) => c.path);
	const dirs = consumed.filter((c) => c.kind === 'dir' || isDirectory(c.path)).map((c) => c.path);
	const tracked = new Set<string>();
	for (let i = 0; i < files.length; i += 100) {
		const result = spawnSync('git', ['--literal-pathspecs', '-c', 'core.quotepath=false', 'ls-files', '-z', '--', ...files.slice(i, i + 100)], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
		for (const p of (result.stdout ?? '').split('\0').filter(Boolean)) tracked.add(p);
	}
	const isEnvironment = (p: string) => /(^|\/)\.env(\.|$)/.test(p);
	// Gitignored (*.jsonl) rebuildable indexes: read when present, existsSync-guarded, proven optional by the fresh-checkout run.
	const optionalRebuildableInputs = files.filter((p) => !tracked.has(p) && OPTIONAL_REBUILDABLE_INPUTS.has(p));
	const requiredInputs = files.filter((p) => !isEnvironment(p) && !OPTIONAL_REBUILDABLE_INPUTS.has(p));
	const trackedInputs = requiredInputs.filter((p) => tracked.has(p));
	const generatedInputs = requiredInputs.filter((p) => !tracked.has(p) && GENERATED_INPUTS.has(p));
	const missingInputs = requiredInputs.filter((p) => !tracked.has(p) && !GENERATED_INPUTS.has(p));
	return {
		requiredInputs, trackedInputs, generatedInputs, missingInputs, optionalRebuildableInputs,
		environmentInputs: files.filter(isEnvironment),
		directoriesListed: dirs,
		note: 'environmentInputs are optional dotenv files and node_modules-installed package versions; they are never required for the smoke to pass.'
	};
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, max: 2 }) : null;
	try {
		const snapshot = await buildDocIntelligenceStudioSnapshotV1({ pool: pool as never, root });
		const termCoverage = REQUIRED_TERM_GROUPS.flatMap(({ group, terms }) => scanRequiredTerms(root, terms).map((t) => ({ group, ...t })));
		const doc06aHandoff = readEnvelopeHandoff();

		let ftsSmoke: unknown = { status: 'NOT_RUN', reason: 'DOC_CANONICAL_CORPUS_EMPTY or Postgres unavailable' };
		if (pool && snapshot.canonicalCorpus.status === 'PRESENT') {
			const smoke: unknown[] = [];
			for (const q of ['pgvector', 'HNSW', 'halfvec', 'PostgreSQL']) {
				const r = await searchDocCorpus({ pool: pool as never, root, q, limit: 3 });
				smoke.push({ query: q, mode: r.mode, rowsMatched: r.hits.length, top: r.hits.map((h) => `${h.product ?? h.sourceId}@${h.productVersion ?? h.revision ?? '?'}`) });
			}
			ftsSmoke = { status: 'RAN', queries: smoke };
		}

		const parity: unknown[] = [];
		let indexes: unknown[] = [];
		if (pool) {
			for (const table of ['atlas_external_doc_chunks', 'codebase_chunk_index']) {
				const live = await pool.query(
					`SELECT format_type(a.atttypid, a.atttypmod) AS t FROM pg_attribute a
					  WHERE a.attrelid = to_regclass($1) AND a.attname = 'content_embedding' AND NOT a.attisdropped`, [`public.${table}`]);
				const tableIndexes = (await readIndexes(pool as never, [table])).filter((i) => /embedding|search_vector|domain_tags/.test(i.definition));
				const declared = declaredVectorType(table);
				const liveType = live.rows[0]?.t ?? null;
				parity.push({
					table, declaredSource: declared.source, declaredType: declared.declaredType, liveType,
					dimensions: /\((\d+)\)/.exec(liveType ?? '')?.[1] ?? null,
					typeParity: declared.declaredType && liveType ? liveType.replace(/\s/g, '') === declared.declaredType.replace(/\s/g, '') : null,
					indexes: tableIndexes.map((i) => ({ name: i.name, accessMethod: i.accessMethod, operatorClass: i.operatorClass, predicate: i.predicate }))
				});
			}
			indexes = (await readIndexes(pool as never, ['atlas_external_doc_pages', 'atlas_external_doc_chunks'])).map(({ table, name, accessMethod, operatorClass, predicate }) => ({ table, name, accessMethod, operatorClass, predicate }));
		}

		const localSearch = await searchDocCorpus({ pool: null, root, q: 'io_method', limit: 3 });
		const validationFailed = snapshot.validation.status === 'FAIL';
		const secondary: string[] = [];
		if (snapshot.canonicalCorpus.status === 'EMPTY') secondary.push('DOC_CANONICAL_CORPUS_EMPTY');
		const result = validationFailed ? 'DOC_INTELLIGENCE_STUDIO_PARTIAL'
			: doc06aHandoff.result === 'DOC_ADMISSION_HANDOFF_BLOCKED' ? 'DOC_ADMISSION_HANDOFF_BLOCKED'
			: snapshot.canonicalCorpus.status === 'EMPTY' ? 'DOC_CANONICAL_CORPUS_EMPTY'
			: snapshot.canonicalCorpus.status === 'PRESENT' ? 'DOC_INTELLIGENCE_STUDIO_READINESS_PROVEN' : 'DOC_INTELLIGENCE_STUDIO_PARTIAL';

		const report = {
			schema: 'atlas.external-doc-studio-readiness.v1',
			generatedAt: new Date().toISOString(),
			runtimeVersions: snapshot.runtimeVersions,
			sourceCoverage: snapshot.versionDrift,
			manifestSources: snapshot.manifestSources,
			localCorpus: { ...snapshot.localCorpus, validation: snapshot.validation, sources: snapshot.sources.map(({ sourceId, sourceUrl, provenance, authorityClass, capturedAt, contentChecksum, versionQualification, fileExists, checksumMatches }) => ({ sourceId, sourceUrl, provenance, authorityClass, capturedAt, contentChecksum, versionQualification, fileExists, checksumMatches })) },
			canonicalCorpus: snapshot.canonicalCorpus,
			requiredTermCoverage: termCoverage,
			requiredTermNote: 'Token appearance is lexical usefulness only, never factual validation. LITERAL_HIT = exact text present; TOKEN_ONLY_HIT = only present once whitespace is removed (token-split capture); MISSING = absent.',
			doc06aHandoff,
			symbolMapping: snapshot.symbolIndexStatus,
			langExtractJoin: snapshot.langExtractStatus,
			ornithAnalysisContract: snapshot.analysisStatus,
			postgresCapabilities: { fts: snapshot.ftsCapability, vector: snapshot.vectorCapability, aio: snapshot.aioCapability, bitmap: snapshot.bitmapCapability, indexes, catalogParity: parity, ftsSmoke },
			localSearchSmoke: { query: 'io_method', mode: localSearch.mode, postgresNote: localSearch.postgresNote, hits: localSearch.hits.length, badges: [...new Set(localSearch.hits.map((h) => h.badge))] },
			studio: { route: '/admin/atlas', ssr: 'PROVEN_BY_VITEST_SPEC:DocCorpusPanel.ssr.spec.ts', searchEndpoint: '/api/admin/atlas/docs-corpus/search', snapshotEndpoint: '/api/admin/atlas/docs-corpus' },
			authority: { canonical: 'POSTGRES', localCorpusCanonical: false, qdrantCanonical: false, derivedAnalysis: 'ExternalDocAnalysisV1 contract only, no rows' },
			fsInputs: auditInputs(),
			result,
			secondaryResults: secondary,
			writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 }
		};
		fs.mkdirSync(dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
		console.log(JSON.stringify({
			result, secondary, handoff: doc06aHandoff.result, blockers: (doc06aHandoff.blockers as { code: string }[]).map((b) => b.code),
			canonical: snapshot.canonicalCorpus.status, symbol: snapshot.symbolIndexStatus.result, langextract: snapshot.langExtractStatus.result,
			inputs: { required: report.fsInputs.requiredInputs.length, tracked: report.fsInputs.trackedInputs.length, generated: report.fsInputs.generatedInputs.length, missing: report.fsInputs.missingInputs }, outputPath
		}, null, 2));
		if (validationFailed) process.exitCode = 1;
	} finally {
		await pool?.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

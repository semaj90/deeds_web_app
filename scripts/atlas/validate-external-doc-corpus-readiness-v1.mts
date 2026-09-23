#!/usr/bin/env node
/**
 * External-doc corpus + Studio readiness smoke: READ ONLY.
 * Validates the local docs corpus, compares captured doc versions to the runtime, reads PostgreSQL capability/catalog
 * state, checks the DOC-06A admission handoff against the admission contract WITHOUT calling the writer, audits the
 * ast-grep/LangExtract joins, and writes docs/reports/external-doc-studio-readiness-v1.json.
 * Never crawls, never embeds, never writes Postgres/Qdrant/Valkey/Neo4j/Graphify.
 * Run from sveltekit-frontend/: npx tsx ../scripts/atlas/validate-external-doc-corpus-readiness-v1.mts
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
	REQUIRED_TERM_GROUPS, buildDocIntelligenceStudioSnapshotV1, findRepoRoot, readIndexes, scanRequiredTerms, searchDocCorpus
} from '../../sveltekit-frontend/src/lib/server/atlas/docs/doc-intelligence-read-model.js';
import { validateExternalDocAdmissionHandoff } from '../../sveltekit-frontend/src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js';

loadAtlasEnv();
const root = findRepoRoot(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const outputPath = resolve(process.argv[2] ?? join(root, 'docs', 'reports', 'external-doc-studio-readiness-v1.json'));

function declaredVectorType(table: string): { source: string | null; declaredType: string | null } {
	const manualDir = join(root, 'sveltekit-frontend', 'drizzle', 'manual');
	if (table.startsWith('atlas_external_doc')) {
		for (const f of existsSync(manualDir) ? readdirSync(manualDir).filter((n) => /external_doc_intelligence/.test(n)) : []) {
			const m = /content_embedding\s+([a-z0-9()]+)/i.exec(readFileSync(join(manualDir, f), 'utf8'));
			if (m) return { source: `drizzle/manual/${f}`, declaredType: m[1] };
		}
		return { source: null, declaredType: null };
	}
	const schema = join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'db', 'schema-postgres.ts');
	const text = readFileSync(schema, 'utf8');
	const comment = /content_embedding[^\n]*halfvec\((\d+)\)/.exec(text);
	return { source: 'src/lib/server/db/schema-postgres.ts (declaration comment)', declaredType: comment ? `halfvec(${comment[1]})` : null };
}

function readEnvelopeHandoff() {
	const envelopesPath = join(root, 'docs', '.okf', 'pinned', 'admission-envelopes-v1.json');
	const receiptPath = join(root, 'docs', 'reports', 'external-doc-admission-envelopes-v1.json');
	if (!existsSync(envelopesPath) || !existsSync(receiptPath)) {
		return { result: 'DOC_ADMISSION_HANDOFF_BLOCKED', blockers: [{ code: 'ENVELOPES_NOT_BUILT', detail: 'run scripts/atlas/build-external-doc-admission-envelopes-v1.py' }], pages: 0, chunks: 0 };
	}
	const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as { native?: { nativeChunks?: number; nativeChunksWithoutDocCoordinate?: number }; envelopesDigest?: string; manifestRevision?: string; coordinateSource?: string };
	const handoff = validateExternalDocAdmissionHandoff(JSON.parse(readFileSync(envelopesPath, 'utf8')), receipt.native ?? {});
	return { ...handoff, manifestRevision: receipt.manifestRevision, envelopesDigest: receipt.envelopesDigest, coordinateSource: receipt.coordinateSource, native: receipt.native, calledRealWriter: false };
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
		if (pool) {
			for (const table of ['atlas_external_doc_chunks', 'codebase_chunk_index']) {
				const live = await pool.query(
					`SELECT format_type(a.atttypid, a.atttypmod) AS t FROM pg_attribute a
					  WHERE a.attrelid = to_regclass($1) AND a.attname = 'content_embedding' AND NOT a.attisdropped`, [`public.${table}`]);
				const indexes = (await readIndexes(pool as never, [table])).filter((i) => /embedding|search_vector|domain_tags/.test(i.definition));
				const declared = declaredVectorType(table);
				const liveType = live.rows[0]?.t ?? null;
				parity.push({
					table, declaredSource: declared.source, declaredType: declared.declaredType, liveType,
					dimensions: /\((\d+)\)/.exec(liveType ?? '')?.[1] ?? null,
					typeParity: declared.declaredType && liveType ? liveType.replace(/\s/g, '') === declared.declaredType.replace(/\s/g, '') : null,
					indexes: indexes.map((i) => ({ name: i.name, accessMethod: i.accessMethod, operatorClass: i.operatorClass, predicate: i.predicate }))
				});
			}
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
			requiredTermNote: 'Token appearance is lexical usefulness only, never factual validation. tokenSplitHits count matches that only appear once whitespace is removed (GitHub highlighted code is captured one token per line).',
			doc06aHandoff,
			symbolMapping: snapshot.symbolIndexStatus,
			langExtractJoin: snapshot.langExtractStatus,
			ornithAnalysisContract: snapshot.analysisStatus,
			postgresCapabilities: {
				fts: snapshot.ftsCapability, vector: snapshot.vectorCapability, aio: snapshot.aioCapability, bitmap: snapshot.bitmapCapability,
				indexes: pool ? (await readIndexes(pool as never, ['atlas_external_doc_pages', 'atlas_external_doc_chunks'])).map(({ table, name, accessMethod, operatorClass, predicate }) => ({ table, name, accessMethod, operatorClass, predicate })) : [],
				catalogParity: parity, ftsSmoke
			},
			localSearchSmoke: { query: 'io_method', mode: localSearch.mode, postgresNote: localSearch.postgresNote, hits: localSearch.hits.length, badges: [...new Set(localSearch.hits.map((h) => h.badge))] },
			studio: { route: '/admin/atlas', ssr: 'PROVEN_BY_VITEST_SPEC:DocCorpusPanel.ssr.spec.ts', searchEndpoint: '/api/admin/atlas/docs-corpus/search', snapshotEndpoint: '/api/admin/atlas/docs-corpus' },
			authority: { canonical: 'POSTGRES', localCorpusCanonical: false, qdrantCanonical: false, derivedAnalysis: 'ExternalDocAnalysisV1 contract only, no rows' },
			result,
			secondaryResults: secondary,
			writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 }
		};
		mkdirSync(dirname(outputPath), { recursive: true });
		writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
		console.log(JSON.stringify({ result, secondary, handoff: doc06aHandoff.result, blockers: (doc06aHandoff.blockers as { code: string }[]).map((b) => b.code), canonical: snapshot.canonicalCorpus.status, symbol: snapshot.symbolIndexStatus.result, langextract: snapshot.langExtractStatus.result, outputPath }, null, 2));
		if (validationFailed) process.exitCode = 1;
	} finally {
		await pool?.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

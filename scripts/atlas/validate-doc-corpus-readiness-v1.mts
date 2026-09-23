#!/usr/bin/env node
/**
 * DOC-CORPUS-VALIDATION-01 / DOC-CORPUS-SEARCH-01 smoke: READ ONLY.
 * Validates the local docs corpus, reads PostgreSQL capability/catalog state, runs an FTS smoke when
 * canonical rows exist, and writes docs/reports/doc-corpus-studio-smoke-v1.json.
 * Never crawls, never embeds, never writes Postgres/Qdrant/Valkey/Neo4j.
 * Run from sveltekit-frontend/: npx tsx ../scripts/atlas/validate-doc-corpus-readiness-v1.mts
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
	REQUIRED_TERMS, buildDocCorpusStudioSnapshotV1, findRepoRoot, readIndexes, scanRequiredTerms, searchDocCorpus
} from '../../sveltekit-frontend/src/lib/server/atlas/docs/doc-corpus-studio-read.js';

loadAtlasEnv();
const root = findRepoRoot(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const outputPath = resolve(process.argv[2] ?? join(root, 'docs', 'reports', 'doc-corpus-studio-smoke-v1.json'));

function declaredVectorType(table: string): { source: string | null; declaredType: string | null } {
	const manualDir = join(root, 'sveltekit-frontend', 'drizzle', 'manual');
	if (table.startsWith('atlas_external_doc')) {
		for (const f of existsSync(manualDir) ? readdirSync(manualDir).filter((n) => /external_doc/.test(n)) : []) {
			const m = /content_embedding\s+([a-z0-9()]+)/i.exec(readFileSync(join(manualDir, f), 'utf8'));
			if (m) return { source: `drizzle/manual/${f}`, declaredType: m[1] };
		}
		return { source: null, declaredType: null };
	}
	const schema = join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'db', 'schema-postgres.ts');
	const text = readFileSync(schema, 'utf8');
	const block = text.slice(text.indexOf(`pgTable('${table}'`));
	const m = /content_embedding: halfvec|content_embedding.*?(halfvec|vector)\('content_embedding'[^)]*dimensions:\s*(\d+)/s.exec(block) ?? /(halfvec|vector)\('content_embedding',\s*\{\s*dimensions:\s*(\d+)/.exec(block);
	if (m) return { source: 'src/lib/server/db/schema-postgres.ts', declaredType: `${m[1] ?? 'halfvec'}(${m[2] ?? '?'})` };
	const comment = /content_embedding[^\n]*halfvec\((\d+)\)/.exec(text);
	return { source: 'src/lib/server/db/schema-postgres.ts (comment only)', declaredType: comment ? `halfvec(${comment[1]})` : null };
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, max: 2 }) : null;
	try {
		const snapshot = await buildDocCorpusStudioSnapshotV1({ pool: pool as never, root });
		const termCoverage = scanRequiredTerms(root, REQUIRED_TERMS);

		let ftsSmoke: unknown = { status: 'NOT_RUN', reason: 'DOC_CORPUS_POSTGRES_EMPTY or Postgres unavailable' };
		if (pool && snapshot.postgresCorpus.status === 'PRESENT') {
			const smoke: unknown[] = [];
			for (const q of ['pgvector', 'HNSW', 'halfvec', 'PostgreSQL']) {
				const r = await searchDocCorpus({ pool: pool as never, root, q, limit: 3 });
				smoke.push({ query: q, mode: r.mode, rowsMatched: r.hits.length, top: r.hits.map((h) => `${h.sourceId}@${h.productVersion ?? h.revision ?? '?'}`) });
			}
			ftsSmoke = { status: 'RAN', queries: smoke };
		}

		const parity: unknown[] = [];
		if (pool) {
			for (const table of ['atlas_external_doc_pages', 'atlas_external_doc_chunks', 'codebase_chunk_index']) {
				const live = await pool.query(
					`SELECT format_type(a.atttypid, a.atttypmod) AS t FROM pg_attribute a
					  WHERE a.attrelid = to_regclass($1) AND a.attname = 'content_embedding' AND NOT a.attisdropped`, [`public.${table}`]);
				const indexes = (await readIndexes(pool as never, [table])).filter((i) => /embedding|search_vector|domain_tags/.test(i.definition));
				const declared = table === 'atlas_external_doc_pages' ? { source: null, declaredType: null } : declaredVectorType(table);
				const liveType = live.rows[0]?.t ?? null;
				parity.push({
					table, declaredSource: declared.source, declaredType: declared.declaredType, liveType,
					dimensions: /\((\d+)\)/.exec(liveType ?? '')?.[1] ?? null,
					typeParity: declared.declaredType && liveType ? liveType.replace(/\s/g, '') === declared.declaredType.replace(/\s/g, '') : null,
					indexes: indexes.map((i) => ({ name: i.name, accessMethod: i.accessMethod, operatorClass: i.operatorClass, predicate: i.predicate }))
				});
			}
		}

		const searchLocal = await searchDocCorpus({ pool: null, root, q: 'io_method', limit: 3 });
		const validationFailed = snapshot.validation.status === 'FAIL';
		const result = validationFailed
			? 'DOC_CORPUS_VALIDATION_FAILED'
			: snapshot.postgresCorpus.status === 'EMPTY' ? 'DOC_CORPUS_POSTGRES_EMPTY'
			: snapshot.postgresCorpus.status === 'PRESENT' ? 'DOC_CORPUS_STUDIO_PARTIAL' : 'DOC_CORPUS_STUDIO_PARTIAL';

		const report = {
			schema: 'atlas.doc-corpus-studio-smoke.v1',
			generatedAt: new Date().toISOString(),
			repoVersions: { drizzleOrm: snapshot.runtimeVersions.drizzleOrm, drizzleKit: snapshot.runtimeVersions.drizzleKit, pg: snapshot.runtimeVersions.pg },
			runtimeVersions: { postgres: snapshot.runtimeVersions.postgres, pgvector: snapshot.runtimeVersions.pgvector },
			localCorpus: { ...snapshot.localCorpus, coverage: snapshot.coverage, sources: snapshot.sources },
			postgresCorpus: snapshot.postgresCorpus,
			requiredTermCoverage: termCoverage,
			aioCapability: snapshot.capabilities.aio,
			bitmapCapability: snapshot.capabilities.bitmap,
			catalogParity: parity,
			ftsSmoke,
			localSearchSmoke: { query: 'io_method', mode: searchLocal.mode, postgresNote: searchLocal.postgresNote, hits: searchLocal.hits.length, badges: [...new Set(searchLocal.hits.map((h) => h.badge))] },
			validation: snapshot.validation,
			studio: { ssr: 'PROVEN_BY_VITEST_SPEC:DocCorpusPanel.ssr.spec.ts', route: '/admin/atlas', searchEndpoint: '/api/admin/atlas/docs-corpus/search' },
			authority: { canonical: 'POSTGRES', localCorpusCanonical: false, qdrantCanonical: false },
			result,
			writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 }
		};
		mkdirSync(dirname(outputPath), { recursive: true });
		writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
		console.log(JSON.stringify({ result, validation: snapshot.validation.status, issues: snapshot.validation.issues.length, postgres: snapshot.postgresCorpus.status, outputPath }, null, 2));
		if (validationFailed) process.exitCode = 1;
	} finally {
		await pool?.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

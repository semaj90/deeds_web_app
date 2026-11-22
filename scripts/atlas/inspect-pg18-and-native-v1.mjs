#!/usr/bin/env node
/**
 * PostgreSQL 18 (pgvector / GIN / canonical tables) + Native C++/NES-LUT/simdjson/LibTorch Inspector (v1)
 *
 * Replaces Neo4j-dependent graph inspection (when NEO4J_ENABLED=false) with direct
 * read-only PostgreSQL 18 catalog/index inspection and native binary artifact verification.
 *
 * Writes: docs/reports/pg18-native-capability-audit-v1.json
 */

import 'dotenv/config';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const require = createRequire(resolve(repoRoot, 'sveltekit-frontend/package.json'));
const pg = require('pg');

const OUT_PATH = resolve(repoRoot, 'docs/reports/pg18-native-capability-audit-v1.json');

const NATIVE_ARTIFACTS = [
	{ id: 'nes_lut_avx2_src', path: 'simd-bridge/cpp/nes_lut_filter_avx2.cpp', kind: 'cpp_source' },
	{ id: 'nes_lut_avx2_exe', path: 'simd-bridge/cpp/test_nes_lut_filter_avx2.exe', kind: 'native_binary' },
	{ id: 'simdjson_bridge', path: 'simd-bridge/cpp/simdjson_bridge.cc', kind: 'cpp_source' },
	{ id: 'libtorch_graph', path: 'simd-bridge/cpp/libtorch_graph_impl.cpp', kind: 'cpp_source' },
	{ id: 'mrl_renorm_avx2', path: 'simd-bridge/cpp/mrl_prefix_renorm_avx2.cpp', kind: 'cpp_source' },
	{ id: 'indexed_palette_4bpp', path: 'simd-bridge/cpp/indexed_palette_4bpp.h', kind: 'cpp_header' },
	{ id: 'atlas_byte_synth_dll', path: 'simd-bridge/cpp/atlas_byte_synth.dll', kind: 'native_dll' },
	{ id: 'atlas_native_core_pkg', path: 'packages/atlas-native-core/package.json', kind: 'napi_package' }
];

async function inspectPostgres() {
	const connectionString =
		process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
	const client = new pg.Client({ connectionString });
	await client.connect();
	try {
		const versionRes = await client.query('SELECT version()');
		const pgvectorExt = await client.query(
			"SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'pg_trgm', 'uuid-ossp')"
		);
		const vectorIndexes = await client.query(`
			SELECT schemaname, tablename, indexname, indexdef
			FROM pg_indexes
			WHERE schemaname = 'public'
			  AND (indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%ivfflat%' OR indexdef ILIKE '%vector%' OR tablename IN ('codebase_chunk_index', 'scene_document_revisions', 'scene_assets', 'scene_generation_jobs', 'character_assets'))
			ORDER BY tablename, indexname
		`);
		const tableCheck = await client.query(`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
			  AND table_name IN ('codebase_chunk_index', 'scene_document_revisions', 'scene_assets', 'scene_generation_jobs', 'character_assets', 'users', 'sessions')
			ORDER BY table_name
		`);
		const existingTables = new Set(tableCheck.rows.map((r) => r.table_name));
		const tableCounts = {};
		for (const tbl of existingTables) {
			const c = await client.query(`SELECT count(*)::int AS cnt FROM "${tbl}"`);
			tableCounts[tbl] = c.rows[0]?.cnt ?? 0;
		}
		let chunkEmbeddingStats = null;
		if (existingTables.has('codebase_chunk_index')) {
			const emb = await client.query(`
				SELECT
					count(*)::int AS total_rows,
					count(content_embedding_768)::int AS embedded_768_rows
				FROM codebase_chunk_index
			`);
			chunkEmbeddingStats = emb.rows[0];
		}

		return {
			connected: true,
			serverVersion: versionRes.rows[0]?.version ?? null,
			extensions: pgvectorExt.rows,
			vectorAndSceneIndexes: vectorIndexes.rows,
			tableCounts,
			chunkEmbeddingStats
		};
	} finally {
		await client.end();
	}
}

function inspectNativeArtifacts() {
	return NATIVE_ARTIFACTS.map((item) => {
		const full = resolve(repoRoot, item.path);
		const exists = existsSync(full);
		return {
			...item,
			exists,
			bytes: exists ? statSync(full).size : 0
		};
	});
}

async function main() {
	let postgres;
	try {
		postgres = await inspectPostgres();
	} catch (err) {
		postgres = { connected: false, error: err instanceof Error ? err.message : String(err) };
	}

	const nativeArtifacts = inspectNativeArtifacts();
	const report = {
		schema: 'atlas.pg18-native-capability-audit.v1',
		generatedAt: new Date().toISOString(),
		postgres,
		nativeArtifacts
	};

	mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
	writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
	console.log(
		JSON.stringify(
			{
				wrote: 'docs/reports/pg18-native-capability-audit-v1.json',
				pgConnected: postgres.connected,
				extensions: postgres.extensions,
				indexCount: postgres.vectorAndSceneIndexes?.length ?? 0,
				tableCounts: postgres.tableCounts,
				chunkEmbeddingStats: postgres.chunkEmbeddingStats,
				nativePresent: nativeArtifacts.filter((a) => a.exists).length + '/' + nativeArtifacts.length
			},
			null,
			2
		)
	);
}

main();

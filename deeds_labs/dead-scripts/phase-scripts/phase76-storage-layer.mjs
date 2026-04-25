#!/usr/bin/env node
/**
 * Phase 76: Storage Layer Integration
 *
 * Unified interface for:
 * - MinIO (S3): Deep context storage (full HTML/text)
 * - Redis: Semantic caching
 * - PostgreSQL (pgvector): Structured knowledge with embeddings
 * - Qdrant: Fast vector search
 *
 * This prevents redundant LLM calls and stores migration knowledge persistently.
 */

import chalk from 'chalk';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import { Client as MinioClient } from 'minio';
import pg from 'pg';

dotenv.config();

// --- 1. MinIO Configuration (Deep Storage) ---
export const minioClient = new MinioClient({
	endPoint: process.env.MINIO_ENDPOINT || 'localhost',
	port: parseInt(process.env.MINIO_PORT || '9000'),
	useSSL: process.env.MINIO_USE_SSL === 'true',
	accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
	secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

export const BUCKETS = {
	SUMMARIES: 'phase76-summaries',
	DOCS: 'phase76-docs',
	ERRORS: 'phase76-errors'
};

// --- 2. PostgreSQL Configuration (Structured Memory) ---
const pgPool = new pg.Pool({
	connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/phase76'
});

// --- 3. Redis Configuration (Semantic Cache) ---
export const redis = new Redis({
	host: process.env.REDIS_HOST || 'localhost',
	port: parseInt(process.env.REDIS_PORT || '6379'),
	password: process.env.REDIS_PASSWORD,
	enableOfflineQueue: false,
	retryStrategy: (times) => {
		if (times > 3) return null; // Stop retrying after 3 attempts
		return Math.min(times * 100, 2000);
	}
});

redis.on('error', (err) => {
	console.log(chalk.yellow('⚠️  Redis connection error (will work without cache)'));
});

// --- 4. Initialization Functions ---

export async function initializeStorage() {
	console.log(chalk.cyan('🔧 Initializing Phase 76 Storage Layer...\n'));

	// Initialize MinIO buckets
	try {
		for (const bucket of Object.values(BUCKETS)) {
			const exists = await minioClient.bucketExists(bucket);
			if (!exists) {
				await minioClient.makeBucket(bucket);
				console.log(chalk.green(`✅ MinIO bucket created: ${bucket}`));
			} else {
				console.log(chalk.gray(`   MinIO bucket exists: ${bucket}`));
			}
		}
	} catch (err) {
		console.log(chalk.yellow(`⚠️  MinIO not available (optional): ${err.message}`));
	}

	// Test PostgreSQL connection
	try {
		const result = await pgPool.query('SELECT NOW()');
		console.log(chalk.green(`✅ PostgreSQL connected`));

		// Check if pgvector is enabled
		const vectorCheck = await pgPool.query(
			"SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
		);
		if (vectorCheck.rows[0].exists) {
			console.log(chalk.green(`✅ pgvector extension enabled`));
		} else {
			console.log(chalk.yellow(`⚠️  pgvector extension not found - run setup-pgvector.sql`));
		}
	} catch (err) {
		console.log(chalk.yellow(`⚠️  PostgreSQL not available: ${err.message}`));
	}

	// Test Redis connection
	try {
		await redis.ping();
		console.log(chalk.green(`✅ Redis connected\n`));
	} catch (err) {
		console.log(chalk.yellow(`⚠️  Redis not available (optional): ${err.message}\n`));
	}
}

// --- 5. Deep Knowledge Storage (MinIO + PostgreSQL) ---

/**
 * Store documentation with full text in MinIO and metadata in PostgreSQL
 */
export async function storeDeepKnowledge(doc, embedding) {
	const { url, title, content, type = 'documentation', framework = 'svelte', version = '5.0' } = doc;

	// Generate MinIO key
	const timestamp = Date.now();
	const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
	const minioKey = `${framework}/${version}/${sanitizedTitle}_${timestamp}.json`;

	try {
		// A. Save full content to MinIO
		const dataStream = Buffer.from(JSON.stringify({
			url,
			title,
			content,
			metadata: { framework, version, type, crawledAt: new Date().toISOString() }
		}));

		await minioClient.putObject(BUCKETS.DOCS, minioKey, dataStream);
		console.log(chalk.gray(`   💾 MinIO: ${minioKey}`));

		// B. Save reference + embedding to PostgreSQL
		const vectorStr = `[${embedding.join(',')}]`;
		const result = await pgPool.query(
			`INSERT INTO doc_references (url, title, minio_key, doc_type, framework, version, embedding)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 ON CONFLICT (url) DO UPDATE
			 SET minio_key = $3, embedding = $7, created_at = NOW()
			 RETURNING id`,
			[url, title, minioKey, type, framework, version, vectorStr]
		);

		console.log(chalk.green(`✅ Stored: ${title} (ID: ${result.rows[0].id})`));
		return result.rows[0].id;
	} catch (err) {
		console.error(chalk.red(`❌ Storage error: ${err.message}`));
		throw err;
	}
}

/**
 * Store error pattern with fix suggestion
 */
export async function storeErrorPattern(error, fix, embedding) {
	const { signature, filePath, errorCode, fixSummary, fixCode } = error;

	try {
		const vectorStr = `[${embedding.join(',')}]`;

		// Check if pattern exists
		const existing = await pgPool.query(
			'SELECT id, occurrences FROM error_patterns WHERE signature = $1 AND file_path = $2',
			[signature, filePath]
		);

		if (existing.rows.length > 0) {
			// Update occurrences
			await pgPool.query(
				`UPDATE error_patterns
				 SET occurrences = occurrences + 1, last_seen = NOW()
				 WHERE id = $1`,
				[existing.rows[0].id]
			);
			console.log(chalk.gray(`   🔄 Updated pattern (${existing.rows[0].occurrences + 1} occurrences)`));
			return existing.rows[0].id;
		} else {
			// Insert new pattern
			const result = await pgPool.query(
				`INSERT INTO error_patterns
				 (signature, file_path, error_code, fix_summary, fix_code, embedding)
				 VALUES ($1, $2, $3, $4, $5, $6)
				 RETURNING id`,
				[signature, filePath, errorCode, fixSummary, fixCode, vectorStr]
			);
			console.log(chalk.green(`✅ New error pattern stored (ID: ${result.rows[0].id})`));
			return result.rows[0].id;
		}
	} catch (err) {
		console.error(chalk.red(`❌ Error pattern storage failed: ${err.message}`));
		throw err;
	}
}

// --- 6. Semantic Cache (Redis) ---

/**
 * Check if we've seen this query recently
 * Returns cached result or null
 */
export async function checkSemanticCache(queryHash, maxAge = 3600) {
	try {
		const cacheKey = `phase76:semantic:${queryHash}`;
		const cached = await redis.get(cacheKey);

		if (cached) {
			console.log(chalk.cyan(`⚡ Cache HIT: ${queryHash.substring(0, 16)}...`));
			return JSON.parse(cached);
		}

		return null;
	} catch (err) {
		// Redis down, skip cache
		return null;
	}
}

/**
 * Cache query result
 */
export async function setSemanticCache(queryHash, result, ttl = 3600) {
	try {
		const cacheKey = `phase76:semantic:${queryHash}`;
		await redis.setex(cacheKey, ttl, JSON.stringify(result));
		console.log(chalk.gray(`   💨 Cached result (${ttl}s TTL)`));
	} catch (err) {
		// Redis down, skip cache
	}
}

// --- 7. Vector Search (PostgreSQL pgvector) ---

/**
 * Search for similar error patterns
 */
export async function searchErrorPatterns(embedding, limit = 5, threshold = 0.7) {
	try {
		const vectorStr = `[${embedding.join(',')}]`;
		const result = await pgPool.query(
			`SELECT
				id,
				signature,
				file_path,
				error_code,
				fix_summary,
				fix_code,
				occurrences,
				1 - (embedding <=> $1::vector) AS similarity
			FROM error_patterns
			WHERE 1 - (embedding <=> $1::vector) > $2
			ORDER BY embedding <=> $1::vector
			LIMIT $3`,
			[vectorStr, threshold, limit]
		);

		return result.rows.map(row => ({
			id: row.id,
			signature: row.signature,
			filePath: row.file_path,
			errorCode: row.error_code,
			fixSummary: row.fix_summary,
			fixCode: row.fix_code,
			occurrences: row.occurrences,
			similarity: parseFloat(row.similarity)
		}));
	} catch (err) {
		console.error(chalk.red(`❌ Vector search error: ${err.message}`));
		return [];
	}
}

/**
 * Search for documentation
 */
export async function searchDocs(embedding, framework = null, limit = 5, threshold = 0.6) {
	try {
		const vectorStr = `[${embedding.join(',')}]`;

		let query = `
			SELECT
				id,
				url,
				title,
				minio_key,
				doc_type,
				framework,
				version,
				1 - (embedding <=> $1::vector) AS similarity
			FROM doc_references
			WHERE 1 - (embedding <=> $1::vector) > $2
		`;

		const params = [vectorStr, threshold];

		if (framework) {
			query += ` AND framework = $${params.length + 1}`;
			params.push(framework);
		}

		query += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
		params.push(limit);

		const result = await pgPool.query(query, params);

		return result.rows.map(row => ({
			id: row.id,
			url: row.url,
			title: row.title,
			minioKey: row.minio_key,
			docType: row.doc_type,
			framework: row.framework,
			version: row.version,
			similarity: parseFloat(row.similarity)
		}));
	} catch (err) {
		console.error(chalk.red(`❌ Doc search error: ${err.message}`));
		return [];
	}
}

/**
 * Fetch full document from MinIO
 */
export async function fetchDeepDoc(minioKey) {
	try {
		const dataStream = await minioClient.getObject(BUCKETS.DOCS, minioKey);

		// Read stream to buffer
		const chunks = [];
		for await (const chunk of dataStream) {
			chunks.push(chunk);
		}

		const buffer = Buffer.concat(chunks);
		const doc = JSON.parse(buffer.toString());

		console.log(chalk.gray(`   📦 Hydrated from MinIO: ${minioKey}`));
		return doc;
	} catch (err) {
		console.error(chalk.red(`❌ MinIO fetch error: ${err.message}`));
		return null;
	}
}

// --- 8. Migration Pattern Lookup ---

/**
 * Get all known Svelte 4 → 5 migration patterns
 */
export async function getMigrationPatterns() {
	try {
		const result = await pgPool.query(
			`SELECT
				old_syntax,
				new_syntax,
				pattern_type,
				context,
				warning_message,
				auto_fixable,
				confidence
			FROM migration_patterns
			ORDER BY confidence DESC, pattern_type`
		);

		return result.rows;
	} catch (err) {
		console.error(chalk.red(`❌ Migration patterns error: ${err.message}`));
		return [];
	}
}

/**
 * Find migration pattern for specific old syntax
 */
export async function findMigrationPattern(oldSyntax) {
	try {
		const result = await pgPool.query(
			`SELECT
				old_syntax,
				new_syntax,
				pattern_type,
				context,
				warning_message,
				auto_fixable,
				confidence
			FROM migration_patterns
			WHERE old_syntax = $1
			LIMIT 1`,
			[oldSyntax]
		);

		return result.rows[0] || null;
	} catch (err) {
		console.error(chalk.red(`❌ Pattern lookup error: ${err.message}`));
		return null;
	}
}

// --- 9. Cleanup ---

export async function cleanup() {
	await pgPool.end();
	redis.disconnect();
	console.log(chalk.gray('\n🔌 Connections closed'));
}

// --- 10. Health Check ---

export async function healthCheck() {
	console.log(chalk.bold.cyan('\n🏥 Phase 76 Storage Layer Health Check\n'));

	const status = {
		minio: false,
		postgres: false,
		redis: false,
		pgvector: false
	};

	// MinIO
	try {
		await minioClient.listBuckets();
		status.minio = true;
		console.log(chalk.green('✅ MinIO: Connected'));
	} catch (err) {
		console.log(chalk.red('❌ MinIO: Not available'));
	}

	// PostgreSQL
	try {
		await pgPool.query('SELECT NOW()');
		status.postgres = true;
		console.log(chalk.green('✅ PostgreSQL: Connected'));

		// pgvector
		const vectorCheck = await pgPool.query(
			"SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
		);
		status.pgvector = vectorCheck.rows[0].exists;
		if (status.pgvector) {
			console.log(chalk.green('✅ pgvector: Enabled'));

			// Count records
			const errorCount = await pgPool.query('SELECT COUNT(*) FROM error_patterns');
			const docCount = await pgPool.query('SELECT COUNT(*) FROM doc_references');
			const migrationCount = await pgPool.query('SELECT COUNT(*) FROM migration_patterns');

			console.log(chalk.gray(`   Error patterns: ${errorCount.rows[0].count}`));
			console.log(chalk.gray(`   Documents: ${docCount.rows[0].count}`));
			console.log(chalk.gray(`   Migration patterns: ${migrationCount.rows[0].count}`));
		} else {
			console.log(chalk.yellow('⚠️  pgvector: Not enabled (run setup-pgvector.sql)'));
		}
	} catch (err) {
		console.log(chalk.red(`❌ PostgreSQL: ${err.message}`));
	}

	// Redis
	try {
		await redis.ping();
		status.redis = true;
		console.log(chalk.green('✅ Redis: Connected'));
	} catch (err) {
		console.log(chalk.yellow('⚠️  Redis: Not available (caching disabled)'));
	}

	console.log('');
	return status;
}

// Execute health check if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
	healthCheck().then(() => cleanup()).catch(console.error);
}

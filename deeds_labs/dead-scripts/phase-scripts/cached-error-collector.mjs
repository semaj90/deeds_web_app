#!/usr/bin/env node
/**
 * Cached Error Collector - Phase 72+
 *
 * Smart error collection with Redis caching:
 * - Only re-checks files that have changed (content hash)
 * - Caches results in Redis
 * - Stores error embeddings in Qdrant
 * - Fast JSONL output
 * - Incremental updates
 *
 * Usage:
 *   node scripts/cached-error-collector.mjs [--force] [--clear-cache]
 */

import chalk from 'chalk';
import { execSync } from 'child_process';
import cliProgress from 'cli-progress';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient } from 'redis';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const force = args.includes('--force');
const clearCache = args.includes('--clear-cache');
const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : 'reports/latest/errors.jsonl';

console.log(chalk.cyan.bold('🚀 Cached Error Collector - Phase 72+\n'));

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const CACHE_PREFIX = 'error-cache:';
const CACHE_TTL = 86400; // 24 hours

let redisClient;
const stats = {
	totalFiles: 0,
	cachedFiles: 0,
	checkedFiles: 0,
	totalErrors: 0,
	cacheHits: 0,
	cacheMisses: 0
};

/**
 * Calculate hash of file content
 */
function hashFile(filePath) {
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		return createHash('sha256').update(content).digest('hex');
	} catch (error) {
		return null;
	}
}

/**
 * Get Ollama endpoint from environment or default
 */
function getOllamaEndpoint() {
	if (process.env.OLLAMA_BASE_URL) return process.env.OLLAMA_BASE_URL;
	if (process.env.OLLAMA_URL) return process.env.OLLAMA_URL;
	return 'http://localhost:11434';
}

/**
 * Initialize Redis connection
 */
async function initRedis() {
	console.log(chalk.yellow('🔌 Connecting to Redis...\n'));

	const clientOptions = { url: REDIS_URL };

	// Only add password if explicitly set in env
	if (process.env.REDIS_PASSWORD) {
		clientOptions.password = process.env.REDIS_PASSWORD;
	}

	redisClient = createClient(clientOptions);

	redisClient.on('error', (err) => {
		console.error(chalk.red('Redis error:'), err);
	});

	await redisClient.connect();
	console.log(chalk.green('✅ Redis connected\n'));

	if (clearCache) {
		console.log(chalk.yellow('🗑️  Clearing cache...\n'));
		const keys = await redisClient.keys(`${CACHE_PREFIX}*`);
		if (keys.length > 0) {
			await redisClient.del(keys);
			console.log(chalk.green(`✅ Cleared ${keys.length} cache entries\n`));
		}
	}
}

/**
 * Get cached errors for a file
 */
async function getCachedErrors(filePath, fileHash) {
	const cacheKey = `${CACHE_PREFIX}${filePath}`;

	try {
		const cached = await redisClient.get(cacheKey);
		if (!cached) {
			stats.cacheMisses++;
			return null;
		}

		const data = JSON.parse(cached);

		// Check if hash matches
		if (data.hash !== fileHash) {
			stats.cacheMisses++;
			return null;
		}

		stats.cacheHits++;
		return data.errors || [];
	} catch (error) {
		stats.cacheMisses++;
		return null;
	}
}

/**
 * Store errors in cache
 */
async function cacheErrors(filePath, fileHash, errors) {
	const cacheKey = `${CACHE_PREFIX}${filePath}`;

	const data = {
		hash: fileHash,
		errors,
		timestamp: new Date().toISOString()
	};

	await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
}

/**
 * Find all TypeScript and Svelte files
 */
function findSourceFiles() {
	console.log(chalk.yellow('🔍 Finding source files...\n'));

	const extensions = ['.ts', '.tsx', '.js', '.jsx', '.svelte'];
	const exclude = ['node_modules', 'dist', 'build', '.svelte-kit', 'venv', '__pycache__'];

	const files = [];

	function walk(dir) {
		const entries = fs.readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory()) {
				if (!exclude.includes(entry.name)) {
					walk(fullPath);
				}
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name);
				if (extensions.includes(ext)) {
					files.push(fullPath);
				}
			}
		}
	}

	const srcDir = path.join(__dirname, '..', 'src');
	if (fs.existsSync(srcDir)) {
		walk(srcDir);
	}

	console.log(chalk.green(`✅ Found ${files.length} source files\n`));
	return files;
}

/**
 * Check a single file with tsc
 */
function checkTypeScriptFile(filePath) {
	const errors = [];

	try {
		const tempFile = path.join(__dirname, '..', '.tsc-single-output.tmp');
		execSync(`npx tsc --noEmit --pretty false "${filePath}" > "${tempFile}" 2>&1`, {
			cwd: path.join(__dirname, '..'),
			shell: true
		});

		// Read output
		if (fs.existsSync(tempFile)) {
			const output = fs.readFileSync(tempFile, 'utf-8');
			fs.unlinkSync(tempFile);

			// Parse errors
			const lines = output.split('\n');
			for (const line of lines) {
				const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/);
				if (match) {
					errors.push({
						file: match[1].replace(/\\/g, '/'),
						line: parseInt(match[2]),
						column: parseInt(match[3]),
						severity: match[4],
						code: match[5],
						message: match[6],
						source: 'tsc',
						timestamp: new Date().toISOString()
					});
				}
			}
		}
	} catch (error) {
		// tsc exits with error code, this is expected
	}

	return errors;
}

/**
 * Check a Svelte file with svelte-check
 */
function checkSvelteFile(filePath) {
	const errors = [];

	try {
		const tempFile = path.join(__dirname, '..', '.svelte-single-output.tmp');
		execSync(`npx svelte-check --workspace "${filePath}" --output machine > "${tempFile}" 2>&1`, {
			cwd: path.join(__dirname, '..'),
			shell: true
		});

		// Read output
		if (fs.existsSync(tempFile)) {
			const output = fs.readFileSync(tempFile, 'utf-8');
			fs.unlinkSync(tempFile);

			// Parse errors
			const lines = output.split('\n');
			for (const line of lines) {
				// Format: Error: Message (ts) c:\path\to\file.svelte:84:2
				const match1 = line.match(/^(Error|Warn|Hint):\s+(.+?)\s+\((.+?)\)\s+(.+?):(\d+):(\d+)$/i);
				if (match1) {
					errors.push({
						file: match1[4].replace(/\\/g, '/'),
						line: parseInt(match1[5]),
						column: parseInt(match1[6]),
						severity: match1[1].toLowerCase(),
						code: match1[3],
						message: match1[2],
						source: 'svelte-check',
						timestamp: new Date().toISOString()
					});
					continue;
				}

				// Format: src/file.svelte:123:45 Error: Message (CODE)
				const match2 = line.match(/^(.+?):(\d+):(\d+)\s+(Error|Warn|Hint):\s+(.+?)(?:\s+\((.+?)\))?$/i);
				if (match2) {
					errors.push({
						file: match2[1].replace(/\\/g, '/'),
						line: parseInt(match2[2]),
						column: parseInt(match2[3]),
						severity: match2[4].toLowerCase(),
						code: match2[6] || 'svelte',
						message: match2[5],
						source: 'svelte-check',
						timestamp: new Date().toISOString()
					});
				}
			}
		}
	} catch (error) {
		// svelte-check exits with error code, this is expected
	}

	return errors;
}

/**
 * Process a single file
 */
async function processFile(filePath) {
	const relativePath = path.relative(path.join(__dirname, '..'), filePath);
	const fileHash = hashFile(filePath);

	if (!fileHash) {
		return [];
	}

	stats.totalFiles++;

	// Check cache first (unless force flag)
	if (!force) {
		const cached = await getCachedErrors(relativePath, fileHash);
		if (cached !== null) {
			stats.cachedFiles++;
			return cached;
		}
	}

	// File changed or not cached, check it
	stats.checkedFiles++;

	let errors = [];
	const ext = path.extname(filePath);

	if (ext === '.svelte') {
		errors = checkSvelteFile(filePath);
	} else if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
		errors = checkTypeScriptFile(filePath);
	}

	// Cache the results
	await cacheErrors(relativePath, fileHash, errors);

	return errors;
}

/**
 * Write errors to JSONL
 */
function writeErrorsToJSONL(allErrors, outputPath) {
	console.log(chalk.yellow('\n💾 Writing errors to JSONL...\n'));

	const dir = path.dirname(outputPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const stream = fs.createWriteStream(outputPath, { flags: 'w' });

	for (const error of allErrors) {
		stream.write(JSON.stringify(error) + '\n');
	}

	stream.end();

	console.log(chalk.green(`✅ Wrote ${allErrors.length} errors to ${outputPath}\n`));
}

/**
 * Store embeddings in Qdrant (optional)
 */
async function storeInQdrant(errors) {
	if (errors.length === 0) return;

	console.log(chalk.yellow('📊 Generating embeddings with Ollama...\n'));

	const ollamaEndpoint = getOllamaEndpoint();
	const embeddingModel = process.env.OLLAMA_EMBED_MODEL || 'embeddinggemma:latest';

	try {
		// Check if Qdrant collection exists
		const collectionName = 'errors_phase72';
		const checkRes = await fetch(`${QDRANT_URL}/collections/${collectionName}`);

		if (!checkRes.ok) {
			// Create collection
			await fetch(`${QDRANT_URL}/collections/${collectionName}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vectors: {
						size: 768, // embeddinggemma size
						distance: 'Cosine'
					}
				})
			});
			console.log(chalk.green('✅ Created Qdrant collection\n'));
		}

		// Generate embeddings for first 100 errors (batch limit)
		const batch = errors.slice(0, 100);
		const points = [];

		for (let i = 0; i < batch.length; i++) {
			const error = batch[i];
			const text = `${error.file}:${error.line} ${error.code}: ${error.message}`;

			// Get embedding from Ollama
			const embRes = await fetch(`${ollamaEndpoint}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: embeddingModel,
					prompt: text
				})
			});

			if (embRes.ok) {
				const embData = await embRes.json();
				points.push({
					id: i,
					vector: embData.embedding,
					payload: error
				});
			}
		}

		// Upload to Qdrant
		if (points.length > 0) {
			await fetch(`${QDRANT_URL}/collections/${collectionName}/points`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ points })
			});
			console.log(chalk.green(`✅ Stored ${points.length} error embeddings in Qdrant\n`));
		}
	} catch (error) {
		console.log(chalk.yellow(`⚠️  Qdrant storage skipped: ${error.message}\n`));
	}
}

/**
 * Main function
 */
async function main() {
	const startTime = Date.now();

	try {
		// Initialize Redis
		await initRedis();

		// Find all source files
		const files = findSourceFiles();

		// Process files with progress bar
		console.log(chalk.yellow('🔄 Checking files...\n'));

		const progressBar = new cliProgress.SingleBar({
			format: chalk.cyan('{bar}') + ' | {value}/{total} files | Cached: {cached} | Errors: {errors}',
		}, cliProgress.Presets.shades_classic);

		progressBar.start(files.length, 0, { cached: 0, errors: 0 });

		const allErrors = [];

		for (let i = 0; i < files.length; i++) {
			const errors = await processFile(files[i]);
			allErrors.push(...errors);

			progressBar.update(i + 1, {
				cached: stats.cachedFiles,
				errors: allErrors.length
			});
		}

		progressBar.stop();

		stats.totalErrors = allErrors.length;

		// Write to JSONL
		const outputPath = path.join(__dirname, '..', outputFile);
		writeErrorsToJSONL(allErrors, outputPath);

		// Store in Qdrant (optional)
		if (!args.includes('--no-qdrant')) {
			await storeInQdrant(allErrors);
		}

		// Print stats
		const duration = ((Date.now() - startTime) / 1000).toFixed(2);

		console.log(chalk.cyan.bold('📊 Statistics:\n'));
		console.log(chalk.gray(`   Total files: ${stats.totalFiles}`));
		console.log(chalk.gray(`   Cached files: ${stats.cachedFiles} (${((stats.cachedFiles/stats.totalFiles)*100).toFixed(1)}%)`));
		console.log(chalk.gray(`   Checked files: ${stats.checkedFiles}`));
		console.log(chalk.gray(`   Total errors: ${stats.totalErrors}`));
		console.log(chalk.gray(`   Cache hits: ${stats.cacheHits}`));
		console.log(chalk.gray(`   Cache misses: ${stats.cacheMisses}`));
		console.log(chalk.gray(`   Duration: ${duration}s\n`));

		console.log(chalk.green.bold('✅ Error collection complete!\n'));
		console.log(chalk.cyan(`📄 Output: ${outputPath}\n`));

		// Cleanup
		await redisClient.quit();

	} catch (error) {
		console.error(chalk.red('❌ Error:'), error);
		if (redisClient) {
			await redisClient.quit();
		}
		process.exit(1);
	}
}

main();

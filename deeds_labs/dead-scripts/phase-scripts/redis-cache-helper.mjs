#!/usr/bin/env node
/**
 * Redis KAG Cache Helper
 *
 * Utilities for managing fix patterns in Redis cache:
 * - Store fix patterns by error signature
 * - Query patterns by signature or similarity
 * - Generate statistics and reports
 * - Ripgrep integration for pattern matching
 */

import { execSync } from 'child_process';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.phase72') });

// Configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const KAG_PREFIX = process.env.KAG_PREFIX || 'phase72:kag';

// Initialize Redis
const redis = new Redis({
	host: REDIS_HOST,
	port: REDIS_PORT,
	retryStrategy: (times) => (times > 3 ? null : Math.min(times * 50, 200)),
});

// =============================================
// Store Fix Pattern
// =============================================
export async function storeFixPattern(signature, fixData) {
	const fixKey = `${KAG_PREFIX}:sig:${signature}`;
	const statsKey = `${KAG_PREFIX}:stats`;
	const timestampKey = `${KAG_PREFIX}:timestamp:${signature}`;

	// Store fix pattern with metadata
	const pattern = {
		signature,
		...fixData,
		storedAt: new Date().toISOString(),
	};

	// Atomic pipeline
	const pipeline = redis.pipeline();
	pipeline.set(fixKey, JSON.stringify([pattern]), 'EX', 86400); // 24 hour TTL
	pipeline.set(timestampKey, Date.now(), 'EX', 86400);
	pipeline.hincrby(statsKey, 'totalFixesStored', 1);
	pipeline.hincrby(statsKey, 'totalSignatures', 1);
	pipeline.hincrby(statsKey, `fixes_${fixData.code || 'unknown'}`, 1);

	await pipeline.exec();

	console.log(`✅ Stored fix pattern: ${signature} (${fixData.code})`);
	return pattern;
}

// =============================================
// Get Fix Pattern by Signature
// =============================================
export async function getFixPattern(signature) {
	const fixKey = `${KAG_PREFIX}:sig:${signature}`;
	const cached = await redis.get(fixKey);

	if (cached) {
		return JSON.parse(cached);
	}

	return null;
}

// =============================================
// Search Patterns with Ripgrep
// =============================================
export function ripgrepSearchPatterns(query, options = {}) {
	const {
		directory = path.join(__dirname, '..', 'src'),
		filePattern = '*.{ts,tsx,svelte}',
		caseSensitive = false,
		contextLines = 2,
	} = options;

	try {
		const args = [
			'-n', // Line numbers
			'-H', // Show filename
			contextLines > 0 ? `-C ${contextLines}` : '', // Context
			caseSensitive ? '' : '-i', // Case insensitive
			'--type-add', `web:${filePattern}`,
			'-t', 'web',
			`"${query}"`,
			directory,
		].filter(Boolean).join(' ');

		const command = `rg ${args}`;
		const output = execSync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

		// Parse ripgrep output
		const matches = [];
		const lines = output.split('\n');
		let currentFile = null;
		let currentMatch = null;

		for (const line of lines) {
			if (!line.trim()) continue;

			// New match: filename:linenum:content
			const matchLine = line.match(/^([^:]+):(\d+):(.+)$/);
			if (matchLine) {
				if (currentMatch) {
					matches.push(currentMatch);
				}

				currentFile = matchLine[1];
				currentMatch = {
					file: currentFile,
					line: parseInt(matchLine[2], 10),
					content: matchLine[3].trim(),
					context: [],
				};
			}
			// Context line: filename-linenum-content
			else if (currentMatch) {
				const contextLine = line.match(/^([^-]+)-(\d+)-(.+)$/);
				if (contextLine) {
					currentMatch.context.push({
						line: parseInt(contextLine[2], 10),
						content: contextLine[3].trim(),
					});
				}
			}
		}

		if (currentMatch) {
			matches.push(currentMatch);
		}

		return matches;
	} catch (err) {
		// ripgrep returns exit code 1 when no matches found
		if (err.status === 1) {
			return [];
		}
		throw err;
	}
}

// =============================================
// Get Statistics
// =============================================
export async function getStatistics() {
	const statsKey = `${KAG_PREFIX}:stats`;
	const stats = await redis.hgetall(statsKey);

	// Convert string values to numbers
	const processed = {};
	for (const [key, value] of Object.entries(stats)) {
		processed[key] = parseInt(value, 10);
	}

	return processed;
}

// =============================================
// Clear All Patterns
// =============================================
export async function clearAllPatterns() {
	const keys = await redis.keys(`${KAG_PREFIX}:*`);
	if (keys.length > 0) {
		await redis.del(...keys);
		console.log(`🗑️  Cleared ${keys.length} keys from Redis KAG cache`);
	} else {
		console.log('ℹ️  No keys to clear');
	}
}

// =============================================
// CLI Interface
// =============================================
async function cli() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command) {
		console.log('Redis KAG Cache Helper\n');
		console.log('Usage:');
		console.log('  node redis-cache-helper.mjs stats');
		console.log('  node redis-cache-helper.mjs get <signature>');
		console.log('  node redis-cache-helper.mjs search "<query>" [options]');
		console.log('  node redis-cache-helper.mjs clear');
		console.log('\nExamples:');
		console.log('  node redis-cache-helper.mjs stats');
		console.log('  node redis-cache-helper.mjs search "on:click" --context=3');
		console.log('  node redis-cache-helper.mjs get a1b2c3d4e5f6g7h8');
		process.exit(0);
	}

	try {
		switch (command) {
			case 'stats': {
				const stats = await getStatistics();
				console.log('📊 Redis KAG Statistics:\n');
				console.log(JSON.stringify(stats, null, 2));
				break;
			}

			case 'get': {
				const signature = args[1];
				if (!signature) {
					console.error('❌ Missing signature argument');
					process.exit(1);
				}

				const pattern = await getFixPattern(signature);
				if (pattern) {
					console.log('✅ Found fix pattern:\n');
					console.log(JSON.stringify(pattern, null, 2));
				} else {
					console.log(`❌ No pattern found for signature: ${signature}`);
				}
				break;
			}

			case 'search': {
				const query = args[1];
				if (!query) {
					console.error('❌ Missing search query');
					process.exit(1);
				}

				// Parse options
				const contextArg = args.find(a => a.startsWith('--context='));
				const contextLines = contextArg ? parseInt(contextArg.split('=')[1], 10) : 2;

				console.log(`🔍 Searching for: "${query}"\n`);
				const matches = ripgrepSearchPatterns(query, { contextLines });

				if (matches.length === 0) {
					console.log('No matches found.');
				} else {
					console.log(`Found ${matches.length} matches:\n`);
					for (const match of matches.slice(0, 10)) {
						console.log(`📄 ${match.file}:${match.line}`);
						console.log(`   ${match.content}`);
						if (match.context.length > 0) {
							console.log(`   Context:`);
							for (const ctx of match.context) {
								console.log(`     ${ctx.line}: ${ctx.content}`);
							}
						}
						console.log();
					}

					if (matches.length > 10) {
						console.log(`... and ${matches.length - 10} more matches`);
					}
				}
				break;
			}

			case 'clear': {
				await clearAllPatterns();
				break;
			}

			default:
				console.error(`❌ Unknown command: ${command}`);
				process.exit(1);
		}
	} catch (err) {
		console.error('💥 Error:', err.message);
		process.exit(1);
	} finally {
		await redis.quit();
	}
}

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	cli();
}

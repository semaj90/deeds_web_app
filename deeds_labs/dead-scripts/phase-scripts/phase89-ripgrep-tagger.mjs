#!/usr/bin/env node
/**
 * Phase 89: Ripgrep Auto-Tagging for Qdrant
 *
 * Uses ripgrep to extract contextual metadata from source files:
 * - Svelte 5 runes ($state, $derived, $effect)
 * - Import patterns (dependencies)
 * - TypeScript types
 * - Component structure
 *
 * Tags are stored in Qdrant payloads for semantic search via FastMCP.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const SOURCE_DIR = path.join(process.cwd(), 'src');

class RipgrepTagger {
	constructor() {
		this.qdrant = new QdrantClient({ url: QDRANT_URL });
		this.tagPatterns = {
			// Svelte 5 Runes
			svelte5_state: /\$state\(/,
			svelte5_derived: /\$derived\(/,
			svelte5_effect: /\$effect\(/,
			svelte5_props: /\$props\(/,

			// Component patterns
			is_route: /\+page\.svelte$/,
			is_layout: /\+layout\.svelte$/,
			is_server: /\+server\.(ts|js)$/,

			// TypeScript patterns
			uses_typescript: /\.ts$/,
			has_types: /:\s*(string|number|boolean|any|unknown)/,

			// Import patterns
			imports_svelte: /from ['"]svelte['"]/,
			imports_sveltekit: /from ['"]@sveltejs\/kit['"]/,
			imports_lib: /from ['"]\$lib\//
		};
	}

	/**
	 * Run ripgrep search for a pattern
	 */
	async ripgrepSearch(pattern, fileGlob = '**/*.{svelte,ts,js}') {
		return new Promise((resolve, reject) => {
			const results = [];

			const rg = spawn('rg', [
				'--json',
				'--iglob', fileGlob,
				'-e', pattern,
				SOURCE_DIR
			]);

			let buffer = '';

			rg.stdout.on('data', (data) => {
				buffer += data.toString();
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim()) continue;

					try {
						const json = JSON.parse(line);
						if (json.type === 'match') {
							results.push({
								file: path.relative(process.cwd(), json.data.path.text),
								line: json.data.line_number,
								text: json.data.lines.text.trim()
							});
						}
					} catch (e) {
						// Skip malformed JSON
					}
				}
			});

			rg.on('close', (code) => {
				// ripgrep exits with 1 if no matches, 0 if matches found
				if (code === 0 || code === 1) {
					resolve(results);
				} else {
					reject(new Error(`ripgrep failed with code ${code}`));
				}
			});

			rg.on('error', reject);
		});
	}

	/**
	 * Extract tags for a specific file
	 */
	async extractFileTags(filePath) {
		const tags = [];

		try {
			const content = await fs.readFile(filePath, 'utf-8');

			// Check each pattern
			for (const [tagName, pattern] of Object.entries(this.tagPatterns)) {
				if (pattern.test(filePath) || pattern.test(content)) {
					tags.push(tagName);
				}
			}

			// Extract import dependencies
			const importMatches = content.matchAll(/from ['"]([^'"]+)['"]/g);
			const dependencies = [...importMatches].map(m => m[1]);

			// Categorize dependencies
			if (dependencies.some(d => d.includes('svelte'))) tags.push('uses_svelte');
			if (dependencies.some(d => d.includes('@sveltejs/kit'))) tags.push('uses_sveltekit');
			if (dependencies.some(d => d.startsWith('$lib'))) tags.push('uses_lib');

			// Count Svelte 5 runes
			const runeCount = (content.match(/\$(state|derived|effect|props)\(/g) || []).length;
			if (runeCount > 0) tags.push(`rune_count_${Math.min(runeCount, 10)}`);

			// Component complexity
			const lines = content.split('\n').length;
			if (lines > 200) tags.push('large_file');
			if (lines > 500) tags.push('very_large_file');

		} catch (err) {
			console.error(`⚠️ Error reading ${filePath}:`, err.message);
		}

		return tags;
	}

	/**
	 * Tag all files in Qdrant collection
	 */
	async tagCollection(collectionName) {
		console.log(`🔍 Auto-tagging collection: ${collectionName}\n`);

		// Scroll through all points
		let offset = null;
		let totalTagged = 0;

		while (true) {
			const response = await this.qdrant.scroll(collectionName, {
				limit: 100,
				offset,
				with_payload: true,
				with_vector: false  // Don't need vectors
			});

			if (response.points.length === 0) break;

			// Process each point
			for (const point of response.points) {
				const filePath = point.payload?.file_path || point.payload?.source;

				if (!filePath) continue;

				console.log(`   Tagging: ${filePath}`);

				// Extract tags
				const fullPath = path.join(process.cwd(), filePath);
				const tags = await this.extractFileTags(fullPath);

				// Update point with tags
				await this.qdrant.setPayload(collectionName, {
					points: [point.id],
					payload: {
						...point.payload,
						auto_tags: tags,
						tagged_at: new Date().toISOString()
					}
				});

				totalTagged++;
			}

			offset = response.next_page_offset;
			if (!offset) break;
		}

		console.log(`\n✅ Tagged ${totalTagged} points in ${collectionName}`);
	}

	/**
	 * Run tagging on all Phase 89 collections
	 */
	async tagAllCollections() {
		const collections = [
			'phase89_error_chunks',
			'phase89_ast_embeddings',
			'phase89_code_chunks',
			'phase89_code_units'
		];

		for (const collection of collections) {
			try {
				// Check if collection exists
				const info = await this.qdrant.getCollection(collection);

				if (info.points_count > 0) {
					await this.tagCollection(collection);
				} else {
					console.log(`⏭️  Skipping ${collection} (empty)`);
				}
			} catch (err) {
				console.log(`⏭️  Skipping ${collection} (not found)`);
			}
		}
	}

	/**
	 * Generate tag statistics
	 */
	async generateTagStats(collectionName) {
		console.log(`\n📊 Tag Statistics for ${collectionName}:`);

		const tagCounts = {};
		let offset = null;

		while (true) {
			const response = await this.qdrant.scroll(collectionName, {
				limit: 100,
				offset,
				with_payload: true,
				with_vector: false
			});

			if (response.points.length === 0) break;

			for (const point of response.points) {
				const tags = point.payload?.auto_tags || [];
				tags.forEach(tag => {
					tagCounts[tag] = (tagCounts[tag] || 0) + 1;
				});
			}

			offset = response.next_page_offset;
			if (!offset) break;
		}

		// Sort by frequency
		const sorted = Object.entries(tagCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 20);

		console.log('\nTop 20 Tags:');
		sorted.forEach(([tag, count]) => {
			console.log(`   ${tag.padEnd(30)} ${count}`);
		});
	}
}

// Run
(async () => {
	const args = process.argv.slice(2);
	const tagger = new RipgrepTagger();

	try {
		if (args.includes('--stats')) {
			// Just show stats
			const collection = args[args.indexOf('--stats') + 1] || 'phase89_code_chunks';
			await tagger.generateTagStats(collection);
		} else {
			// Run full tagging
			console.log('🚀 Starting Ripgrep Auto-Tagging Pipeline...\n');
			await tagger.tagAllCollections();
			console.log('\n🏁 Auto-tagging complete!');
		}

		process.exit(0);
	} catch (err) {
		console.error('❌ Error:', err);
		process.exit(1);
	}
})();

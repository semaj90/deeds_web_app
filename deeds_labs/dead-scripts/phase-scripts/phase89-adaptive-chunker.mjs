#!/usr/bin/env node
/**
 * Phase 89: Adaptive Chunking Engine
 *
 * Features:
 * - Adaptive chunk sizes based on content complexity
 * - Preserves existing embeddings (no wasteful re-embedding)
 * - Learns from error-fixing patterns
 * - Updates knowledge base with successful solutions
 * - Supports gemma3-legal:latest for contextual engineering
 */

import { createHash } from 'crypto';
import fs from 'fs/promises';

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434',
		embeddingModel: 'embeddinggemma:latest',
		contextModel: 'gemma3-legal:latest',
		maxContextLength: 8192
	},
	chunking: {
		minSize: 100,          // Minimum chunk size
		maxSize: 2000,         // Maximum chunk size
		targetSize: 800,       // Target chunk size
		overlap: 100,          // Overlap between chunks
		adaptiveThreshold: 0.7 // Similarity threshold for adaptive sizing
	},
	qdrant: {
		url: process.env.QDRANT_URL || 'http://localhost:6333',
		collection: 'phase89_error_chunks',
		learningCollection: 'phase89_learning_patterns'
	},
	postgres: {
		host: process.env.PGHOST || '127.0.0.1',
		port: parseInt(process.env.PGPORT || '5434'),
		database: process.env.PGDATABASE || 'legal_ai_db',
		user: process.env.PGUSER || 'legal_admin',
		password: process.env.PGPASSWORD || '123456'
	}
};

// ============================================================
// Adaptive Chunking Strategy
// ============================================================
class AdaptiveChunker {
	constructor() {
		this.chunkCache = new Map(); // Hash -> existing embedding
		this.learningPatterns = new Map(); // Error pattern -> solutions
	}

	/**
	 * Analyze content complexity to determine optimal chunk size
	 */
	analyzeComplexity(content) {
		const metrics = {
			lines: content.split('\n').length,
			avgLineLength: content.length / Math.max(1, content.split('\n').length),
			codeBlocks: (content.match(/```/g) || []).length / 2,
			comments: (content.match(/\/\//g) || []).length,
			imports: (content.match(/^import /gm) || []).length,
			functions: (content.match(/function |const \w+ = |async /g) || []).length,
			braceDepth: this.calculateBraceDepth(content)
		};

		// Complexity score (0-1)
		const complexity = Math.min(1, (
			(metrics.braceDepth / 10) * 0.3 +
			(metrics.functions / 20) * 0.2 +
			(metrics.codeBlocks / 5) * 0.2 +
			(metrics.avgLineLength / 100) * 0.15 +
			(metrics.lines / 200) * 0.15
		));

		return {
			score: complexity,
			metrics,
			// Higher complexity = larger chunks to preserve context
			recommendedSize: Math.round(
				CONFIG.chunking.minSize +
				(CONFIG.chunking.maxSize - CONFIG.chunking.minSize) * complexity
			)
		};
	}

	calculateBraceDepth(content) {
		let maxDepth = 0;
		let currentDepth = 0;

		for (const char of content) {
			if (char === '{') {
				currentDepth++;
				maxDepth = Math.max(maxDepth, currentDepth);
			} else if (char === '}') {
				currentDepth--;
			}
		}

		return maxDepth;
	}

	/**
	 * Create adaptive chunks with semantic boundaries
	 */
	async createAdaptiveChunks(filePath, content) {
		const complexity = this.analyzeComplexity(content);
		const chunkSize = complexity.recommendedSize;
		const chunks = [];

		console.log(`   📊 Complexity: ${(complexity.score * 100).toFixed(0)}% → chunk size: ${chunkSize}`);

		// Split by semantic boundaries (functions, classes, blocks)
		const semanticBoundaries = this.findSemanticBoundaries(content);

		let currentChunk = '';
		let currentStart = 0;
		let chunkIndex = 0;

		for (let i = 0; i < semanticBoundaries.length; i++) {
			const boundary = semanticBoundaries[i];
			const segment = content.slice(currentStart, boundary.end);

			// If adding this segment exceeds chunk size, finalize current chunk
			if (currentChunk.length + segment.length > chunkSize && currentChunk.length > CONFIG.chunking.minSize) {
				const hash = this.hashContent(currentChunk);

				chunks.push({
					index: chunkIndex++,
					content: currentChunk,
					hash,
					startLine: this.getLineNumber(content, currentStart),
					endLine: this.getLineNumber(content, currentStart + currentChunk.length),
					filePath,
					metadata: {
						complexity: complexity.score,
						type: boundary.type,
						functions: this.extractFunctions(currentChunk),
						imports: this.extractImports(currentChunk)
					}
				});

				// Start new chunk with overlap
				const overlapStart = Math.max(0, currentChunk.length - CONFIG.chunking.overlap);
				currentChunk = currentChunk.slice(overlapStart) + segment;
				currentStart = boundary.end - (currentChunk.length - segment.length);
			} else {
				currentChunk += segment;
			}
		}

		// Add final chunk
		if (currentChunk.trim().length > CONFIG.chunking.minSize) {
			const hash = this.hashContent(currentChunk);
			chunks.push({
				index: chunkIndex,
				content: currentChunk,
				hash,
				startLine: this.getLineNumber(content, currentStart),
				endLine: this.getLineNumber(content, currentStart + currentChunk.length),
				filePath,
				metadata: {
					complexity: complexity.score,
					type: 'final',
					functions: this.extractFunctions(currentChunk),
					imports: this.extractImports(currentChunk)
				}
			});
		}

		return chunks;
	}

	findSemanticBoundaries(content) {
		const boundaries = [];
		const lines = content.split('\n');
		let position = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			// Function boundaries
			if (trimmed.match(/^(export\s+)?(async\s+)?function\s+\w+|^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/)) {
				boundaries.push({ type: 'function', line: i, start: position, end: position + line.length });
			}
			// Class boundaries
			else if (trimmed.match(/^(export\s+)?class\s+\w+/)) {
				boundaries.push({ type: 'class', line: i, start: position, end: position + line.length });
			}
			// Block ends (good split points)
			else if (trimmed === '}' || trimmed.startsWith('} ')) {
				boundaries.push({ type: 'block_end', line: i, start: position, end: position + line.length });
			}
			// Import blocks
			else if (trimmed.startsWith('import ')) {
				boundaries.push({ type: 'import', line: i, start: position, end: position + line.length });
			}

			position += line.length + 1; // +1 for newline
		}

		// If no boundaries found, split by lines
		if (boundaries.length === 0) {
			position = 0;
			for (let i = 0; i < lines.length; i += 50) {
				boundaries.push({
					type: 'line_group',
					line: i,
					start: position,
					end: position + lines.slice(i, i + 50).join('\n').length
				});
				position = boundaries[boundaries.length - 1].end + 1;
			}
		}

		return boundaries;
	}

	extractFunctions(content) {
		const functions = [];
		const matches = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/g);

		for (const match of matches) {
			functions.push(match[1] || match[2]);
		}

		return functions;
	}

	extractImports(content) {
		const imports = [];
		const matches = content.matchAll(/import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g);

		for (const match of matches) {
			imports.push(match[1]);
		}

		return imports;
	}

	hashContent(content) {
		return createHash('sha256').update(content.trim()).digest('hex');
	}

	getLineNumber(content, position) {
		return content.slice(0, position).split('\n').length;
	}
}

// ============================================================
// Learning Pattern Extractor
// ============================================================
class LearningPatternExtractor {
	constructor() {
		this.patterns = [];
	}

	/**
	 * Extract error-fixing patterns from successful resolutions
	 */
	async extractPattern(errorData) {
		const {
			errorCode,        // e.g., "TS1005"
			errorMessage,     // Full error message
			filePath,
			lineNumber,
			originalCode,     // Code before fix
			fixedCode,        // Code after fix
			context,          // Surrounding code
			success          // Whether fix worked
		} = errorData;

		if (!success) return null;

		// Analyze what changed
		const diff = this.computeDiff(originalCode, fixedCode);

		const pattern = {
			errorSignature: `${errorCode}:${this.normalizeError(errorMessage)}`,
			errorCode,
			category: this.categorizeError(errorCode, errorMessage),
			fix: {
				type: diff.type,           // 'add', 'remove', 'replace'
				pattern: diff.pattern,     // Regex or template
				example: {
					before: originalCode,
					after: fixedCode,
					explanation: this.generateExplanation(diff, errorCode)
				}
			},
			context: {
				filePattern: this.extractFilePattern(filePath),
				surrounding: this.extractContextPattern(context),
				imports: this.extractRequiredImports(fixedCode, originalCode)
			},
			metadata: {
				timestamp: new Date().toISOString(),
				confidence: 1.0,
				applications: 1
			}
		};

		this.patterns.push(pattern);
		return pattern;
	}

	computeDiff(original, fixed) {
		const originalLines = original.split('\n');
		const fixedLines = fixed.split('\n');

		// Simple diff algorithm
		if (fixedLines.length > originalLines.length) {
			return {
				type: 'add',
				pattern: fixedLines.filter(l => !originalLines.includes(l)).join('\n')
			};
		} else if (fixedLines.length < originalLines.length) {
			return {
				type: 'remove',
				pattern: originalLines.filter(l => !fixedLines.includes(l)).join('\n')
			};
		} else {
			const changes = [];
			for (let i = 0; i < originalLines.length; i++) {
				if (originalLines[i] !== fixedLines[i]) {
					changes.push({ line: i, from: originalLines[i], to: fixedLines[i] });
				}
			}
			return {
				type: 'replace',
				pattern: changes
			};
		}
	}

	normalizeError(message) {
		// Remove file-specific details to create reusable pattern
		return message
			.replace(/'.+?'/g, 'IDENTIFIER')
			.replace(/line \d+/g, 'LINE')
			.replace(/\d+/g, 'NUM');
	}

	categorizeError(code, message) {
		const categories = {
			TS1005: message.includes(';') ? 'missing_semicolon' : 'missing_structural',
			TS2304: 'missing_import',
			TS2339: 'property_access',
			TS2345: 'type_mismatch',
			TS2554: 'argument_count',
			TS7006: 'implicit_any'
		};

		return categories[code] || 'unknown';
	}

	generateExplanation(diff, errorCode) {
		const explanations = {
			TS1005: diff.type === 'add' && diff.pattern.includes('}')
				? 'Added missing closing brace to complete block structure'
				: 'Fixed syntax error by correcting punctuation',
			TS2304: 'Added missing import statement',
			TS2339: 'Fixed property access by adding type assertion or updating interface',
			TS2345: 'Corrected type by adding type cast or updating parameter type',
			default: `Applied ${diff.type} operation to resolve error`
		};

		return explanations[errorCode] || explanations.default;
	}

	extractFilePattern(filePath) {
		const parts = filePath.split(/[\/\\]/);
		return parts.slice(-3).join('/'); // Last 3 segments for pattern matching
	}

	extractContextPattern(context) {
		// Extract high-level patterns (imports, class structure, etc.)
		return {
			hasImports: context.includes('import '),
			hasExports: context.includes('export '),
			isClass: context.includes('class '),
			isFunction: context.includes('function ') || context.includes('const ') && context.includes('=>')
		};
	}

	extractRequiredImports(fixedCode, originalCode) {
		const fixedImports = new Set(
			[...fixedCode.matchAll(/import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g)]
				.map(m => m[0])
		);
		const originalImports = new Set(
			[...originalCode.matchAll(/import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g)]
				.map(m => m[0])
		);

		return [...fixedImports].filter(imp => !originalImports.has(imp));
	}

	/**
	 * Find similar patterns for a given error
	 */
	findSimilarPatterns(errorCode, errorMessage, context) {
		const normalized = this.normalizeError(errorMessage);
		const signature = `${errorCode}:${normalized}`;

		return this.patterns
			.filter(p => p.errorSignature === signature)
			.sort((a, b) => b.metadata.confidence - a.metadata.confidence);
	}
}

// ============================================================
// Knowledge Base Updater
// ============================================================
class KnowledgeBaseUpdater {
	constructor() {
		this.updates = [];
	}

	/**
	 * Create KB document from learning patterns
	 */
	async createKBDocument(patterns, errorCode) {
		const grouped = this.groupPatternsByCategory(patterns);

		const document = {
			title: `Error Resolution Patterns: ${errorCode}`,
			errorCode,
			generated: new Date().toISOString(),
			totalPatterns: patterns.length,
			categories: Object.keys(grouped),
			content: this.generateMarkdown(grouped, errorCode),
			metadata: {
				source: 'phase89_learning',
				type: 'error_resolution_pattern',
				confidence: this.calculateAverageConfidence(patterns),
				tags: ['error-fixing', `TS${errorCode}`, 'learning', 'phase89']
			}
		};

		return document;
	}

	groupPatternsByCategory(patterns) {
		const groups = {};

		for (const pattern of patterns) {
			const cat = pattern.category;
			if (!groups[cat]) groups[cat] = [];
			groups[cat].push(pattern);
		}

		return groups;
	}

	generateMarkdown(grouped, errorCode) {
		let md = `# Error Resolution Patterns: ${errorCode}\n\n`;
		md += `> Auto-generated from successful error fixes\n`;
		md += `> Confidence: Based on ${Object.values(grouped).flat().length} successful applications\n\n`;

		for (const [category, patterns] of Object.entries(grouped)) {
			md += `## ${category.replace(/_/g, ' ').toUpperCase()}\n\n`;

			for (const pattern of patterns.slice(0, 3)) { // Top 3 per category
				md += `### Pattern ${pattern.metadata.applications}x Applied\n\n`;
				md += `**Problem:**\n\`\`\`typescript\n${pattern.fix.example.before}\n\`\`\`\n\n`;
				md += `**Solution:**\n\`\`\`typescript\n${pattern.fix.example.after}\n\`\`\`\n\n`;
				md += `**Explanation:** ${pattern.fix.example.explanation}\n\n`;

				if (pattern.context.imports.length > 0) {
					md += `**Required Imports:**\n\`\`\`typescript\n${pattern.context.imports.join('\n')}\n\`\`\`\n\n`;
				}

				md += `---\n\n`;
			}
		}

		md += `\n## Usage with Gemma3-Legal\n\n`;
		md += `These patterns are optimized for contextual engineering with \`gemma3-legal:latest\`.\n\n`;
		md += `**Recommended Prompt:**\n`;
		md += `\`\`\`\n`;
		md += `Fix the ${errorCode} error in the following code using the pattern that best matches the context:\n`;
		md += `[paste code here]\n`;
		md += `\`\`\`\n`;

		return md;
	}

	calculateAverageConfidence(patterns) {
		if (patterns.length === 0) return 0;
		return patterns.reduce((sum, p) => sum + p.metadata.confidence, 0) / patterns.length;
	}

	/**
	 * Update Qdrant knowledge base with new patterns
	 */
	async updateQdrantKB(document, embedding) {
		const response = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.learningCollection}/points`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				points: [{
					id: createHash('sha256').update(document.title).digest('hex').slice(0, 32),
					vector: embedding,
					payload: {
						title: document.title,
						content: document.content,
						errorCode: document.errorCode,
						confidence: document.metadata.confidence,
						tags: document.metadata.tags,
						timestamp: document.generated
					}
				}]
			})
		});

		return response.ok;
	}
}

// ============================================================
// Main Execution
// ============================================================
async function main() {
	console.log('\n🧠 Phase 89: Adaptive Chunking + Learning System\n');

	const chunker = new AdaptiveChunker();
	const learner = new LearningPatternExtractor();
	const kbUpdater = new KnowledgeBaseUpdater();

	// Example: Process a file with adaptive chunking
	const testFile = 'src/routes/+page.svelte';

	try {
		const content = await fs.readFile(testFile, 'utf-8');
		console.log(`📁 Processing: ${testFile}`);

		const chunks = await chunker.createAdaptiveChunks(testFile, content);
		console.log(`✅ Created ${chunks.length} adaptive chunks\n`);

		// Example: Extract learning pattern from error fix
		const exampleErrorFix = {
			errorCode: 'TS1005',
			errorMessage: "';' expected",
			filePath: testFile,
			lineNumber: 42,
			originalCode: 'const items = data.items',
			fixedCode: 'const items = data.items;',
			context: content,
			success: true
		};

		const pattern = await learner.extractPattern(exampleErrorFix);
		console.log('📚 Learned Pattern:', pattern?.errorSignature);

		// Generate KB document
		if (pattern) {
			const kbDoc = await kbUpdater.createKBDocument([pattern], 'TS1005');
			console.log('\n📖 Generated KB Document:');
			console.log(kbDoc.content.slice(0, 500) + '...\n');

			// Save to file
			const kbPath = `kb/phase89/learned-patterns-${pattern.errorCode}.md`;
			await fs.mkdir('kb/phase89', { recursive: true });
			await fs.writeFile(kbPath, kbDoc.content);
			console.log(`✅ Saved: ${kbPath}`);
		}

	} catch (error) {
		console.error('❌ Error:', error.message);
	}
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}

export { AdaptiveChunker, CONFIG, KnowledgeBaseUpdater, LearningPatternExtractor };


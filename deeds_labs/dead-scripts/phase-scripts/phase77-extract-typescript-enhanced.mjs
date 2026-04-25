#!/usr/bin/env node
/**
 * Phase 77: Enhanced TypeScript Pattern Extractor
 *
 * Fail-open approach: generates micro-examples from ANY matching pattern:
 * - API routes (+server.ts)
 * - DB/Drizzle/pgvector/SQL
 * - Queue/Redis/RabbitMQ
 * - RAG/Qdrant/embeddings
 * - Tooling/scripts
 *
 * Output: 3-10 micro-examples per qualifying file
 */

import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const OUTPUT_FILE = path.join(rootDir, 'training-data', 'typescript-enhanced.jsonl');
const MAX_EXAMPLES_PER_FILE = 5;
const MAX_TOTAL_EXAMPLES = 200;

// Pattern matchers for different code categories
const PATTERNS = {
	apiRoutes: {
		fileMatch: /\+server\.ts$/,
		contentMatch: /export\s+(const|async\s+function)\s+(GET|POST|PUT|DELETE|PATCH)/,
		keywords: ['RequestHandler', 'RequestEvent', 'json()', 'error()', 'redirect()'],
	},
	database: {
		fileMatch: /\/(db|database|drizzle)\//,
		contentMatch: /(drizzle|pgvector|vector|embedding|sql`)/,
		keywords: ['select(', 'insert(', 'update(', 'delete(', 'where(', '.eq(', '.execute()'],
	},
	queue: {
		fileMatch: /\/(queue|job|worker)\//,
		contentMatch: /(amqplib|rabbit|bullmq|redis|ioredis)/,
		keywords: ['consume', 'publish', 'queue.add', 'process(', 'worker.on'],
	},
	rag: {
		fileMatch: /\/(rag|vector|embedding|knowledge)\//,
		contentMatch: /(qdrant|vectorSearch|retrieve|embedding|cosine|dot|rerank)/,
		keywords: ['vectorSearch', 'retrieve', 'embedding', 'similarity', 'topK'],
	},
	scripts: {
		fileMatch: /scripts\/.*\.(mjs|ts)$/,
		contentMatch: /(ts-morph|esbuild|vite|glob|commander)/,
		keywords: ['glob(', 'process.argv', 'await fs.', 'console.log'],
	},
};

/**
 * Check if file/content matches pattern
 */
function matchesPattern(filePath, content, pattern) {
	const fileMatches = pattern.fileMatch.test(filePath);
	const contentMatches = pattern.contentMatch.test(content);
	const hasKeywords = pattern.keywords.some(kw => content.includes(kw));

	return fileMatches || (contentMatches && hasKeywords);
}

/**
 * Extract function signatures from TypeScript
 */
function extractFunctions(content) {
	const functions = [];

	// Match: export async function name(...) : Type {
	const asyncRegex = /export\s+async\s+function\s+(\w+)\s*\([^)]*\)\s*:?\s*[^{]*{/g;
	let match;
	while ((match = asyncRegex.exec(content)) !== null) {
		functions.push({
			type: 'async',
			name: match[1],
			signature: match[0].replace(/\s*{$/, ''),
		});
	}

	// Match: export const name: Type = (...) => ...
	const arrowRegex = /export\s+const\s+(\w+)\s*:\s*[^=]+=\s*\([^)]*\)\s*=>/g;
	while ((match = arrowRegex.exec(content)) !== null) {
		functions.push({
			type: 'arrow',
			name: match[1],
			signature: match[0],
		});
	}

	return functions;
}

/**
 * Extract type definitions
 */
function extractTypes(content) {
	const types = [];

	// Match: export type Name = ...
	const typeRegex = /export\s+type\s+(\w+)\s*=\s*([^;]+);/g;
	let match;
	while ((match = typeRegex.exec(content)) !== null) {
		types.push({
			name: match[1],
			definition: match[2].trim(),
		});
	}

	// Match: export interface Name { ... }
	const interfaceRegex = /export\s+interface\s+(\w+)\s*{([^}]+)}/g;
	while ((match = interfaceRegex.exec(content)) !== null) {
		types.push({
			name: match[1],
			definition: `{ ${match[2].trim()} }`,
		});
	}

	return types;
}

/**
 * Generate micro-examples from a file
 */
function generateMicroExamples(filePath, content, category) {
	const examples = [];
	const functions = extractFunctions(content);
	const types = extractTypes(content);

	// Example 1: Explain function signature
	if (functions.length > 0) {
		const func = functions[0];
		examples.push({
			messages: [
				{
					role: 'system',
					content: `You are an expert TypeScript developer specializing in ${category}.`,
				},
				{
					role: 'user',
					content: `Explain this function signature:\n\n${func.signature}`,
				},
				{
					role: 'assistant',
					content: `This is a${func.type === 'async' ? 'n async' : ''} ${category} function called \`${func.name}\`.\n\nIt ${func.type === 'async' ? 'performs asynchronous operations and returns a Promise' : 'is defined as an arrow function'}.\n\nUsage:\n\`\`\`typescript\n${func.signature}\n  // Implementation\n}\n\`\`\``,
				},
			],
			metadata: {
				category: 'typescript-micro',
				subcategory: category,
				tags: ['typescript', category, 'function-signature'],
				source: filePath,
			},
		});
	}

	// Example 2: Write unit test
	if (functions.length > 0) {
		const func = functions[0];
		examples.push({
			messages: [
				{
					role: 'system',
					content: 'You are an expert in TypeScript testing with Vitest.',
				},
				{
					role: 'user',
					content: `Write a unit test for this function:\n\n${func.signature}`,
				},
				{
					role: 'assistant',
					content: `Here's a unit test using Vitest:\n\n\`\`\`typescript\nimport { describe, it, expect, vi } from 'vitest';\nimport { ${func.name} } from './${path.basename(filePath, '.ts')}';\n\ndescribe('${func.name}', () => {\n  it('should ${func.name.replace(/([A-Z])/g, ' $1').toLowerCase()}', async () => {\n    // Arrange\n    const input = {};\n    \n    // Act\n    const result = await ${func.name}(input);\n    \n    // Assert\n    expect(result).toBeDefined();\n  });\n});\n\`\`\``,
				},
			],
			metadata: {
				category: 'typescript-testing',
				subcategory: category,
				tags: ['typescript', 'vitest', 'unit-test', category],
				source: filePath,
			},
		});
	}

	// Example 3: Add error handling
	if (functions.length > 0 && functions[0].type === 'async') {
		const func = functions[0];
		examples.push({
			messages: [
				{
					role: 'system',
					content: 'You are an expert in error handling and resilience patterns.',
				},
				{
					role: 'user',
					content: `Add error handling to this async function:\n\n${func.signature}`,
				},
				{
					role: 'assistant',
					content: `Here's the function with proper error handling:\n\n\`\`\`typescript\n${func.signature}\n  try {\n    // Existing logic\n    \n    return result;\n  } catch (error) {\n    console.error(\`Error in ${func.name}:\`, error);\n    throw new Error(\`Failed to ${func.name.replace(/([A-Z])/g, ' $1').toLowerCase()}: \${error.message}\`);\n  }\n}\n\`\`\``,
				},
			],
			metadata: {
				category: 'typescript-patterns',
				subcategory: 'error-handling',
				tags: ['typescript', 'error-handling', category],
				source: filePath,
			},
		});
	}

	// Example 4: Type definition explanation
	if (types.length > 0) {
		const type = types[0];
		examples.push({
			messages: [
				{
					role: 'system',
					content: 'You are an expert in TypeScript type systems.',
				},
				{
					role: 'user',
					content: `Explain this type definition:\n\nexport type ${type.name} = ${type.definition};`,
				},
				{
					role: 'assistant',
					content: `The \`${type.name}\` type defines the shape for ${category} operations.\n\nDefinition:\n\`\`\`typescript\nexport type ${type.name} = ${type.definition};\n\`\`\`\n\nThis type ensures type safety when working with ${category} data.`,
				},
			],
			metadata: {
				category: 'typescript-types',
				subcategory: category,
				tags: ['typescript', 'types', category],
				source: filePath,
			},
		});
	}

	return examples.slice(0, MAX_EXAMPLES_PER_FILE);
}

/**
 * Main extraction
 */
async function main() {
	console.log('🔍 Scanning TypeScript files for patterns...\n');

	const allExamples = [];
	const stats = {
		filesScanned: 0,
		filesMatched: 0,
		examplesGenerated: 0,
		byCategory: {},
	};

	// Scan all TypeScript files
	const tsFiles = await glob('src/**/*.{ts,mjs}', {
		cwd: rootDir,
		ignore: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts', '**/node_modules/**'],
	});

	for (const file of tsFiles) {
		stats.filesScanned++;
		const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

		// Check against all patterns
		for (const [category, pattern] of Object.entries(PATTERNS)) {
			if (matchesPattern(file, content, pattern)) {
				stats.filesMatched++;
				stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

				// Generate micro-examples
				const examples = generateMicroExamples(file, content, category);
				allExamples.push(...examples);
				stats.examplesGenerated += examples.length;

				console.log(`   ✅ ${category.padEnd(15)} ${file}`);

				// Cap total examples
				if (allExamples.length >= MAX_TOTAL_EXAMPLES) break;
			}
		}

		if (allExamples.length >= MAX_TOTAL_EXAMPLES) break;
	}

	// Write output
	await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
	await fs.writeFile(
		OUTPUT_FILE,
		allExamples.map(ex => JSON.stringify(ex)).join('\n')
	);

	// Report
	console.log('\n' + '═'.repeat(60));
	console.log('📊 TypeScript Pattern Extraction Complete');
	console.log('═'.repeat(60));
	console.log(`Files scanned:     ${stats.filesScanned}`);
	console.log(`Files matched:     ${stats.filesMatched}`);
	console.log(`Examples generated: ${stats.examplesGenerated}`);
	console.log('\nBy category:');
	Object.entries(stats.byCategory).forEach(([cat, count]) => {
		console.log(`   ${cat.padEnd(15)} ${count}`);
	});
	console.log(`\n📄 Output: ${OUTPUT_FILE}`);
	console.log(`📦 Size: ${(allExamples.length * 500 / 1024).toFixed(1)} KB (estimated)\n`);
}

main().catch(console.error);

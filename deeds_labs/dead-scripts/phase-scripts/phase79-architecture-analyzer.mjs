#!/usr/bin/env node

/**
 * Phase 79: Architecture-Focused Error Analyzer
 *
 * Categorizes 4,391 remaining errors by architectural components:
 * - Routes & Layouts (SvelteKit pages)
 * - API Endpoints (+server.ts)
 * - gRPC Services (proto files & implementations)
 * - Protocol Buffers (.proto definitions)
 * - FlatBuffers (.fbs schemas)
 * - QUIC Protocol implementations
 * - Database Layer (Drizzle ORM)
 * - Authentication (Lucia)
 *
 * Usage:
 *   node scripts/phase79-architecture-analyzer.mjs
 */

import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const REPORTS_DIR = join(ROOT, 'reports', 'phase79-analysis');

mkdirSync(REPORTS_DIR, { recursive: true });

// Architecture-specific categorization
const ARCHITECTURE_CATEGORIES = {
	// ========================================================================
	// PRESENTATION LAYER
	// ========================================================================
	'routes-pages': {
		patterns: [/\+page\.svelte$/],
		weight: 10,
		description: 'SvelteKit Page Components',
		fixPriority: 'P0',
		examples: ['src/routes/+page.svelte', 'src/routes/cases/+page.svelte']
	},
	'routes-layouts': {
		patterns: [/\+layout\.svelte$/],
		weight: 9,
		description: 'SvelteKit Layout Components',
		fixPriority: 'P0',
		examples: ['src/routes/+layout.svelte']
	},
	'routes-page-logic': {
		patterns: [/\+page\.ts$/],
		weight: 8,
		description: 'Client-Side Page Load Logic',
		fixPriority: 'P1',
		examples: ['src/routes/cases/+page.ts']
	},
	'routes-layout-logic': {
		patterns: [/\+layout\.ts$/],
		weight: 8,
		description: 'Client-Side Layout Load Logic',
		fixPriority: 'P1',
		examples: ['src/routes/+layout.ts']
	},
	'routes-server-pages': {
		patterns: [/\+page\.server\.ts$/],
		weight: 10,
		description: 'Server-Side Page Logic',
		fixPriority: 'P0',
		examples: ['src/routes/cases/[id]/+page.server.ts']
	},
	'routes-server-layouts': {
		patterns: [/\+layout\.server\.ts$/],
		weight: 9,
		description: 'Server-Side Layout Logic',
		fixPriority: 'P0',
		examples: ['src/routes/+layout.server.ts']
	},

	// ========================================================================
	// API LAYER
	// ========================================================================
	'api-rest-endpoints': {
		patterns: [/src\/routes\/api\/[^\/]+\/\+server\.ts$/],
		weight: 10,
		description: 'REST API Endpoints (Top-Level)',
		fixPriority: 'P0',
		examples: ['src/routes/api/chat/+server.ts', 'src/routes/api/knowledge/+server.ts']
	},
	'api-nested-endpoints': {
		patterns: [/src\/routes\/api\/.*\/.*\/\+server\.ts$/],
		weight: 9,
		description: 'Nested API Endpoints',
		fixPriority: 'P1',
		examples: ['src/routes/api/system/env/+server.ts']
	},
	'api-streaming': {
		patterns: [/src\/routes\/api\/(sse|stream)\/.*\+server\.ts$/],
		weight: 10,
		description: 'Server-Sent Events & Streaming APIs',
		fixPriority: 'P0',
		examples: ['src/routes/api/sse/[id]/+server.ts', 'src/routes/api/stream/[chatId]/+server.ts']
	},

	// ========================================================================
	// DATA PROTOCOLS
	// ========================================================================
	'grpc-services': {
		patterns: [/src\/lib\/grpc\/.*\.ts$/, /grpc.*service/i],
		weight: 7,
		description: 'gRPC Service Implementations',
		fixPriority: 'P2',
		examples: ['src/lib/grpc/legal-engine.service.ts']
	},
	'grpc-clients': {
		patterns: [/src\/lib\/grpc\/.*client.*\.ts$/i],
		weight: 7,
		description: 'gRPC Client Wrappers',
		fixPriority: 'P2',
		examples: ['src/lib/grpc/rag-client.ts']
	},
	'protobuf-definitions': {
		patterns: [/\.proto$/],
		weight: 6,
		description: 'Protocol Buffer Definitions',
		fixPriority: 'P2',
		examples: ['src/proto/legal.proto', 'src/proto/rag.proto']
	},
	'protobuf-generated': {
		patterns: [/src\/proto\/.*_pb\.ts$/],
		weight: 3,
		description: 'Generated Protobuf TypeScript',
		fixPriority: 'P3',
		examples: ['src/proto/legal_pb.ts']
	},
	'flatbuffers-schemas': {
		patterns: [/\.fbs$/],
		weight: 6,
		description: 'FlatBuffers Schema Definitions',
		fixPriority: 'P2',
		examples: ['src/schemas/case.fbs']
	},
	'flatbuffers-generated': {
		patterns: [/.*_generated\.ts$/],
		weight: 3,
		description: 'Generated FlatBuffers TypeScript',
		fixPriority: 'P3',
		examples: ['src/schemas/case_generated.ts']
	},

	// ========================================================================
	// NETWORK PROTOCOLS
	// ========================================================================
	'quic-protocol': {
		patterns: [/quic/i, /src\/lib\/protocols\/quic/],
		weight: 5,
		description: 'QUIC Protocol Implementation',
		fixPriority: 'P2',
		examples: ['src/lib/protocols/quic/client.ts']
	},
	'websockets': {
		patterns: [/websocket/i, /src\/lib\/realtime\//],
		weight: 6,
		description: 'WebSocket Connections',
		fixPriority: 'P2',
		examples: ['src/lib/realtime/ws-client.ts']
	},

	// ========================================================================
	// DATA LAYER
	// ========================================================================
	'database-schema': {
		patterns: [/drizzle\/schema\.ts$/, /src\/lib\/server\/db\/schema/],
		weight: 10,
		description: 'Database Schema Definitions',
		fixPriority: 'P0',
		examples: ['drizzle/schema.ts', 'src/lib/server/db/schema.ts']
	},
	'database-migrations': {
		patterns: [/drizzle\/migrations\/.*/],
		weight: 5,
		description: 'Database Migration Files',
		fixPriority: 'P2',
		examples: ['drizzle/migrations/0001_initial.sql']
	},
	'database-queries': {
		patterns: [/src\/lib\/server\/db\/queries/, /\.query\.ts$/],
		weight: 9,
		description: 'Database Query Functions',
		fixPriority: 'P1',
		examples: ['src/lib/server/db/queries/cases.query.ts']
	},
	'database-core': {
		patterns: [/src\/lib\/server\/db\/index\.ts$/],
		weight: 10,
		description: 'Database Connection & Core',
		fixPriority: 'P0',
		examples: ['src/lib/server/db/index.ts']
	},

	// ========================================================================
	// AUTHENTICATION & SECURITY
	// ========================================================================
	'auth-lucia': {
		patterns: [/lucia/i, /src\/lib\/server\/auth/],
		weight: 10,
		description: 'Lucia Authentication',
		fixPriority: 'P0',
		examples: ['src/lib/server/auth/lucia.ts']
	},
	'auth-middleware': {
		patterns: [/src\/hooks\.server\.ts$/, /src\/lib\/server\/middleware/],
		weight: 10,
		description: 'Auth Middleware & Hooks',
		fixPriority: 'P0',
		examples: ['src/hooks.server.ts']
	},

	// ========================================================================
	// BUSINESS LOGIC
	// ========================================================================
	'services-backend': {
		patterns: [/src\/lib\/server\/services\/.*/],
		weight: 8,
		description: 'Backend Service Layer',
		fixPriority: 'P1',
		examples: ['src/lib/server/services/legal-engine.service.ts']
	},
	'services-ai': {
		patterns: [/src\/lib\/server\/ai\//, /src\/lib\/llm\//],
		weight: 7,
		description: 'AI/LLM Service Integration',
		fixPriority: 'P2',
		examples: ['src/lib/server/ai/ollama.ts']
	},

	// ========================================================================
	// UI COMPONENTS
	// ========================================================================
	'components-legal': {
		patterns: [/src\/lib\/components\/.*legal.*\.svelte$/i],
		weight: 6,
		description: 'Legal-Specific Components',
		fixPriority: 'P2',
		examples: ['src/lib/components/ai/legal/CaseAnalyzer.svelte']
	},
	'components-ui': {
		patterns: [/src\/lib\/components\/ui\/.*\.svelte$/],
		weight: 5,
		description: 'Reusable UI Components',
		fixPriority: 'P2',
		examples: ['src/lib/components/ui/Button.svelte']
	},
	'components-forms': {
		patterns: [/src\/lib\/components\/forms\/.*\.svelte$/],
		weight: 6,
		description: 'Form Components',
		fixPriority: 'P2',
		examples: ['src/lib/components/forms/CaseForm.svelte']
	},

	// ========================================================================
	// STATE MANAGEMENT
	// ========================================================================
	'stores-svelte': {
		patterns: [/src\/lib\/stores\/.*\.ts$/],
		weight: 7,
		description: 'Svelte Stores',
		fixPriority: 'P1',
		examples: ['src/lib/stores/case.store.ts']
	},

	// ========================================================================
	// UTILITIES & HELPERS
	// ========================================================================
	'utils-core': {
		patterns: [/src\/lib\/utils\/.*\.ts$/],
		weight: 4,
		description: 'Utility Functions',
		fixPriority: 'P3',
		examples: ['src/lib/utils/formatters.ts']
	},
	'types-definitions': {
		patterns: [/\.d\.ts$/, /src\/lib\/types\//],
		weight: 6,
		description: 'TypeScript Type Definitions',
		fixPriority: 'P2',
		examples: ['src/lib/types/case.d.ts']
	},

	// ========================================================================
	// INFRASTRUCTURE
	// ========================================================================
	'workers-web': {
		patterns: [/\.worker\.ts$/, /src\/lib\/workers\//],
		weight: 5,
		description: 'Web Workers',
		fixPriority: 'P2',
		examples: ['src/lib/workers/embedding.worker.ts']
	},
	'gpu-compute': {
		patterns: [/gpu/i, /cuda/i, /webgpu/i],
		weight: 4,
		description: 'GPU Computing (CUDA/WebGPU)',
		fixPriority: 'P3',
		examples: ['src/lib/gpu/compute.ts']
	},

	// Catch-all
	'other-files': {
		patterns: [/.*/],
		weight: 1,
		description: 'Other Files',
		fixPriority: 'P3',
		examples: []
	}
};

console.log('🏗️  Phase 79: Architecture-Focused Error Analysis\n');
console.log('📊 Analyzing 4,391 remaining errors by architectural component...\n');

// Run svelte-check
console.log('🔍 Running svelte-check...');
const output = execSync('npx svelte-check 2>&1', {
	cwd: ROOT,
	encoding: 'utf8',
	maxBuffer: 50 * 1024 * 1024
});

// Parse errors
const errorsByFile = new Map();
const lines = output.split('\n');
let currentFile = null;

for (const line of lines) {
	const fileMatch = line.match(/^([^\s]+\.(ts|svelte|js|proto|fbs)):(\d+):(\d+)$/);
	if (fileMatch) {
		currentFile = {
			path: fileMatch[1].replace(/\\/g, '/'),
			line: parseInt(fileMatch[3], 10),
			column: parseInt(fileMatch[4], 10)
		};
		continue;
	}

	if (line.trim().startsWith('Error:') && currentFile) {
		const errorMatch = line.match(/Error:\s*(.+?)\s*\(ts\((\d+)\)\)/);
		if (errorMatch) {
			if (!errorsByFile.has(currentFile.path)) {
				errorsByFile.set(currentFile.path, []);
			}
			errorsByFile.get(currentFile.path).push({
				line: currentFile.line,
				column: currentFile.column,
				message: errorMatch[1].trim(),
				code: errorMatch[2]
			});
			currentFile = null;
		}
	}
}

console.log(`✅ Parsed ${errorsByFile.size} files with errors\n`);

// Categorize by architecture
const categorized = {};
const fileDetails = [];

for (const [filePath, errors] of errorsByFile.entries()) {
	let category = 'other-files';

	// Find matching category
	for (const [catName, catConfig] of Object.entries(ARCHITECTURE_CATEGORIES)) {
		if (catName === 'other-files') continue;

		for (const pattern of catConfig.patterns) {
			if (pattern.test(filePath)) {
				category = catName;
				break;
			}
		}
		if (category !== 'other-files') break;
	}

	if (!categorized[category]) {
		categorized[category] = {
			files: [],
			totalErrors: 0
		};
	}

	categorized[category].files.push(filePath);
	categorized[category].totalErrors += errors.length;

	fileDetails.push({
		file: filePath,
		category,
		errorCount: errors.length,
		priority: ARCHITECTURE_CATEGORIES[category].fixPriority,
		weight: ARCHITECTURE_CATEGORIES[category].weight,
		impactScore: errors.length * ARCHITECTURE_CATEGORIES[category].weight,
		errors: errors.slice(0, 3) // Sample errors
	});
}

// Sort by impact
fileDetails.sort((a, b) => b.impactScore - a.impactScore);

// Generate reports
const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const jsonPath = join(REPORTS_DIR, `architecture-analysis-${timestamp}.json`);
const mdPath = join(REPORTS_DIR, `architecture-analysis-${timestamp}.md`);

const report = {
	timestamp: new Date().toISOString(),
	summary: {
		totalErrors: Array.from(errorsByFile.values()).reduce((sum, errs) => sum + errs.length, 0),
		filesAffected: errorsByFile.size,
		categoryCount: Object.keys(categorized).length
	},
	categoryBreakdown: Object.entries(categorized)
		.map(([name, data]) => ({
			category: name,
			description: ARCHITECTURE_CATEGORIES[name].description,
			priority: ARCHITECTURE_CATEGORIES[name].fixPriority,
			weight: ARCHITECTURE_CATEGORIES[name].weight,
			fileCount: data.files.length,
			errorCount: data.totalErrors,
			examples: ARCHITECTURE_CATEGORIES[name].examples
		}))
		.sort((a, b) => b.errorCount - a.errorCount),
	topFiles: fileDetails.slice(0, 100)
};

writeFileSync(jsonPath, JSON.stringify(report, null, 2));
console.log(`📄 JSON: ${relative(ROOT, jsonPath)}`);

// Markdown report
let md = `# Phase 79: Architecture-Focused Error Analysis\n\n`;
md += `**Generated**: ${new Date(report.timestamp).toLocaleString()}\n\n`;
md += `## Summary\n\n`;
md += `- **Total Errors**: ${report.summary.totalErrors.toLocaleString()}\n`;
md += `- **Files Affected**: ${report.summary.filesAffected.toLocaleString()}\n`;
md += `- **Categories**: ${report.summary.categoryCount}\n\n`;

md += `## Category Breakdown\n\n`;
md += `| Category | Priority | Files | Errors | Weight | Description |\n`;
md += `|----------|----------|-------|--------|--------|-------------|\n`;

for (const cat of report.categoryBreakdown) {
	const priority = cat.priority === 'P0' ? '🔴 P0' : cat.priority === 'P1' ? '🟡 P1' : cat.priority === 'P2' ? '🟢 P2' : '⚪ P3';
	md += `| ${cat.category} | ${priority} | ${cat.fileCount} | ${cat.errorCount} | ${cat.weight} | ${cat.description} |\n`;
}

md += `\n## Top 50 Highest-Impact Files\n\n`;
for (let i = 0; i < Math.min(50, fileDetails.length); i++) {
	const file = fileDetails[i];
	md += `### ${i + 1}. ${file.file}\n\n`;
	md += `- **Category**: ${ARCHITECTURE_CATEGORIES[file.category].description}\n`;
	md += `- **Priority**: ${file.priority}\n`;
	md += `- **Impact Score**: ${file.impactScore} (${file.errorCount} errors × ${file.weight} weight)\n`;
	md += `- **Error Count**: ${file.errorCount}\n\n`;

	if (file.errors.length > 0) {
		md += `**Sample Errors**:\n`;
		for (const error of file.errors) {
			md += `- Line ${error.line}: ${error.message}\n`;
		}
		md += `\n`;
	}
}

md += `\n## Recommended Fix Order\n\n`;
md += `### Phase 1: Critical Infrastructure (P0)\n`;
md += `Routes, Layouts, API Endpoints, Database, Auth\n\n`;
md += `### Phase 2: High Priority (P1)\n`;
md += `Services, Stores, Query Logic\n\n`;
md += `### Phase 3: Medium Priority (P2)\n`;
md += `gRPC, Protobuf, Components, Types\n\n`;
md += `### Phase 4: Low Priority (P3)\n`;
md += `Utilities, Generated Code, GPU\n`;

writeFileSync(mdPath, md);
console.log(`📄 MD:   ${relative(ROOT, mdPath)}\n`);

// Print summary
console.log('📊 ARCHITECTURE BREAKDOWN\n');
console.log('Priority Distribution:');
const p0 = report.categoryBreakdown.filter(c => c.priority === 'P0').reduce((sum, c) => sum + c.errorCount, 0);
const p1 = report.categoryBreakdown.filter(c => c.priority === 'P1').reduce((sum, c) => sum + c.errorCount, 0);
const p2 = report.categoryBreakdown.filter(c => c.priority === 'P2').reduce((sum, c) => sum + c.errorCount, 0);
const p3 = report.categoryBreakdown.filter(c => c.priority === 'P3').reduce((sum, c) => sum + c.errorCount, 0);

console.log(`  🔴 P0 (Critical):  ${p0} errors`);
console.log(`  🟡 P1 (High):      ${p1} errors`);
console.log(`  🟢 P2 (Medium):    ${p2} errors`);
console.log(`  ⚪ P3 (Low):       ${p3} errors\n`);

console.log('Top 5 Categories:');
for (let i = 0; i < Math.min(5, report.categoryBreakdown.length); i++) {
	const cat = report.categoryBreakdown[i];
	console.log(`  ${i + 1}. ${cat.description}: ${cat.errorCount} errors (${cat.fileCount} files)`);
}

console.log('\n🎯 Next Steps:');
console.log('  1. Review architecture-analysis-*.md for detailed breakdown');
console.log('  2. Focus on P0 categories first (routes, API, database, auth)');
console.log('  3. Create targeted patterns for high-frequency architectural issues');
console.log('  4. Apply fixes in priority order (P0 → P1 → P2 → P3)');

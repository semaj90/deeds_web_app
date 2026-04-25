#!/usr/bin/env node

/**
 * Phase 79: Error Leaderboard & Ranking
 *
 * Analyzes ingested errors to generate:
 * - Top-N files by error count
 * - High-impact errors by severity × frequency
 * - Architectural component breakdown
 * - Fix priority recommendations
 *
 * Usage:
 *   node scripts/error-leaderboard.mjs --run <runId>
 *   node scripts/error-leaderboard.mjs --run manual-20251225 --top 1000
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const LOGS_DIR = join(ROOT, 'logs', 'errors');
const REPORTS_DIR = join(ROOT, 'reports', 'phase79-leaderboard');

mkdirSync(REPORTS_DIR, { recursive: true });

const SEVERITY_SCORE = {
	error: 3,
	warn: 2,
	info: 1
};

const RISK_WEIGHT = {
	safe: 1,
	medium: 2,
	high: 3
};

// Parse CLI args
const args = process.argv.slice(2);
const RUN_ID = args.find(a => a.startsWith('--run='))?.split('=')[1];
const TOP_N = parseInt(args.find(a => a.startsWith('--top='))?.split('=')[1] || '1000', 10);

if (!RUN_ID) {
	console.error('❌ Usage: node error-leaderboard.mjs --run <runId> [--top 1000]');
	process.exit(1);
}

console.log('📊 Phase 79: Error Leaderboard\n');
console.log(`   Run ID: ${RUN_ID}`);
console.log(`   Top N: ${TOP_N}\n`);

/**
 * Load errors from JSONL
 */
function loadErrors(runId) {
	const runFile = join(LOGS_DIR, `${runId}.jsonl`);
	const lines = readFileSync(runFile, 'utf8').trim().split('\n');
	return lines.map(line => JSON.parse(line));
}

function derivePackage(file) {
	const normalized = file.replace(/\\/g, '/');
	const parts = normalized.split('/');
	// Capture src/<area>/<feature>
	const srcIdx = parts.indexOf('src');
	if (srcIdx !== -1 && parts[srcIdx + 1]) {
		return parts.slice(srcIdx + 1, srcIdx + 3).join('/');
	}
	return parts.slice(0, 2).join('/');
}

function buildFingerprintCounts(errors) {
	const counts = {};
	for (const error of errors) {
		counts[error.fingerprint] = (counts[error.fingerprint] || 0) + 1;
	}
	return counts;
}

/**
 * Architectural component classifier
 */
const ARCHITECTURE_MAP = {
	'routes-pages': { patterns: [/\+page\.svelte$/], weight: 10 },
	'routes-server': { patterns: [/\+server\.ts$/], weight: 10 },
	'routes-layout': { patterns: [/\+layout\.svelte$/], weight: 9 },
	'api-endpoints': { patterns: [/src\/routes\/api\/.*\+server\.ts$/], weight: 10 },
	'grpc-services': { patterns: [/src\/lib\/grpc\//], weight: 7 },
	'protobuf': { patterns: [/\.proto$/], weight: 6 },
	'flatbuffers': { patterns: [/\.fbs$/], weight: 6 },
	'quic-protocol': { patterns: [/quic/i], weight: 5 },
	'database': { patterns: [/schema/, /drizzle/, /src\/lib\/server\/db/], weight: 9 },
	'auth': { patterns: [/lucia/, /auth/], weight: 9 },
	'components': { patterns: [/src\/lib\/components/], weight: 5 },
	'stores': { patterns: [/src\/lib\/stores/], weight: 6 },
	'utils': { patterns: [/src\/lib\/utils/], weight: 4 },
	'types': { patterns: [/\.d\.ts$/], weight: 3 }
};

function classifyArchitecture(file) {
	for (const [category, config] of Object.entries(ARCHITECTURE_MAP)) {
		for (const pattern of config.patterns) {
			if (pattern.test(file)) {
				return { category, weight: config.weight };
			}
		}
	}
	return { category: 'other', weight: 1 };
}

/**
 * Calculate impact score
 * Split into impact (how much we fix) and risk (how likely we break runtime)
 */
function calculateImpactScore(file, errorCount, errors, fingerprintCounts) {
	const { category, weight: categoryWeight } = classifyArchitecture(file);
	const severityScore = errors.reduce((sum, e) => {
		return sum + (SEVERITY_SCORE[e.severity] || e.severityWeight || 1);
	}, 0) / errors.length;

	const clusterSize = errors.reduce((max, e) => Math.max(max, fingerprintCounts[e.fingerprint] || 1), 1);
	const distinctPackages = new Set(errors.map(e => derivePackage(e.projectRootRel || e.file))).size;
	const buildBreaker = errors.some(e => (e.severity || 'error') === 'error' || /Cannot find module|is not assignable|module not found/i.test(e.message || ''));
	const cascadeMultiplier = category === 'routes-pages' || category === 'api-endpoints' ? 1.5 : 1.0;

	const impact = Math.round(
		(errorCount * categoryWeight * severityScore * cascadeMultiplier) +
		(clusterSize * 5) +
		(distinctPackages * 3) +
		(buildBreaker ? 15 : 0)
	);

	return { impact, clusterSize, distinctPackages, buildBreaker };
}

function calculateRisk(errors, file) {
	const baseRisk = Math.max(...errors.map(e => RISK_WEIGHT[e.risk] || RISK_WEIGHT.medium));
	const sensitiveSurface = /(auth|db|database|migration|migrations|env)/i.test(file) ? 1 : 0;
	const envTouch = errors.some(e => /\$env\//.test(e.message || '') || (e.domains || []).includes('config')) ? 1 : 0;
	const patchSafety = errors.some(e => (e.patchKind || 'replace') === 'ast') ? -0.5 : 0;

	const riskScore = Math.max(1, baseRisk + sensitiveSurface + envTouch + patchSafety);
	return Number(riskScore.toFixed(2));
}

/**
 * Generate markdown leaderboard
 */
function generateLeaderboard(errors, topN) {
	const fingerprintCounts = buildFingerprintCounts(errors);

	// Group by file
	const fileGroups = {};
	for (const error of errors) {
		if (!fileGroups[error.file]) {
			fileGroups[error.file] = [];
		}
		fileGroups[error.file].push(error);
	}

	// Calculate scores
	const scored = Object.entries(fileGroups).map(([file, fileErrors]) => {
		const { category, weight } = classifyArchitecture(file);
		const impactParts = calculateImpactScore(file, fileErrors.length, fileErrors, fingerprintCounts);
		const riskScore = calculateRisk(fileErrors, file);
		const priorityScore = Number((impactParts.impact / riskScore).toFixed(2));

		return {
			file,
			errorCount: fileErrors.length,
			category,
			categoryWeight: weight,
			impactScore: impactParts.impact,
			riskScore,
			priorityScore,
			clusterSize: impactParts.clusterSize,
			distinctPackages: impactParts.distinctPackages,
			buildBreaker: impactParts.buildBreaker,
			errors: fileErrors
		};
	});

	// Sort by impact score
	scored.sort((a, b) => b.priorityScore - a.priorityScore);

	// Generate markdown
	const md = [];
	md.push(`# Phase 79: Error Leaderboard (${RUN_ID})\n`);
	md.push(`**Generated:** ${new Date().toISOString()}`);
	md.push(`**Total Errors:** ${errors.length}`);
	md.push(`**Affected Files:** ${scored.length}`);
	md.push(`**Top N:** ${topN}\n`);
	md.push(`---\n`);

	// Architecture summary
	md.push(`## 📊 By Architecture Component\n`);
	const archStats = {};
	for (const item of scored) {
		archStats[item.category] = (archStats[item.category] || 0) + item.errorCount;
	}

	const sortedArch = Object.entries(archStats).sort((a, b) => b[1] - a[1]);
	for (const [category, count] of sortedArch) {
		md.push(`- **${category}**: ${count} errors`);
	}
	md.push('');

	// Pattern summary
	md.push(`## 🔍 By Error Pattern\n`);
	const patternStats = {};
	for (const error of errors) {
		patternStats[error.patternId] = (patternStats[error.patternId] || 0) + 1;
	}

	const sortedPatterns = Object.entries(patternStats).sort((a, b) => b[1] - a[1]);
	for (const [pattern, count] of sortedPatterns.slice(0, 10)) {
		md.push(`- **${pattern}**: ${count} occurrences`);
	}
	md.push('');

	// Top N files
	md.push(`## 🎯 Top ${Math.min(topN, scored.length)} Files by Impact Score\n`);
	md.push(`| Rank | File | Errors | Impact | Risk | Impact/Risk | Category | Packages | Cluster |`);
	md.push(`|------|------|--------|--------|------|-------------|----------|----------|---------|`);

	for (let i = 0; i < Math.min(topN, scored.length); i++) {
		const item = scored[i];
		const shortPath = relative(ROOT, item.file);
		const priority = item.priorityScore > 60 ? 'P0' : item.priorityScore > 30 ? 'P1' : 'P2';

		md.push(`| ${i + 1} | \`${shortPath}\` | ${item.errorCount} | ${item.impactScore} | ${item.riskScore} | **${item.priorityScore} (${priority})** | ${item.category} | ${item.distinctPackages} | ${item.clusterSize} |`);
	}
	md.push('');

	// Detailed breakdown for top 20
	md.push(`## 📋 Detailed Breakdown (Top 20)\n`);
	for (let i = 0; i < Math.min(20, scored.length); i++) {
		const item = scored[i];
		const shortPath = relative(ROOT, item.file);

		md.push(`### ${i + 1}. ${shortPath}`);
		md.push(`- **Errors:** ${item.errorCount}`);
		md.push(`- **Category:** ${item.category}`);
		md.push(`- **Impact:** ${item.impactScore}`);
		md.push(`- **Risk:** ${item.riskScore}`);
		md.push(`- **Impact/Risk:** ${item.priorityScore}`);
		md.push(`- **Cluster Size:** ${item.clusterSize} | **Packages:** ${item.distinctPackages}`);
		md.push(`- **Build Breaker:** ${item.buildBreaker ? 'yes' : 'no'}`);
		md.push('');

		// Group errors by pattern
		const patternGroups = {};
		for (const error of item.errors) {
			if (!patternGroups[error.patternId]) {
				patternGroups[error.patternId] = [];
			}
			patternGroups[error.patternId].push(error);
		}

		md.push(`**Error Patterns:**`);
		for (const [pattern, patternErrors] of Object.entries(patternGroups)) {
			md.push(`- \`${pattern}\`: ${patternErrors.length} occurrences`);
		}
		md.push('');
	}

	// Fix recommendations
	md.push(`## 🔧 Fix Recommendations\n`);
	md.push(`### P0 (Critical - Impact > 100)`);
	const p0 = scored.filter(s => s.priorityScore > 60);
	for (const item of p0.slice(0, 10)) {
		const shortPath = relative(ROOT, item.file);
		md.push(`- [ ] \`${shortPath}\` (${item.errorCount} errors, impact/risk: ${item.priorityScore})`);
	}
	md.push('');

	md.push(`### P1 (High - Impact 50-100)`);
	const p1 = scored.filter(s => s.priorityScore > 30 && s.priorityScore <= 60);
	for (const item of p1.slice(0, 10)) {
		const shortPath = relative(ROOT, item.file);
		md.push(`- [ ] \`${shortPath}\` (${item.errorCount} errors, impact/risk: ${item.priorityScore})`);
	}
	md.push('');

	md.push(`### P2 (Medium - Impact < 50)`);
	const p2 = scored.filter(s => s.priorityScore <= 30);
	md.push(`- ${p2.length} files remaining`);
	md.push('');

	return md.join('\n');
}

/**
 * Main execution
 */
async function main() {
const errors = loadErrors(RUN_ID);
console.log(`✅ Loaded ${errors.length} errors\n`);

const markdown = generateLeaderboard(errors, TOP_N);

	const outFile = join(REPORTS_DIR, `${RUN_ID}-leaderboard.md`);
	writeFileSync(outFile, markdown);

	console.log(`📄 Leaderboard: ${relative(ROOT, outFile)}\n`);

	// Print summary
	const fileGroups = {};
	for (const error of errors) {
		if (!fileGroups[error.file]) {
			fileGroups[error.file] = [];
		}
		fileGroups[error.file].push(error);
	}

	const scored = Object.entries(fileGroups)
		.map(([file, fileErrors]) => ({
			file,
			errorCount: fileErrors.length,
			impactScore: calculateImpactScore(file, fileErrors.length, fileErrors, buildFingerprintCounts(errors)).impact,
			riskScore: calculateRisk(fileErrors, file)
		}))
		.map(item => ({ ...item, priorityScore: Number((item.impactScore / item.riskScore).toFixed(2)) }))
		.sort((a, b) => b.priorityScore - a.priorityScore);

	console.log('📊 TOP 10 FILES BY IMPACT\n');
	for (let i = 0; i < Math.min(10, scored.length); i++) {
		const item = scored[i];
		const shortPath = relative(ROOT, item.file);
		console.log(`${i + 1}. ${shortPath}`);
		console.log(`   Errors: ${item.errorCount} | Impact: ${item.impactScore} | Risk: ${item.riskScore} | Impact/Risk: ${item.priorityScore}\n`);
	}

	console.log(`✅ Leaderboard generated!\n`);
	console.log(`💡 Next steps:`);
	console.log(`   1. node scripts/error-index-qdrant.mjs --run ${RUN_ID}`);
	console.log(`   2. node scripts/error-search.mjs --query "database errors"`);
	console.log(`   3. node scripts/phase79-pattern-fixer.mjs --apply --pattern db-import`);
}

main().catch(error => {
	console.error('❌ Leaderboard generation failed:', error.message);
	process.exit(1);
});

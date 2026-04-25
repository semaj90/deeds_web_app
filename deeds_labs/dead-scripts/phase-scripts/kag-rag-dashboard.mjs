#!/usr/bin/env node
/**
 * KAG/RAG Learning Dashboard
 *
 * Displays real-time statistics for Phase 72 error fixing with knowledge accumulation:
 * - Total signatures learned
 * - Total fixes stored
 * - Average confidence
 * - Top performing fixes
 * - Cache hit/miss rates
 * - Recent fix history
 *
 * Usage:
 *   node kag-rag-dashboard.mjs              # Show current stats
 *   node kag-rag-dashboard.mjs --watch      # Real-time monitoring
 *   node kag-rag-dashboard.mjs --export     # Export JSON data
 */

import fs from 'fs';
import path from 'path';
import { kagFixStore } from './kag-fix-store.mjs';

// ==================== Config ====================

const FLAGS = {
	WATCH: process.argv.includes('--watch'),
	EXPORT: process.argv.includes('--export'),
	SELFTEST: process.argv.includes('--selftest'),
	INTERVAL: parseInt(process.argv.find((a) => a.startsWith('--interval='))?.split('=')[1] || '5')
};

// ==================== Display Functions ====================

function clearScreen() {
	process.stdout.write('\x1Bc');
}

function formatConfidence(confidence) {
	const pct = (confidence * 100).toFixed(1);
	if (confidence >= 0.9) return `\x1b[32m${pct}%\x1b[0m`; // Green
	if (confidence >= 0.7) return `\x1b[33m${pct}%\x1b[0m`; // Yellow
	return `\x1b[31m${pct}%\x1b[0m`; // Red
}

function formatTimestamp(isoString) {
	const date = new Date(isoString);
	const now = new Date();
	const diffMs = now - date;
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	return `${diffDays}d ago`;
}

function truncate(str, maxLen) {
	if (str.length <= maxLen) return str;
	return str.substring(0, maxLen - 3) + '...';
}

async function displayDashboard() {
	if (FLAGS.SELFTEST) {
		const health = await kagFixStore.health();
		if (!health.ok) {
			console.error('[KAG Dashboard] ❌ Self-test failed:', health.message || health.redis?.message || 'unhealthy');
			process.exit(1);
		}
		console.log('[KAG Dashboard] ✅ Self-test passed');
		process.exit(0);
	}

	const stats = await kagFixStore.getStats();

	console.log('╔════════════════════════════════════════════════════════════════╗');
	console.log('║  Phase 72 KAG/RAG Learning Dashboard                           ║');
	console.log('╚════════════════════════════════════════════════════════════════╝');
	console.log('');

	// Knowledge Base Statistics
	console.log('📊 \x1b[1mKnowledge Base Statistics\x1b[0m');
	console.log('─'.repeat(68));
	console.log(`   Total Signatures: ${stats.totalSignatures.toLocaleString()}`);
	console.log(`   Total Fixes Stored: ${stats.totalFixes.toLocaleString()}`);
	console.log(`   Average Confidence: ${formatConfidence(stats.avgConfidence)}`);
	console.log('');

	// Cache Performance
	console.log('🎯 \x1b[1mCache Performance\x1b[0m');
	console.log('─'.repeat(68));
	console.log(
		`   Hit Rate: ${stats.hitRate.toFixed(1)}% (fixes replayed from KAG)`
	);
	console.log(`   Miss Rate: ${stats.missRate.toFixed(1)}% (new fixes generated)`);

	// Calculate time saved (assuming 3s per fix without KAG, 0.5s with KAG)
	const hitCount = (stats.totalFixes * stats.hitRate) / 100;
	const timeSaved = hitCount * 2.5; // 3s - 0.5s = 2.5s saved per hit
	console.log(`   Estimated Time Saved: ${Math.floor(timeSaved)}s (${Math.floor(timeSaved / 60)}m ${Math.floor(timeSaved % 60)}s)`);
	console.log('');

	// Top Performing Fixes
	console.log('🏆 \x1b[1mTop Performing Fixes\x1b[0m (by success count)');
	console.log('─'.repeat(68));

	if (stats.topFixes.length === 0) {
		console.log('   No fixes stored yet. Run factory-fixer-v2.mjs to start learning.');
	} else {
		stats.topFixes.slice(0, 10).forEach((fix, i) => {
			const successRate = fix.successCount / (fix.successCount + fix.failureCount);
			const bar = '█'.repeat(Math.floor(successRate * 20));
			console.log(`   ${i + 1}. ${truncate(fix.patchId, 40)}`);
			console.log(
				`      ${bar} ${fix.successCount}/${fix.successCount + fix.failureCount} (${formatConfidence(fix.confidence)})`
			);
		});
	}
	console.log('');

	// Recent Fixes
	console.log('🕒 \x1b[1mRecent Fix Activity\x1b[0m');
	console.log('─'.repeat(68));

	if (stats.recentFixes.length === 0) {
		console.log('   No recent activity.');
	} else {
		stats.recentFixes.slice(0, 10).forEach((fix) => {
			const statusIcon = fix.verified ? '✅' : '❌';
			console.log(
				`   ${statusIcon} ${truncate(fix.patchId, 35)} - ${formatTimestamp(fix.appliedAt)}`
			);
			console.log(`      Tier ${fix.tier} | ${formatConfidence(fix.confidence)}`);
		});
	}
	console.log('');

	// Learning Insights
	if (stats.totalFixes > 50) {
		console.log('💡 \x1b[1mLearning Insights\x1b[0m');
		console.log('─'.repeat(68));

		const avgSuccessCount =
			stats.topFixes.reduce((sum, f) => sum + f.successCount, 0) / stats.topFixes.length;

		if (stats.hitRate > 60) {
			console.log(
				'   🎉 Excellent! KAG is learning effectively (hit rate > 60%)'
			);
		} else if (stats.hitRate > 40) {
			console.log(
				'   📈 Good progress. KAG is building knowledge (hit rate > 40%)'
			);
		} else {
			console.log('   🌱 Early learning phase. Run more fixes to improve KAG.');
		}

		if (stats.avgConfidence > 0.85) {
			console.log('   ✨ High-confidence fixes dominate. Quality is excellent.');
		} else if (stats.avgConfidence > 0.7) {
			console.log('   👍 Confidence is good. Continue learning for better results.');
		} else {
			console.log('   ⚠️  Low confidence detected. Review failed fixes.');
		}

		console.log('');
	}

	// Footer
	if (FLAGS.WATCH) {
		console.log(
			`\x1b[90m[${new Date().toLocaleTimeString()}] Refreshing every ${FLAGS.INTERVAL}s... Press Ctrl+C to exit\x1b[0m`
		);
	} else {
		console.log('\x1b[90mRun with --watch for real-time monitoring\x1b[0m');
	}
}

async function exportData() {
	console.log('📤 Exporting KAG/RAG data...\n');

	const data = await kagFixStore.exportData();
	const outputPath = path.resolve(
		process.cwd(),
		`kag-rag-export-${Date.now()}.json`
	);

	fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');

	console.log(`✅ Export complete: ${outputPath}`);
	console.log(`   Total Signatures: ${data.stats.totalSignatures}`);
	console.log(`   Total Fixes: ${data.stats.totalFixes}`);
}

// ==================== Main ====================

async function main() {
	if (FLAGS.EXPORT) {
		await exportData();
		return;
	}

	if (FLAGS.WATCH) {
		// Real-time monitoring mode
		clearScreen();
		await displayDashboard();

		setInterval(async () => {
			clearScreen();
			await displayDashboard();
		}, FLAGS.INTERVAL * 1000);
	} else {
		// Single display
		await displayDashboard();
	}
}

main().catch((error) => {
	console.error('❌ Dashboard Error:', error);
	process.exit(1);
});

#!/usr/bin/env node
/**
 * Backup File Comparison & Analysis Script
 *
 * Generates detailed reports comparing backup files with their current versions.
 * Helps make informed decisions about which backups to keep/delete.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, extname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ====================================
// File Discovery
// ====================================

function findBackupFiles(dir, backups = []) {
	try {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			// Skip node_modules, .git, etc.
			if (entry.isDirectory()) {
				if (!entry.name.startsWith('.') &&
				    entry.name !== 'node_modules' &&
				    entry.name !== '.svelte-kit' &&
				    entry.name !== 'build' &&
				    entry.name !== 'dist') {
					findBackupFiles(fullPath, backups);
				}
			} else if (entry.isFile()) {
				// Match backup patterns
				if (entry.name.includes('.backup') ||
				    entry.name.endsWith('.bak') ||
				    entry.name.includes('.corrupt') ||
				    entry.name.match(/\.phase\d+\.bak$/)) {
					backups.push(fullPath);
				}
			}
		}
	} catch (err) {
		// Skip inaccessible directories
	}

	return backups;
}

function findBackupDirectories(dir, backupDirs = []) {
	try {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const fullPath = join(dir, entry.name);

			// Match backup directory patterns
			if (entry.name === '.corrupted_backups' ||
			    entry.name === 'archived-components' ||
			    entry.name === 'components-backup' ||
			    entry.name === 'phase-backups' ||
			    entry.name === 'phase2-backups' ||
			    entry.name === '_archive' ||
			    entry.name.endsWith('_backup')) {
				backupDirs.push(fullPath);
			} else if (!entry.name.startsWith('.') &&
			           entry.name !== 'node_modules' &&
			           entry.name !== '.svelte-kit') {
				findBackupDirectories(fullPath, backupDirs);
			}
		}
	} catch (err) {
		// Skip inaccessible directories
	}

	return backupDirs;
}

// ====================================
// File Analysis
// ====================================

function getCurrentFilePath(backupPath) {
	// Remove backup extensions to get original file path
	return backupPath
		.replace(/\.backup.*$/, '')
		.replace(/\.bak$/, '')
		.replace(/\.corrupt$/, '')
		.replace(/\.phase\d+\.bak$/, '');
}

function analyzeFile(content, filePath) {
	const ext = extname(filePath);
	const analysis = {
		size: content.length,
		lines: content.split('\n').length,
		hasErrors: false,
		hasTodos: /TODO|FIXME|XXX|HACK/i.test(content),
		hasTypeSuppressions: /@ts-nocheck|@ts-ignore|@ts-expect-error/.test(content),
		hasSvelte5: /\$state|\$derived|\$effect|\$props/.test(content),
		isSvelte4: /export let|onMount|beforeUpdate|afterUpdate/.test(content) && ext === '.svelte',
		quality: 'unknown'
	};

	// Detect syntax errors (basic)
	if (ext === '.svelte' || ext === '.ts' || ext === '.js') {
		// Check for obvious syntax errors
		const hasUnmatchedBraces = (content.match(/\{/g) || []).length !== (content.match(/\}/g) || []).length;
		const hasUnmatchedParens = (content.match(/\(/g) || []).length !== (content.match(/\)/g) || []).length;
		const hasCorruptedStrings = /, string:/.test(content);

		analysis.hasErrors = hasUnmatchedBraces || hasUnmatchedParens || hasCorruptedStrings;
	}

	// Quality assessment
	if (analysis.hasErrors) {
		analysis.quality = 'corrupted';
	} else if (analysis.hasSvelte5) {
		analysis.quality = 'modern';
	} else if (analysis.isSvelte4) {
		analysis.quality = 'legacy';
	} else if (analysis.hasTypeSuppressions) {
		analysis.quality = 'suppressed';
	} else {
		analysis.quality = 'good';
	}

	return analysis;
}

function compareFiles(backupPath) {
	const currentPath = getCurrentFilePath(backupPath);
	const relativePath = relative(ROOT, currentPath);

	const result = {
		backupPath: relative(ROOT, backupPath),
		currentPath: relativePath,
		exists: existsSync(currentPath),
		recommendation: 'unknown',
		reasons: [],
		priority: 0
	};

	// Current file doesn't exist
	if (!result.exists) {
		result.recommendation = 'DELETE_BACKUP';
		result.reasons.push('Current file no longer exists');
		result.priority = 5;
		return result;
	}

	try {
		// Read both files
		const backupContent = readFileSync(backupPath, 'utf8');
		const currentContent = readFileSync(currentPath, 'utf8');

		// Get file stats
		const backupStats = statSync(backupPath);
		const currentStats = statSync(currentPath);

		// Analyze both
		const backupAnalysis = analyzeFile(backupContent, backupPath);
		const currentAnalysis = analyzeFile(currentContent, currentPath);

		result.backup = backupAnalysis;
		result.current = currentAnalysis;
		result.backupSize = backupStats.size;
		result.currentSize = currentStats.size;
		result.backupDate = backupStats.mtime;
		result.currentDate = currentStats.mtime;

		// Compare and decide

		// Case 1: Identical files
		if (backupContent === currentContent) {
			result.recommendation = 'DELETE_BACKUP';
			result.reasons.push('Backup is identical to current file');
			result.priority = 5;
			return result;
		}

		// Case 2: Backup is corrupted but current is good
		if (backupAnalysis.quality === 'corrupted' && currentAnalysis.quality !== 'corrupted') {
			result.recommendation = 'DELETE_BACKUP';
			result.reasons.push('Backup is corrupted, current is clean');
			result.priority = 5;
			return result;
		}

		// Case 3: Current is corrupted but backup is good
		if (currentAnalysis.quality === 'corrupted' && backupAnalysis.quality !== 'corrupted') {
			result.recommendation = 'RESTORE_FROM_BACKUP';
			result.reasons.push('Current is corrupted, backup is clean');
			result.priority = 1;
			return result;
		}

		// Case 4: Current is modern (Svelte 5), backup is legacy
		if (currentAnalysis.hasSvelte5 && !backupAnalysis.hasSvelte5) {
			result.recommendation = 'DELETE_BACKUP';
			result.reasons.push('Current has Svelte 5 migration, backup is legacy');
			result.priority = 4;
			return result;
		}

		// Case 5: Current is newer and larger
		if (currentStats.mtime > backupStats.mtime && currentStats.size >= backupStats.size) {
			result.recommendation = 'DELETE_BACKUP';
			result.reasons.push('Current is newer and has more content');
			result.priority = 4;
			return result;
		}

		// Case 6: Backup is newer (unusual - needs review)
		if (backupStats.mtime > currentStats.mtime) {
			result.recommendation = 'REVIEW_MANUAL';
			result.reasons.push('Backup is newer than current (unusual)');
			result.priority = 2;
			return result;
		}

		// Case 7: Backup is larger (might have more features)
		if (backupStats.size > currentStats.size * 1.1) { // 10% larger
			result.recommendation = 'REVIEW_MANUAL';
			result.reasons.push('Backup is significantly larger');
			result.priority = 2;
			return result;
		}

		// Case 8: Quality degraded (current has suppressions, backup doesn't)
		if (currentAnalysis.hasTypeSuppressions && !backupAnalysis.hasTypeSuppressions) {
			result.recommendation = 'REVIEW_MANUAL';
			result.reasons.push('Current has type suppressions, backup is clean');
			result.priority = 3;
			return result;
		}

		// Default: Keep current, delete backup
		result.recommendation = 'DELETE_BACKUP';
		result.reasons.push('Current appears to be the working version');
		result.priority = 3;

	} catch (err) {
		result.recommendation = 'ERROR';
		result.reasons.push(`Error reading files: ${err.message}`);
		result.priority = 1;
	}

	return result;
}

// ====================================
// Report Generation
// ====================================

function generateMarkdownReport(results, directories) {
	let md = `# Backup File Analysis Report\n\n`;
	md += `**Generated:** ${new Date().toISOString()}\n\n`;
	md += `---\n\n`;

	// Summary
	md += `## 📊 Summary\n\n`;
	md += `### Files Analyzed\n\n`;
	md += `- **Total backup files:** ${results.length}\n`;
	md += `- **Backup directories:** ${directories.length}\n\n`;

	const recommendations = results.reduce((acc, r) => {
		acc[r.recommendation] = (acc[r.recommendation] || 0) + 1;
		return acc;
	}, {});

	md += `### Recommendations\n\n`;
	Object.entries(recommendations).sort((a, b) => b[1] - a[1]).forEach(([rec, count]) => {
		const pct = ((count / results.length) * 100).toFixed(1);
		md += `- **${rec}:** ${count} files (${pct}%)\n`;
	});

	md += `\n---\n\n`;

	// Backup Directories
	md += `## 📂 Backup Directories (${directories.length})\n\n`;
	md += `**Recommendation:** Delete all (safe - these are explicitly backup directories)\n\n`;
	md += `| Directory | Files |\n`;
	md += `|-----------|-------|\n`;

	directories.forEach(dir => {
		const relPath = relative(ROOT, dir);
		let fileCount = 0;
		try {
			fileCount = readdirSync(dir).length;
		} catch {}
		md += `| ${relPath} | ${fileCount} |\n`;
	});

	md += `\n---\n\n`;

	// High Priority Actions
	md += `## 🚨 High Priority (Immediate Action)\n\n`;

	const highPriority = results.filter(r => r.priority <= 2);
	md += `**${highPriority.length} files need immediate attention**\n\n`;

	if (highPriority.length > 0) {
		md += `| File | Recommendation | Reason |\n`;
		md += `|------|----------------|--------|\n`;
		highPriority.forEach(r => {
			md += `| ${r.currentPath} | ${r.recommendation} | ${r.reasons.join('; ')} |\n`;
		});
	}

	md += `\n---\n\n`;

	// Safe Deletions
	md += `## ✅ Safe to Delete (Priority 4-5)\n\n`;

	const safeDeletions = results.filter(r =>
		r.recommendation === 'DELETE_BACKUP' && r.priority >= 4
	);

	md += `**${safeDeletions.length} backup files safe to delete**\n\n`;
	md += `These backups are either:\n`;
	md += `- Identical to current files\n`;
	md += `- Older than current files\n`;
	md += `- Legacy code replaced by Svelte 5 migration\n`;
	md += `- Corrupted while current is clean\n\n`;

	if (safeDeletions.length > 0) {
		md += `<details>\n<summary>Click to see list (${safeDeletions.length} files)</summary>\n\n`;
		md += `\`\`\`\n`;
		safeDeletions.forEach(r => {
			md += `${r.backupPath}\n`;
		});
		md += `\`\`\`\n\n`;
		md += `</details>\n\n`;
	}

	md += `---\n\n`;

	// Manual Review Needed
	md += `## 👀 Manual Review Required\n\n`;

	const manualReview = results.filter(r =>
		r.recommendation === 'REVIEW_MANUAL' || r.priority === 3
	);

	md += `**${manualReview.length} files need manual review**\n\n`;

	if (manualReview.length > 0) {
		md += `| Backup | Current | Reason | Backup Size | Current Size |\n`;
		md += `|--------|---------|--------|-------------|---------------|\n`;
		manualReview.forEach(r => {
			md += `| ${r.backupPath} | ${r.currentPath} | ${r.reasons.join('; ')} | ${r.backupSize || 'N/A'} | ${r.currentSize || 'N/A'} |\n`;
		});
	}

	md += `\n---\n\n`;

	// Restoration Candidates
	md += `## 🔄 Restoration Candidates\n\n`;

	const restorations = results.filter(r => r.recommendation === 'RESTORE_FROM_BACKUP');

	if (restorations.length > 0) {
		md += `**${restorations.length} files where backup is better than current**\n\n`;
		md += `| Current (Corrupted) | Backup (Clean) |\n`;
		md += `|---------------------|----------------|\n`;
		restorations.forEach(r => {
			md += `| ${r.currentPath} | ${r.backupPath} |\n`;
		});
	} else {
		md += `✅ No restoration needed - all current files are clean\n`;
	}

	md += `\n---\n\n`;

	// Deletion Script
	md += `## 🛠️ Generated Deletion Scripts\n\n`;
	md += `### PowerShell (Windows)\n\n`;
	md += `\`\`\`powershell\n`;
	md += `# Delete backup directories (${directories.length} directories)\n`;
	directories.forEach(dir => {
		const relPath = relative(ROOT, dir);
		md += `Remove-Item -Recurse -Force "${relPath}"\n`;
	});
	md += `\n`;
	md += `# Delete safe backup files (${safeDeletions.length} files)\n`;
	safeDeletions.slice(0, 20).forEach(r => {
		md += `Remove-Item "${r.backupPath}"\n`;
	});
	if (safeDeletions.length > 20) {
		md += `# ... and ${safeDeletions.length - 20} more files\n`;
	}
	md += `\`\`\`\n\n`;

	md += `### Bash (Linux/Mac)\n\n`;
	md += `\`\`\`bash\n`;
	md += `# Delete backup directories\n`;
	directories.forEach(dir => {
		const relPath = relative(ROOT, dir);
		md += `rm -rf "${relPath}"\n`;
	});
	md += `\n`;
	md += `# Delete safe backup files\n`;
	safeDeletions.slice(0, 20).forEach(r => {
		md += `rm "${r.backupPath}"\n`;
	});
	if (safeDeletions.length > 20) {
		md += `# ... and ${safeDeletions.length - 20} more files\n`;
	}
	md += `\`\`\`\n\n`;

	return md;
}

function generateCSVReport(results) {
	let csv = 'Backup Path,Current Path,Exists,Recommendation,Priority,Reasons,Backup Size,Current Size,Backup Quality,Current Quality\n';

	results.forEach(r => {
		const row = [
			r.backupPath,
			r.currentPath,
			r.exists ? 'yes' : 'no',
			r.recommendation,
			r.priority,
			`"${r.reasons.join('; ')}"`,
			r.backupSize || '',
			r.currentSize || '',
			r.backup?.quality || '',
			r.current?.quality || ''
		];
		csv += row.join(',') + '\n';
	});

	return csv;
}

// ====================================
// Main
// ====================================

async function main() {
	console.log('🔍 Scanning for backup files...\n');

	const srcDir = join(ROOT, 'src');
	const backupFiles = findBackupFiles(srcDir);
	const backupDirs = findBackupDirectories(srcDir);

	console.log(`Found ${backupFiles.length} backup files`);
	console.log(`Found ${backupDirs.length} backup directories\n`);

	console.log('📊 Analyzing backups...\n');

	const results = [];
	let i = 0;
	for (const backupPath of backupFiles) {
		i++;
		if (i % 50 === 0) {
			console.log(`  Analyzed ${i}/${backupFiles.length} files...`);
		}
		const result = compareFiles(backupPath);
		results.push(result);
	}

	console.log(`\n✅ Analysis complete!\n`);

	// Generate reports
	console.log('📝 Generating reports...\n');

	const mdReport = generateMarkdownReport(results, backupDirs);
	const csvReport = generateCSVReport(results);

	const reportsDir = join(ROOT, 'reports');
	writeFileSync(join(reportsDir, 'backup-analysis.md'), mdReport);
	writeFileSync(join(reportsDir, 'backup-analysis.csv'), csvReport);

	console.log(`✅ Reports saved:`);
	console.log(`   - reports/backup-analysis.md`);
	console.log(`   - reports/backup-analysis.csv\n`);

	// Summary
	const summary = results.reduce((acc, r) => {
		acc[r.recommendation] = (acc[r.recommendation] || 0) + 1;
		return acc;
	}, {});

	console.log('📊 Summary:');
	console.log(`   Total backup files: ${results.length}`);
	console.log(`   Backup directories: ${backupDirs.length}`);
	console.log('');
	console.log('   Recommendations:');
	Object.entries(summary).forEach(([rec, count]) => {
		const pct = ((count / results.length) * 100).toFixed(1);
		console.log(`   - ${rec}: ${count} (${pct}%)`);
	});
	console.log('');
	console.log('💡 Next steps:');
	console.log('   1. Review reports/backup-analysis.md');
	console.log('   2. Handle high-priority items first');
	console.log('   3. Execute deletion scripts for safe files');
	console.log('   4. Manually review flagged items');
}

main().catch(console.error);

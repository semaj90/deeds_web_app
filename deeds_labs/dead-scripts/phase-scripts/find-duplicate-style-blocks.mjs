#!/usr/bin/env node

/**
 * Finds Svelte files with duplicate or corrupted style blocks
 *
 * Patterns detected:
 * - Multiple </style> tags
 * - Content after </style> before next tag
 * - Malformed CSS rules outside style blocks
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔍 DUPLICATE STYLE BLOCK DETECTOR\n');
console.log('='.repeat(80) + '\n');

const gitFiles = execSync('git ls-files "src/**/*.svelte"', { encoding: 'utf-8' })
	.split('\n')
	.filter(Boolean)
	.map(f => f.trim());

console.log(`Scanning ${gitFiles.length} Svelte files...\n`);

const issuesFound = [];

for (const filePath of gitFiles) {
	try {
		const fullPath = resolve(filePath);
		const content = readFileSync(fullPath, 'utf-8');

		// Pattern 1: Multiple </style> closing tags
		const styleCloseMatches = content.match(/<\/style>/g);
		if (styleCloseMatches && styleCloseMatches.length > 1) {
			issuesFound.push({
				file: filePath,
				issue: 'Multiple </style> tags',
				count: styleCloseMatches.length,
				severity: 'high'
			});
			continue;
		}

		// Pattern 2: Content after </style> that looks like CSS
		const afterStyleMatch = content.match(/<\/style>\s*([^<\n]+)/);
		if (afterStyleMatch && afterStyleMatch[1].trim().length > 10) {
			const afterContent = afterStyleMatch[1].trim();
			// Check if it looks like CSS (has colons, semicolons, braces)
			if (afterContent.includes(':') || afterContent.includes('{') || afterContent.includes('}')) {
				issuesFound.push({
					file: filePath,
					issue: 'Content after </style>',
					snippet: afterContent.substring(0, 60) + '...',
					severity: 'high'
				});
			}
		}

		// Pattern 3: Unclosed style blocks
		const styleOpenMatches = content.match(/<style[^>]*>/g);
		const styleCloseCount = styleCloseMatches ? styleCloseMatches.length : 0;
		const styleOpenCount = styleOpenMatches ? styleOpenMatches.length : 0;

		if (styleOpenCount !== styleCloseCount) {
			issuesFound.push({
				file: filePath,
				issue: 'Mismatched style tags',
				open: styleOpenCount,
				close: styleCloseCount,
				severity: 'critical'
			});
		}

	} catch (err) {
		console.error(`✗ Error reading ${filePath}:`, err.message);
	}
}

console.log('='.repeat(80));
console.log(`\n📊 RESULTS:\n`);
console.log(`Files scanned: ${gitFiles.length}`);
console.log(`Files with issues: ${issuesFound.length}\n`);

if (issuesFound.length > 0) {
	console.log('🚨 Issues Found:\n');

	// Group by severity
	const critical = issuesFound.filter(i => i.severity === 'critical');
	const high = issuesFound.filter(i => i.severity === 'high');

	if (critical.length > 0) {
		console.log(`\n🔴 CRITICAL (${critical.length}):`);
		critical.forEach(issue => {
			console.log(`\n  ${issue.file}`);
			console.log(`  Issue: ${issue.issue}`);
			if (issue.open !== undefined) {
				console.log(`  Open tags: ${issue.open}, Close tags: ${issue.close}`);
			}
		});
	}

	if (high.length > 0) {
		console.log(`\n🟡 HIGH (${high.length}):`);
		high.forEach(issue => {
			console.log(`\n  ${issue.file}`);
			console.log(`  Issue: ${issue.issue}`);
			if (issue.count) console.log(`  Count: ${issue.count}`);
			if (issue.snippet) console.log(`  Snippet: ${issue.snippet}`);
		});
	}

	console.log('\n💡 Recommendation: These files need manual cleanup to remove duplicate/corrupted style blocks.\n');
} else {
	console.log('✅ No duplicate style blocks found!\n');
}
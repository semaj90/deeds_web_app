#!/usr/bin/env node
/**
 * Markdown Task Audit — Superseded Feature Detector
 *
 * Cross-references unchecked tasks in .md files against MEMORY.md completed features
 * to identify outdated task tracking that should be marked as done.
 *
 * Usage:
 *   node scripts/audit/md-task-audit.mjs
 *   node scripts/audit/md-task-audit.mjs --verbose
 *   node scripts/audit/md-task-audit.mjs --file SPECIFIC_FILE.md
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

// Parse CLI args
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const TARGET_FILE = args.find(a => a.startsWith('--file='))?.split('=')[1];

// ═══════════════════════════════════════════════════════════════════════════
// 1. Load MEMORY.md Completed Features
// ═══════════════════════════════════════════════════════════════════════════

const MEMORY_PATH = 'C:\\Users\\james\\.claude\\projects\\c--Users-james-Videos-deeds-web-app\\memory\\MEMORY.md';
let completedFeatures = [];

try {
	const memoryContent = readFileSync(MEMORY_PATH, 'utf-8');
	const completedSection = memoryContent.match(/## Completed Features \(Cumulative\)([\s\S]*?)(?=##|$)/);

	if (completedSection) {
		const lines = completedSection[1].split('\n');
		completedFeatures = lines
			.filter(line => line.trim().startsWith('-'))
			.map(line => {
				// Extract feature name from markdown list
				const match = line.match(/^\s*-\s+\*\*(.+?)\*\*/);
				return match ? match[1].toLowerCase() : line.toLowerCase();
			})
			.filter(Boolean);
	}

	console.log(`✓ Loaded ${completedFeatures.length} completed features from MEMORY.md\n`);
} catch (err) {
	console.warn(`⚠ Could not load MEMORY.md: ${err.message}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Find All .md Files
// ═══════════════════════════════════════════════════════════════════════════

function findMarkdownFiles(dir, files = []) {
	const entries = readdirSync(dir);

	for (const entry of entries) {
		const fullPath = join(dir, entry);

		// Skip excluded directories (including Python venvs, caches, build artifacts)
		const skipDirs = [
			'node_modules', '.git', 'deeds_labs', '.python311', '.venv', 'venv',
			'__pycache__', '.pytest_cache', 'build', 'dist', '.next', '.svelte-kit',
		];
		if (skipDirs.includes(entry)) continue;

		let stat;
		try {
			stat = statSync(fullPath);
		} catch (err) {
			// Skip files/dirs with permission errors
			continue;
		}

		if (stat.isDirectory()) {
			findMarkdownFiles(fullPath, files);
		} else if (entry.endsWith('.md')) {
			files.push(fullPath);
		}
	}

	return files;
}

const mdFiles = TARGET_FILE
	? [join(ROOT, TARGET_FILE)]
	: findMarkdownFiles(ROOT);

console.log(`📄 Found ${mdFiles.length} markdown files to audit\n`);

// ═══════════════════════════════════════════════════════════════════════════
// 3. Extract Unchecked Tasks
// ═══════════════════════════════════════════════════════════════════════════

const UNCHECKED_PATTERNS = [
	/^[-*]\s+\[\s\]\s+(.+)$/,           // - [ ] Task
	/^\s*[-*]\s+\[\s\]\s+(.+)$/,        //   - [ ] Indented task
	/^#{1,6}\s+\[\s\]\s+(.+)$/,         // ## [ ] Header task
];

const CHECKED_PATTERNS = [
	/^[-*]\s+\[x\]\s+(.+)$/i,           // - [x] Done
	/^[-*]\s+\[✓\]\s+(.+)$/,            // - [✓] Done
	/^[-*]\s+\[✅\]\s+(.+)$/,           // - [✅] Done
];

const results = {
	totalFiles: 0,
	filesWithTasks: 0,
	totalUnchecked: 0,
	totalChecked: 0,
	likelyCompleted: [],
	genuineIncomplete: [],
	byCategory: {
		features: [],
		tests: [],
		docs: [],
		infra: [],
		other: [],
	},
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. Audit Each File
// ═══════════════════════════════════════════════════════════════════════════

for (const filePath of mdFiles) {
	results.totalFiles++;

	const content = readFileSync(filePath, 'utf-8');
	const lines = content.split('\n');
	const relPath = relative(ROOT, filePath);

	const uncheckedTasks = [];
	const checkedTasks = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Check for unchecked tasks
		for (const pattern of UNCHECKED_PATTERNS) {
			const match = line.match(pattern);
			if (match) {
				uncheckedTasks.push({
					line: i + 1,
					text: match[1].trim(),
					raw: line,
				});
			}
		}

		// Check for checked tasks
		for (const pattern of CHECKED_PATTERNS) {
			const match = line.match(pattern);
			if (match) {
				checkedTasks.push({
					line: i + 1,
					text: match[1].trim(),
				});
			}
		}
	}

	if (uncheckedTasks.length > 0 || checkedTasks.length > 0) {
		results.filesWithTasks++;
		results.totalUnchecked += uncheckedTasks.length;
		results.totalChecked += checkedTasks.length;

		// Cross-reference each unchecked task with completed features
		for (const task of uncheckedTasks) {
			const taskLower = task.text.toLowerCase();

			// Check if this task matches any completed feature
			const matchedFeature = completedFeatures.find(feature => {
				// Flexible matching: feature name contains task keywords or vice versa
				const keywords = taskLower.split(/\s+/).filter(w => w.length > 3);
				return keywords.some(kw => feature.includes(kw)) || taskLower.includes(feature);
			});

			const taskInfo = {
				file: relPath,
				line: task.line,
				text: task.text,
				matchedFeature: matchedFeature || null,
			};

			if (matchedFeature) {
				results.likelyCompleted.push(taskInfo);
			} else {
				results.genuineIncomplete.push(taskInfo);
			}

			// Categorize by keywords
			if (taskLower.includes('test') || taskLower.includes('verify')) {
				results.byCategory.tests.push(taskInfo);
			} else if (taskLower.includes('doc') || taskLower.includes('readme') || taskLower.includes('guide')) {
				results.byCategory.docs.push(taskInfo);
			} else if (taskLower.includes('feature') || taskLower.includes('implement') || taskLower.includes('add')) {
				results.byCategory.features.push(taskInfo);
			} else if (taskLower.includes('docker') || taskLower.includes('deploy') || taskLower.includes('infra')) {
				results.byCategory.infra.push(taskInfo);
			} else {
				results.byCategory.other.push(taskInfo);
			}
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Generate Report
// ═══════════════════════════════════════════════════════════════════════════

console.log('═'.repeat(80));
console.log('MARKDOWN TASK AUDIT REPORT');
console.log('═'.repeat(80));
console.log();

console.log('📊 SUMMARY');
console.log('─'.repeat(80));
console.log(`Total .md files scanned:       ${results.totalFiles}`);
console.log(`Files with task checkboxes:    ${results.filesWithTasks}`);
console.log(`Total unchecked tasks:         ${results.totalUnchecked}`);
console.log(`Total checked tasks:           ${results.totalChecked}`);
console.log(`Likely completed (outdated):   ${results.likelyCompleted.length} ⚠️`);
console.log(`Genuinely incomplete:          ${results.genuineIncomplete.length}`);
console.log();

console.log('📂 BY CATEGORY');
console.log('─'.repeat(80));
console.log(`Features:       ${results.byCategory.features.length}`);
console.log(`Tests:          ${results.byCategory.tests.length}`);
console.log(`Documentation:  ${results.byCategory.docs.length}`);
console.log(`Infrastructure: ${results.byCategory.infra.length}`);
console.log(`Other:          ${results.byCategory.other.length}`);
console.log();

if (results.likelyCompleted.length > 0) {
	console.log('⚠️  LIKELY COMPLETED (Should be marked [x])');
	console.log('─'.repeat(80));

	results.likelyCompleted.forEach(({ file, line, text, matchedFeature }) => {
		console.log(`\n📄 ${file}:${line}`);
		console.log(`   Task: ${text}`);
		console.log(`   ✓ Matches completed feature: "${matchedFeature}"`);
	});

	console.log();
}

if (VERBOSE && results.genuineIncomplete.length > 0) {
	console.log('📋 GENUINELY INCOMPLETE TASKS');
	console.log('─'.repeat(80));

	const byFile = {};
	for (const task of results.genuineIncomplete) {
		if (!byFile[task.file]) byFile[task.file] = [];
		byFile[task.file].push(task);
	}

	for (const [file, tasks] of Object.entries(byFile)) {
		console.log(`\n📄 ${file} (${tasks.length} tasks)`);
		tasks.forEach(t => console.log(`   ${t.line}: ${t.text}`));
	}

	console.log();
}

console.log('═'.repeat(80));
console.log('RECOMMENDATIONS');
console.log('═'.repeat(80));

if (results.likelyCompleted.length > 0) {
	console.log(`✅ ${results.likelyCompleted.length} tasks should be marked as completed [x]`);
	console.log('   Consider updating these files to reflect actual completion status.');
}

if (results.genuineIncomplete.length > 0) {
	console.log(`📋 ${results.genuineIncomplete.length} tasks are genuinely incomplete`);
	console.log('   Review these to determine if they should be:');
	console.log('   - Implemented (if high priority)');
	console.log('   - Archived (if superseded)');
	console.log('   - Deleted (if no longer relevant)');
}

console.log();
console.log('💡 TIP: Run with --verbose to see all incomplete tasks');
console.log('💡 TIP: Run with --file=FILENAME.md to audit a specific file');
console.log();

// Exit code: 0 if no likely-completed tasks, 1 if outdated tasks found
process.exit(results.likelyCompleted.length > 0 ? 1 : 0);

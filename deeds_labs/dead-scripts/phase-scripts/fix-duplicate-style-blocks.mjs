#!/usr/bin/env node

/**
 * Fixes duplicate style blocks in Svelte files
 *
 * Strategy:
 * 1. Keep the first complete <style>...</style> block
 * 2. Remove any duplicate closing </style> tags
 * 3. Remove orphaned CSS content after </style>
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🔧 DUPLICATE STYLE BLOCK FIXER\n');
console.log('='.repeat(80) + '\n');

// Files identified by detector (high severity - multiple </style> tags)
const filesToFix = [
	'src/lib/components/ai/AIChatInterface.svelte',
	'src/lib/components/ai/AiAssistant.svelte',
	'src/lib/components/ai/CachePerformanceDashboard.svelte',
	'src/lib/components/ai/Enhanced3DLegalAIInterface.svelte',
	'src/lib/components/ai/PatternDetectionInterface.svelte',
	'src/lib/components/ai/SIMDAIAssistantDemo.svelte',
	'src/lib/components/auth/NesAuthButton.svelte',
	'src/lib/components/canvas/CollaborativeEvidenceCanvas.svelte',
	'src/lib/components/cases/CaseNotesEditor.svelte',
	'src/lib/components/evidence-editor/AIAssistantPanel.svelte',
	'src/lib/components/evidence/Enhanced3DEvidenceBoard.svelte',
	'src/lib/components/glyph/GlyphGenerator.svelte',
	'src/lib/components/keyboard/KeyboardShortcuts.svelte',
	'src/lib/components/legal/CriminalProfile.svelte',
	'src/lib/components/legal/EvidenceReportSummary.svelte',
	'src/lib/components/ui/Modal.svelte'
];

let filesFixed = 0;
let totalDuplicatesRemoved = 0;

for (const filePath of filesToFix) {
	try {
		const fullPath = resolve(filePath);
		const content = readFileSync(fullPath, 'utf-8');

		// Find first complete style block
		const firstStyleMatch = content.match(/<style[^>]*>[\s\S]*?<\/style>/);

		if (!firstStyleMatch) {
			console.log(`⚠️  ${filePath} - No complete style block found`);
			continue;
		}

		const firstStyleBlock = firstStyleMatch[0];
		const firstStyleEnd = firstStyleMatch.index + firstStyleBlock.length;

		// Get everything after the first style block
		const afterFirstStyle = content.substring(firstStyleEnd);

		// Count duplicate </style> tags and orphaned content
		const duplicateStyleTags = (afterFirstStyle.match(/<\/style>/g) || []).length;

		if (duplicateStyleTags === 0) {
			console.log(`✓ ${filePath} - Already clean`);
			continue;
		}

		// Remove everything from first </style> to second </style> (inclusive)
		// This removes the orphaned CSS content and duplicate closing tag
		const cleanedAfterFirstStyle = afterFirstStyle.replace(/^[\s\S]*?<\/style>/, '');

		// Reconstruct file: everything before style + first style block + cleaned after
		const beforeFirstStyle = content.substring(0, firstStyleMatch.index);
		const fixed = beforeFirstStyle + firstStyleBlock + cleanedAfterFirstStyle;

		// Write fixed content
		writeFileSync(fullPath, fixed, 'utf-8');

		filesFixed++;
		totalDuplicatesRemoved += duplicateStyleTags;

		console.log(`✓ ${filePath}`);
		console.log(`  Removed ${duplicateStyleTags} duplicate </style> tag(s)`);

	} catch (err) {
		console.error(`✗ Error processing ${filePath}:`, err.message);
	}
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 RESULTS:\n`);
console.log(`Files processed: ${filesToFix.length}`);
console.log(`Files fixed: ${filesFixed}`);
console.log(`Total duplicate </style> tags removed: ${totalDuplicatesRemoved}`);

console.log('\n✨ Duplicate style block cleanup complete!\n');
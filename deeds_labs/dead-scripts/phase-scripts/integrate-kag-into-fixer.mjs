#!/usr/bin/env node
/**
 * Phase 72 KAG Integration - Quick Start Script
 *
 * Wires KAG (Knowledge-Action-Graph) + RAG (Retrieval-Augmented Generation)
 * into factory-fixer-v2.mjs for self-improving error fixing.
 *
 * Changes:
 * 1. Import kag-fix-store.ts
 * 2. Modify generateFixPlan() to check KAG before generating fixes
 * 3. Modify applyFixes() to store successful fixes in KAG
 * 4. Add --kag, --rag, --show-learning flags
 *
 * Usage:
 *   node integrate-kag-into-fixer.mjs --dry-run   # Preview changes
 *   node integrate-kag-into-fixer.mjs --apply     # Apply changes
 *   node integrate-kag-into-fixer.mjs --selftest  # Verify imports
 */

// CLI self-test handler (must be before other imports)
if (process.argv.includes('--selftest')) {
	console.log('[KAG Integration] Running self-test...');
	try {
		// Test imports
		const { kagFixStore } = await import('./kag-fix-store.mjs');
		if (!kagFixStore || typeof kagFixStore.health !== 'function') {
			throw new Error('kagFixStore import failed or missing health() function');
		}
		console.log('[KAG Integration] ✅ Self-test PASSED - imports resolve correctly');
		process.exit(0);
	} catch (error) {
		console.error('[KAG Integration] ❌ Self-test FAILED:', error.message);
		process.exit(1);
	}
}

// This repo now wires KAG directly in factory-fixer-v2.mjs.
// Keep this script as a non-destructive guardrail (selftest + sanity checks).
if (!process.argv.includes('--selftest')) {
	console.log('[KAG Integration] No action needed: KAG is integrated directly in scripts/factory-fixer-v2.mjs');
	console.log('[KAG Integration] Use: node scripts/integrate-kag-into-fixer.mjs --selftest');
	process.exit(0);
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXER_PATH = path.resolve(__dirname, 'factory-fixer-v2.mjs');
const BACKUP_PATH = path.resolve(__dirname, 'factory-fixer-v2.mjs.backup-pre-kag');

// ==================== Config ====================

const FLAGS = {
	DRY_RUN: process.argv.includes('--dry-run'),
	APPLY: process.argv.includes('--apply'),
	VERBOSE: process.argv.includes('--verbose')
};

// ==================== Integration Patches ====================

const IMPORT_PATCH = {
	name: 'Add KAG imports',
	search: /import\s+.*?\s+from\s+['"].*?['"];?\s*$/gm,
	insert: `
// KAG/RAG Integration (Phase 72)
import { kagFixStore } from './kag-fix-store.mjs';
`,
	insertAfterLast: true
};

const GENERATE_FIX_PLAN_PATCH = {
	name: 'Add KAG query to generateFixPlan()',
	search: /async\s+function\s+generateFixPlan\s*\(([^)]*)\)\s*\{/,
	replace: `async function generateFixPlan($1) {
  const plan = { fixes: [], stats: { kag: 0, rag: 0, tier: 0, manual: 0 } };

  for (const event of events) {
    // 1. Check KAG for known fix (instant replay)
    if (FLAGS.ENABLE_KAG) {
      const errorSig = kagFixStore.computeSignature({
        message: event.message,
        file: event.file,
        code: event.code,
        tool: event.tool || 'svelte-check',
        position: event.position
      });

      const knownFix = await kagFixStore.queryBestFix(errorSig);

      if (knownFix && knownFix.confidence >= (FLAGS.KAG_THRESHOLD || 0.8)) {
        plan.fixes.push({
          ...event,
          patternId: \`kag-replay-\${knownFix.patchId}\`,
          patch: knownFix.patch,
          confidence: knownFix.confidence,
          source: 'kag',
          replayCount: knownFix.successCount,
          errorSig
        });
        plan.stats.kag++;
        continue;
      }
    }

    // 2. Fallback to existing Tier rules
    const tierFix = applyTierRules(event, tier);
    if (tierFix) {
      plan.fixes.push({ ...tierFix, source: 'tier' });
      plan.stats.tier++;
    }
  }

  return plan;`
};

const APPLY_FIXES_PATCH = {
	name: 'Add KAG storage to applyFixes()',
	search: /(async\s+function\s+applyFixes\s*\([^)]*\)\s*\{[\s\S]*?)(}\s*$)/m,
	insert: `
    // Store successful fix in KAG
    if (FLAGS.ENABLE_KAG && patchResult.verified) {
      await kagFixStore.storeFix(fix.errorSig, {
        sig: fix.errorSig.sig,
        patchId: fix.patternId,
        patch: fix.patch,
        appliedAt: new Date().toISOString(),
        verified: true,
        successCount: 1,
        failureCount: 0,
        confidence: 1.0,
        tier: FLAGS.TIER || 2,
        filesBefore: stats.filesBefore || 0,
        filesAfter: stats.filesAfter || 0,
        errorsBefore: stats.errorsBefore || 0,
        errorsAfter: stats.errorsAfter || 0,
        runtime: patchResult.runtime || 0
      });
    }
`,
	insertBefore: '  }'
};

const FLAGS_PATCH = {
	name: 'Add KAG/RAG flags to FLAGS object',
	search: /const\s+FLAGS\s*=\s*\{/,
	insert: `
  ENABLE_KAG: process.argv.includes('--kag') || !process.argv.includes('--no-kag'),
  ENABLE_RAG: process.argv.includes('--rag') || !process.argv.includes('--no-rag'),
  KAG_THRESHOLD: parseFloat(process.argv.find(a => a.startsWith('--kag-threshold='))?.split('=')[1] || '0.8'),
  SHOW_LEARNING: process.argv.includes('--show-learning'),
`,
	insertAfter: 'const FLAGS = {'
};

const HELP_TEXT_PATCH = {
	name: 'Add KAG/RAG flags to help text',
	search: /(function\s+showHelp\s*\(\)\s*\{[\s\S]*?)(}\s*$)/m,
	insert: `
  console.log('');
  console.log('KAG/RAG Flags:');
  console.log('  --kag                    Enable KAG fix replay (default: enabled)');
  console.log('  --no-kag                 Disable KAG (pure Tier rules)');
  console.log('  --rag                    Enable RAG semantic search (default: enabled)');
  console.log('  --no-rag                 Disable RAG fallback');
  console.log('  --kag-threshold=<n>      Minimum confidence for KAG replay (default: 0.8)');
  console.log('  --show-learning          Show KAG/RAG statistics');
`,
	insertBefore: '  }\n}'
};

// ==================== Main Integration Logic ====================

async function main() {
	console.log('╔═══════════════════════════════════════════════════════════════╗');
	console.log('║  Phase 72: KAG Integration into factory-fixer-v2.mjs         ║');
	console.log('╚═══════════════════════════════════════════════════════════════╝\n');

	if (!FLAGS.DRY_RUN && !FLAGS.APPLY) {
		console.error('❌ Error: Must specify --dry-run or --apply');
		console.log('\nUsage:');
		console.log('  node integrate-kag-into-fixer.mjs --dry-run   # Preview changes');
		console.log('  node integrate-kag-into-fixer.mjs --apply     # Apply changes');
		process.exit(1);
	}

	// Check if fixer exists
	if (!fs.existsSync(FIXER_PATH)) {
		console.error(`❌ Error: factory-fixer-v2.mjs not found at ${FIXER_PATH}`);
		process.exit(1);
	}

	// Read fixer content
	let fixerContent = fs.readFileSync(FIXER_PATH, 'utf-8');

	// Check if already integrated
	if (fixerContent.includes('kagFixStore')) {
		console.log('✅ KAG already integrated into factory-fixer-v2.mjs');
		console.log('   No changes needed.');
		process.exit(0);
	}

	// Apply patches
	console.log('📝 Applying KAG integration patches...\n');

	const patches = [
		IMPORT_PATCH,
		FLAGS_PATCH,
		GENERATE_FIX_PLAN_PATCH,
		APPLY_FIXES_PATCH,
		HELP_TEXT_PATCH
	];

	for (const patch of patches) {
		console.log(`   ${patch.name}...`);

		if (patch.insertAfterLast) {
			// Find last match and insert after
			const matches = [...fixerContent.matchAll(patch.search)];
			if (matches.length > 0) {
				const lastMatch = matches[matches.length - 1];
				const insertPos = lastMatch.index + lastMatch[0].length;
				fixerContent =
					fixerContent.slice(0, insertPos) +
					patch.insert +
					fixerContent.slice(insertPos);
			}
		} else if (patch.insertAfter) {
			fixerContent = fixerContent.replace(patch.search, `$&${patch.insert}`);
		} else if (patch.insertBefore) {
			const target = patch.insertBefore;
			fixerContent = fixerContent.replace(target, `${patch.insert}${target}`);
		} else if (patch.replace) {
			fixerContent = fixerContent.replace(patch.search, patch.replace);
		}
	}

	if (FLAGS.DRY_RUN) {
		console.log('\n📋 Dry Run - Preview of Changes:\n');
		console.log('─'.repeat(70));
		console.log(fixerContent.substring(0, 1500));
		console.log('...\n[truncated - full output would be shown in --apply mode]\n');
		console.log('─'.repeat(70));
		console.log('\n✅ Dry run complete. Run with --apply to apply changes.');
		process.exit(0);
	}

	if (FLAGS.APPLY) {
		// Create backup
		fs.copyFileSync(FIXER_PATH, BACKUP_PATH);
		console.log(`\n💾 Backup created: ${BACKUP_PATH}`);

		// Write modified content
		fs.writeFileSync(FIXER_PATH, fixerContent, 'utf-8');
		console.log(`✅ KAG integration applied to ${FIXER_PATH}`);

		console.log('\n📊 Next Steps:\n');
		console.log('1. Test KAG replay:');
		console.log('   node scripts/factory-fixer-v2.mjs --apply --tier 2 --limit 50\n');
		console.log('2. Show learning statistics:');
		console.log('   node scripts/factory-fixer-v2.mjs --status --show-learning\n');
		console.log('3. Apply 500 fixes with KAG+RAG:');
		console.log('   node scripts/factory-fixer-v2.mjs --apply --tier 2 --limit 500 --kag --rag\n');
		console.log('4. Monitor KAG effectiveness:');
		console.log('   node scripts/kag-rag-dashboard.mjs\n');
	}
}

main().catch((error) => {
	console.error('❌ Integration Error:', error);
	process.exit(1);
});

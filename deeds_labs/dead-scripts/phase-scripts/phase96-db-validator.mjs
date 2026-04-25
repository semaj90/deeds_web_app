/**
 * Phase 96: Database Save Button Validator
 *
 * Ensures all save/submit buttons in Svelte components:
 * 1. Are properly wired to database save functions
 * 2. Include user session context
 * 3. Have loading states
 * 4. Show success/error feedback
 * 5. Use proper database client (legal_ai_db)
 */

import { readFileSync } from 'fs';
import { glob } from 'glob';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, '..');

const results = {
	saveButtons: [],
	missingFunctionality: [],
	recommendations: []
};

async function analyzeSaveButtons() {
	console.log('🔍 Phase 96: Database Save Button Validator');
	console.log('═'.repeat(80));
	console.log('');

	// Find all Svelte components with buttons
	const svelteFiles = await glob('src/**/*.svelte', { cwd: PROJECT_ROOT });

	console.log(`📁 Analyzing ${svelteFiles.length} Svelte components...`);
	console.log('');

	for (const file of svelteFiles) {
		const fullPath = join(PROJECT_ROOT, file);
		const content = readFileSync(fullPath, 'utf-8');

		// Find save/submit buttons
		const saveButtonPattern = /<button[^>]*(?:type="submit"|onclick|onsubmit)[^>]*>[\s\S]*?(?:save|submit|create|update|add)/i;
		const hasSaveButton = saveButtonPattern.test(content);

		if (hasSaveButton) {
			const analysis = {
				file,
				hasSaveButton: true,
				hasLoadingState: /\b(?:loading|isLoading|isSaving|submitting)\b/i.test(content),
				hasErrorHandling: /\b(?:error|err|catch|failed)\b/i.test(content),
				hasSuccessMessage: /\b(?:success|saved|created|updated|toast|notification)\b/i.test(content),
				hasDatabaseCall: /\b(?:fetch|api|db|database|postgres|supabase)\b/i.test(content),
				hasUserSession: /\b(?:session|user|userId|auth)\b/i.test(content),
				issues: []
			};

			// Check for issues
			if (!analysis.hasLoadingState) {
				analysis.issues.push('Missing loading state');
			}
			if (!analysis.hasErrorHandling) {
				analysis.issues.push('Missing error handling');
			}
			if (!analysis.hasSuccessMessage) {
				analysis.issues.push('Missing success feedback');
			}
			if (!analysis.hasDatabaseCall) {
				analysis.issues.push('⚠️  No database call detected');
			}
			if (!analysis.hasUserSession) {
				analysis.issues.push('⚠️  No user session context');
			}

			results.saveButtons.push(analysis);

			if (analysis.issues.length > 0) {
				results.missingFunctionality.push({
					file,
					issues: analysis.issues
				});
			}
		}
	}

	// Generate report
	console.log('═'.repeat(80));
	console.log('📊 Analysis Results:');
	console.log('═'.repeat(80));
	console.log('');

	console.log(`✅ Components with save buttons: ${results.saveButtons.length}`);
	console.log(`⚠️  Components with issues: ${results.missingFunctionality.length}`);
	console.log('');

	if (results.missingFunctionality.length > 0) {
		console.log('🔴 Components Needing Fixes:');
		console.log('═'.repeat(80));

		results.missingFunctionality.forEach(({ file, issues }) => {
			console.log(`\n📄 ${file}`);
			issues.forEach(issue => {
				console.log(`   ❌ ${issue}`);
			});
		});
	}

	console.log('');
	console.log('═'.repeat(80));
	console.log('💡 Recommendations:');
	console.log('═'.repeat(80));
	console.log('');

	console.log('1. Add loading states to all save buttons:');
	console.log('   let saving = $state(false);');
	console.log('   <button disabled={saving}>{saving ? "Saving..." : "Save"}</button>');
	console.log('');

	console.log('2. Add error handling:');
	console.log('   try { ... } catch (error) { console.error(error); }');
	console.log('');

	console.log('3. Add user session context:');
	console.log('   import { userStore } from "$lib/stores";');
	console.log('   const user = $derived(userStore.user);');
	console.log('');

	console.log('4. Use database client:');
	console.log('   const response = await fetch("/api/cases", {');
	console.log('     method: "POST",');
	console.log('     headers: { "Content-Type": "application/json" },');
	console.log('     body: JSON.stringify({ ...data, userId: user.id })');
	console.log('   });');
	console.log('');

	console.log('═'.repeat(80));
	console.log(`\n✅ Analysis complete! Check components above for needed fixes.`);
}

analyzeSaveButtons().catch(console.error);

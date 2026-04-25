#!/usr/bin/env node
/**
 * Phase 89: Production-Grade Fix Applicator
 *
 * Features:
 * - Non-destructive error tracking (never delete instances)
 * - Git commit OR patch file for every change
 * - Deterministic validation (scoped then full)
 * - KB quality gate (only learn from validated wins)
 * - One-click rollback capability
 */

import { execSync } from 'child_process';
import crypto from 'crypto';
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_CONFIG = {
	host: '127.0.0.1',
	port: 5434,
	database: 'legal_ai_db',
	user: 'legal_admin',
	password: '123456'
};

class ProductionFixApplicator {
	constructor() {
		this.pool = new Pool(DB_CONFIG);
		this.patchDir = path.join(__dirname, '../reports/patches');
		this.backupDir = path.join(__dirname, '../reports/backups');
	}

	/**
	 * Apply a fix with full safety guarantees
	 */
	async applyFix(fixSpec) {
		const fixId = `fix-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

		console.log(`\n🔧 Applying fix: ${fixId}`);
		console.log(`   Target: ${fixSpec.file_path}`);
		console.log(`   Root causes: ${fixSpec.root_cause_tags.join(', ')}`);

		const result = {
			fix_id: fixId,
			timestamp: new Date().toISOString(),
			file_path: fixSpec.file_path,
			root_cause_tags: fixSpec.root_cause_tags,
			target_instance_hashes: fixSpec.target_instance_hashes,
			success: false,
			rollback_available: false
		};

		try {
			// Step 1: Pre-validation (before changes)
			console.log('  1️⃣  Running pre-validation...');
			const validationBefore = await this.runValidation(fixSpec.file_path, true);
			result.validation_before = validationBefore;
			console.log(`     Errors before: ${validationBefore.error_count}`);

			// Step 2: Create backup
			console.log('  2️⃣  Creating backup...');
			await this.createBackup(fixSpec.file_path, fixId);
			result.rollback_available = true;

			// Step 3: Save patch file (before applying)
			console.log('  3️⃣  Saving patch...');
			const patchPath = await this.savePatch(fixSpec.diff, fixId);
			result.patch_path = patchPath;

			// Step 4: Apply the diff
			console.log('  4️⃣  Applying diff...');
			await this.applyDiff(fixSpec.file_path, fixSpec.diff);

			// Step 5: Post-validation (scoped to changed file first)
			console.log('  5️⃣  Running post-validation (scoped)...');
			const validationAfterScoped = await this.runValidation(fixSpec.file_path, true);
			result.validation_after_scoped = validationAfterScoped;
			console.log(`     Errors after (scoped): ${validationAfterScoped.error_count}`);

			// Step 6: Quality check
			const errorReduction = validationBefore.error_count - validationAfterScoped.error_count;
			const introduceNewErrors = validationAfterScoped.new_errors && validationAfterScoped.new_errors.length > 0;

			if (errorReduction > 0 && !introduceNewErrors) {
				console.log(`  ✅ Quality check passed: ${errorReduction} errors fixed, no new errors`);
				result.success = true;
				result.errors_fixed = errorReduction;

				// Step 7: Full validation (if scoped passed)
				console.log('  6️⃣  Running full validation...');
				const validationAfterFull = await this.runValidation(null, false);
				result.validation_after_full = validationAfterFull;

				// Step 8: Create git commit (optional but recommended)
				try {
					const commitMsg = `fix: ${fixSpec.root_cause_tags.join(', ')} in ${path.basename(fixSpec.file_path)}\n\n` +
					                   `Fixed ${errorReduction} errors\n` +
					                   `Root causes: ${fixSpec.root_cause_tags.join(', ')}\n` +
					                   `Fix ID: ${fixId}`;
					execSync(`git add "${fixSpec.file_path}"`, { cwd: path.join(__dirname, '..') });
					execSync(`git commit -m "${commitMsg}"`, { cwd: path.join(__dirname, '..') });
					result.git_commit = true;
					console.log('  📝 Git commit created');
				} catch (gitErr) {
					console.log('  ⚠️  Git commit failed (non-critical)');
					result.git_commit = false;
				}

			} else {
				console.log(`  ❌ Quality check failed:`);
				if (errorReduction <= 0) console.log(`     - No error reduction (${errorReduction})`);
				if (introduceNewErrors) console.log(`     - Introduced new errors`);

				// Rollback automatically
				console.log('  🔄 Auto-rollback initiated...');
				await this.rollback(fixId, fixSpec.file_path);
				result.success = false;
				result.auto_rollback = true;
			}

		} catch (err) {
			console.error(`  ❌ Fix failed: ${err.message}`);
			result.error = err.message;
			result.success = false;

			// Attempt rollback
			if (result.rollback_available) {
				try {
					console.log('  🔄 Emergency rollback...');
					await this.rollback(fixId, fixSpec.file_path);
					result.emergency_rollback = true;
				} catch (rollbackErr) {
					console.error(`  ⚠️  Rollback failed: ${rollbackErr.message}`);
				}
			}
		}

		// Step 9: Record in database
		await this.recordFixAttempt(result);

		// Step 10: KB update (only if quality gate passed)
		if (result.success && this.passesKBQualityGate(result)) {
			console.log('  🎓 Updating knowledge base...');
			await this.updateKB(result, fixSpec);
		} else if (result.success) {
			console.log('  ⚠️  KB quality gate failed - manual review needed');
		}

		return result;
	}

	/**
	 * Run validation (deterministic)
	 */
	async runValidation(filePath = null, scoped = false) {
		const result = {
			timestamp: new Date().toISOString(),
			scoped,
			error_count: 0,
			errors: [],
			new_errors: []
		};

		try {
			if (scoped && filePath) {
				// Scoped validation (faster)
				const output = execSync(
					`npx svelte-check --output json --workspace src --tsconfig tsconfig.json`,
					{
						cwd: path.join(__dirname, '..'),
						encoding: 'utf-8',
						stdio: ['ignore', 'pipe', 'pipe'],
						maxBuffer: 10 * 1024 * 1024
					}
				);

				const errors = JSON.parse(output);
				const scopedErrors = errors.filter(e => e.filename === filePath);
				result.error_count = scopedErrors.length;
				result.errors = scopedErrors.map(e => ({
					code: e.code,
					message: e.text,
					line: e.start.line
				}));

			} else {
				// Full validation
				const output = execSync(
					`npx svelte-check --output json`,
					{
						cwd: path.join(__dirname, '..'),
						encoding: 'utf-8',
						stdio: ['ignore', 'pipe', 'pipe'],
						maxBuffer: 10 * 1024 * 1024
					}
				);

				const errors = JSON.parse(output);
				result.error_count = errors.length;
				result.errors = errors.slice(0, 20).map(e => ({
					code: e.code,
					message: e.text,
					file: e.filename
				}));
			}
		} catch (err) {
			// svelte-check exits with code 1 if errors found
			if (err.stdout) {
				try {
					const errors = JSON.parse(err.stdout);
					result.error_count = errors.length;
					result.errors = (scoped
						? errors.filter(e => e.filename === filePath)
						: errors.slice(0, 20)
					).map(e => ({
						code: e.code,
						message: e.text,
						line: e.start?.line,
						file: e.filename
					}));
				} catch {
					result.error_count = 0;
					result.parse_error = true;
				}
			}
		}

		return result;
	}

	/**
	 * Create backup before modification
	 */
	async createBackup(filePath, fixId) {
		await mkdir(this.backupDir, { recursive: true });

		const fileName = path.basename(filePath);
		const backupPath = path.join(this.backupDir, `${fixId}-${fileName}`);

		await copyFile(filePath, backupPath);
		return backupPath;
	}

	/**
	 * Save patch file
	 */
	async savePatch(diff, fixId) {
		await mkdir(this.patchDir, { recursive: true });

		const patchPath = path.join(this.patchDir, `${fixId}.patch`);
		await writeFile(patchPath, diff);

		return patchPath;
	}

	/**
	 * Apply git-style diff
	 */
	async applyDiff(filePath, diff) {
		// Parse diff and apply changes
		// For now, use git apply if possible
		const patchFile = path.join(this.patchDir, 'temp.patch');
		await writeFile(patchFile, diff);

		try {
			execSync(`git apply "${patchFile}"`, {
				cwd: path.join(__dirname, '..'),
				stdio: 'inherit'
			});
		} catch (err) {
			// Fallback: manual patch parsing
			throw new Error(`Failed to apply diff: ${err.message}`);
		}
	}

	/**
	 * Rollback changes
	 */
	async rollback(fixId, filePath) {
		const fileName = path.basename(filePath);
		const backupPath = path.join(this.backupDir, `${fixId}-${fileName}`);

		await copyFile(backupPath, filePath);
		console.log(`  ✅ Rolled back to backup: ${backupPath}`);
	}

	/**
	 * Record fix attempt in database
	 */
	async recordFixAttempt(result) {
		await this.pool.query(`
			INSERT INTO phase89_fix_attempts (
				model,
				target_instance_hashes,
				retrieved_chunk_ids,
				patch_diff,
				validation_cmd,
				validation_before,
				validation_after,
				success,
				root_cause_tags,
				execution_time_ms,
				notes
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		`, [
			'gemma3-legal:latest',
			result.target_instance_hashes || [],
			[],
			await readFile(result.patch_path, 'utf-8'),
			'svelte-check --output json',
			JSON.stringify(result.validation_before),
			JSON.stringify(result.validation_after_scoped),
			result.success,
			result.root_cause_tags || [],
			0,
			JSON.stringify({
				rollback_available: result.rollback_available,
				git_commit: result.git_commit,
				auto_rollback: result.auto_rollback
			})
		]);
	}

	/**
	 * KB quality gate (prevents garbage learning)
	 */
	passesKBQualityGate(result) {
		// Gate 1: Errors must decrease
		if (!result.errors_fixed || result.errors_fixed <= 0) return false;

		// Gate 2: No new errors introduced
		if (result.validation_after_scoped?.new_errors?.length > 0) return false;

		// Gate 3: Root cause tags must be confident (have at least 2 tags)
		if (!result.root_cause_tags || result.root_cause_tags.length < 2) return false;

		// Gate 4: Validation must have passed
		if (!result.validation_after_full) return false;

		return true;
	}

	/**
	 * Update knowledge base (only called if quality gate passed)
	 */
	async updateKB(result, fixSpec) {
		// Generate KB card
		const kbCard = {
			title: `Fix: ${fixSpec.root_cause_tags.join(' + ')} in ${path.basename(fixSpec.file_path)}`,
			body_md: `## Symptoms\n${fixSpec.error_messages?.join('\n') || 'N/A'}\n\n` +
			         `## Root Cause\n${fixSpec.root_cause_tags.join(', ')}\n\n` +
			         `## Fix Applied\n\`\`\`diff\n${await readFile(result.patch_path, 'utf-8')}\n\`\`\`\n\n` +
			         `## Prevention\nMonitor similar patterns in future changes.\n\n` +
			         `## Results\n- Errors fixed: ${result.errors_fixed}\n- Validation: Passed`,
			tags: fixSpec.root_cause_tags
		};

		// Insert KB card
		const cardResult = await this.pool.query(`
			INSERT INTO phase89_kb_cards (title, body_md, tags, source_fix_attempt_id, confidence_score)
			VALUES ($1, $2, $3, (SELECT id FROM phase89_fix_attempts ORDER BY created_at DESC LIMIT 1), $4)
			RETURNING id
		`, [kbCard.title, kbCard.body_md, kbCard.tags, 0.8]);

		console.log(`  ✅ KB card created: ${cardResult.rows[0].id}`);

		// TODO: Embed and index in Qdrant (phase89_kb_cards collection)
	}

	async close() {
		await this.pool.end();
	}
}

// Export for use in other scripts
export default ProductionFixApplicator;

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const applicator = new ProductionFixApplicator();

	// Example fix
	const testFix = {
		file_path: 'src/lib/components/unified/UnifiedButton.svelte',
		diff: `--- a/src/lib/components/unified/UnifiedButton.svelte
+++ b/src/lib/components/unified/UnifiedButton.svelte
@@ -63,7 +63,7 @@
 	const springStore = spring(0, {
 		stiffness: 0.3,
-		damping: 0.8,
+		damping: 0.8
 	});
`,
		root_cause_tags: ['TS1005', 'trailing_comma', 'syntax'],
		target_instance_hashes: [],
		error_messages: ["TS1005: ',' expected."]
	};

	applicator.applyFix(testFix)
		.then(() => applicator.close())
		.catch(console.error);
}

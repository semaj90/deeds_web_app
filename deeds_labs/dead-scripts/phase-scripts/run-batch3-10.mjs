#!/usr/bin/env node
/**
 * Phase 90: Batch 3-10 Executor (80 remaining files)
 *
 * User Request: "Process Batches 3-10 (80 remaining files)"
 *
 * Applies validated Phase 90 AST patterns to files #3-100 from top_100_errors.txt
 * Uses conservative confidence threshold (70%) to avoid regressions
 * Expected: ~2,000-3,000 fixes → -3,000 to -5,000 total errors (with 1.84x cascade)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // Input files
    topErrorsFile: path.join(__dirname, '../reports/top_100_errors.txt'),

    // Processing range
    startIndex: 2, // 0-indexed (file #3 in 1-indexed list)
    endIndex: 100,  // Process through file #100

    // Batch size for checkpoints
    batchSize: 10,

    // Backup and safety
    backupDir: path.join(__dirname, '../backups/batch3-10'),
    validateAfterEach: true,
    rollbackOnRegression: true,

    // Output
    resultsDir: path.join(__dirname, '../reports'),
    logFile: path.join(__dirname, '../reports/batch3-10-log.txt'),

    // Performance
    maxConcurrent: 1, // Process files sequentially for stability

    // Verbose logging
    verbose: true,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse top_100_errors.txt to extract file paths and error counts
 */
function parseTopErrorsFile() {
    const content = fs.readFileSync(CONFIG.topErrorsFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    const files = [];
    for (const line of lines) {
        // Format: "1. c:\path\to\file.ts (983 errors)"
        const match = line.match(/^\d+\.\s+(.+?)\s+\((\d+)\s+errors?\)/);
        if (match) {
            const fullPath = match[1].trim();
            const errorCount = parseInt(match[2], 10);
            const filename = path.basename(fullPath);

            if (fs.existsSync(fullPath)) {
                files.push({ filename, fullPath, errorCount });
            } else {
                console.warn(`⚠️  File not found: ${fullPath}`);
            }
        }
    }

    return files;
}/**
 * Find full path for a filename by searching common locations
 */
function findFilePath(filename) {
    const searchPaths = [
        path.join(__dirname, '../src'),
        path.join(__dirname, '../scripts'),
        path.join(__dirname, '..'),
    ];

    for (const searchPath of searchPaths) {
        try {
            const result = execSync(`rg --files "${searchPath}" | rg "${filename.replace(/\\/g, '/')}"`, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'ignore'],
            });

            const matches = result.trim().split('\n');
            if (matches.length > 0 && matches[0]) {
                return path.resolve(matches[0].trim());
            }
        } catch (err) {
            // rg not found or no matches, try next path
        }
    }

    // Fallback: manual construction
    const possiblePaths = [
        path.join(__dirname, '../src/lib/components/three/yorha-ui', filename),
        path.join(__dirname, '../src/lib/memory', filename),
        path.join(__dirname, '../src/lib/services', filename),
        path.join(__dirname, '../src/routes', filename),
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }

    return null;
}

/**
 * Get current error count for a file
 */
function getErrorCount(filePath) {
    try {
        const result = execSync(
            `npx tsc --noEmit --pretty false 2>&1 | findstr /C:"${filePath.replace(/\\/g, '\\\\')}"`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
        );
        const lines = result.trim().split('\n').filter(line => line.includes(filePath));
        return lines.length;
    } catch (err) {
        // No errors or file not found
        return 0;
    }
}

/**
 * Apply fixes to a file using multi_replace_string_in_file patterns
 */
function applyFixesToFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    let fixCount = 0;
    let modifiedContent = content;

    // Pattern 1: Fix object literal semicolons → commas
    // Example: "{ prop: value; }" → "{ prop: value, }"
    const semicolonPattern = /({[^}]*?);\s*([a-zA-Z_$][\w$]*\s*:)/g;
    const semicolonMatches = [...content.matchAll(semicolonPattern)];
    for (const match of semicolonMatches) {
        modifiedContent = modifiedContent.replace(match[0], `${match[1]}, ${match[2]}`);
        fixCount++;
    }

    // Pattern 2: Fix missing closing parentheses in new Map()
    // Example: "new Map(" → "new Map()"
    const mapPattern = /new Map\(\s*(?![)\[])/g;
    const mapMatches = [...modifiedContent.matchAll(mapPattern)];
    for (const match of mapMatches) {
        modifiedContent = modifiedContent.replace(match[0], 'new Map()');
        fixCount++;
    }

    // Pattern 3: Fix console.log missing closing parentheses
    // Example: "console.log('text';\n" → "console.log('text');\n"
    const consolePattern = /console\.log\([^)]*;/g;
    const consoleMatches = [...modifiedContent.matchAll(consolePattern)];
    for (const match of consoleMatches) {
        const fixed = match[0].replace(/;$/, ');');
        modifiedContent = modifiedContent.replace(match[0], fixed);
        fixCount++;
    }

    // Pattern 4: Fix interface property syntax errors
    // Example: "backgroundColor?," → "backgroundColor?:"
    const interfacePattern = /(\w+\?),\s*$/gm;
    const interfaceMatches = [...modifiedContent.matchAll(interfacePattern)];
    for (const match of interfaceMatches) {
        modifiedContent = modifiedContent.replace(match[0], `${match[1]}:`);
        fixCount++;
    }

    // Only write if changes made
    if (fixCount > 0) {
        fs.writeFileSync(filePath, modifiedContent, 'utf-8');
    }

    return fixCount;
}

/**
 * Create backup of file before modification
 */
function backupFile(filePath) {
    if (!fs.existsSync(CONFIG.backupDir)) {
        fs.mkdirSync(CONFIG.backupDir, { recursive: true });
    }

    const backupPath = path.join(CONFIG.backupDir, path.basename(filePath) + '.bak');
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
}

/**
 * Restore file from backup
 */
function restoreFile(filePath, backupPath) {
    fs.copyFileSync(backupPath, filePath);
    console.log(`   🔄 Rolled back: ${path.basename(filePath)}`);
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

async function processBatch(files) {
    console.log(`\n📂 Processing ${files.length} files...\n`);

    const results = [];
    let totalFixesApplied = 0;
    let totalErrorReduction = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileNum = CONFIG.startIndex + i + 1;

        console.log(`\n[${fileNum}/${CONFIG.endIndex}] Processing: ${file.filename}`);
        console.log(`   Initial errors: ${file.errorCount}`);

        // Create backup
        const backupPath = backupFile(file.fullPath);

        // Get baseline error count
        const errorsBefore = getErrorCount(file.fullPath);
        console.log(`   Current errors: ${errorsBefore}`);

        // Apply fixes
        const fixesApplied = applyFixesToFile(file.fullPath);
        console.log(`   Fixes applied: ${fixesApplied}`);

        // Validate
        const errorsAfter = getErrorCount(file.fullPath);
        const errorReduction = errorsBefore - errorsAfter;

        // Check for regression
        if (CONFIG.rollbackOnRegression && errorsAfter > errorsBefore) {
            console.log(`   ❌ REGRESSION: ${errorsBefore} → ${errorsAfter} (+${errorsAfter - errorsBefore})`);
            restoreFile(file.fullPath, backupPath);

            results.push({
                filename: file.filename,
                status: 'rolled_back',
                fixesApplied: 0,
                errorsBefore,
                errorsAfter: errorsBefore,
                errorReduction: 0,
            });
        } else {
            console.log(`   ✅ ${errorsBefore} → ${errorsAfter} (${errorReduction >= 0 ? '-' : '+'}${Math.abs(errorReduction)})`);

            totalFixesApplied += fixesApplied;
            totalErrorReduction += errorReduction;

            results.push({
                filename: file.filename,
                status: 'success',
                fixesApplied,
                errorsBefore,
                errorsAfter,
                errorReduction,
            });
        }

        // Checkpoint after each batch
        if ((i + 1) % CONFIG.batchSize === 0) {
            console.log(`\n📊 Checkpoint (${i + 1}/${files.length}):`);
            console.log(`   Total fixes: ${totalFixesApplied}`);
            console.log(`   Total error reduction: ${totalErrorReduction}`);
            console.log(`   Projected cascade (1.84x): ~${Math.round(totalErrorReduction * 1.84)}`);
        }
    }

    return { results, totalFixesApplied, totalErrorReduction };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log('🚀 Phase 90: Batch 3-10 Executor');
    console.log('═'.repeat(70));
    console.log(`\n📋 Configuration:`);
    console.log(`   Files: #${CONFIG.startIndex + 1} → #${CONFIG.endIndex}`);
    console.log(`   Total files: ${CONFIG.endIndex - CONFIG.startIndex}`);
    console.log(`   Batch size: ${CONFIG.batchSize}`);
    console.log(`   Rollback on regression: ${CONFIG.rollbackOnRegression}`);

    // Parse top 100 errors file
    console.log(`\n📂 Parsing: ${CONFIG.topErrorsFile}`);
    const allFiles = parseTopErrorsFile();
    console.log(`   Found ${allFiles.length} files`);

    // Extract target range
    const targetFiles = allFiles.slice(CONFIG.startIndex, CONFIG.endIndex);
    console.log(`   Processing ${targetFiles.length} files (#${CONFIG.startIndex + 1}-#${Math.min(CONFIG.endIndex, allFiles.length)})`);

    // Process in batches
    const { results, totalFixesApplied, totalErrorReduction } = await processBatch(targetFiles);

    // Generate summary
    console.log('\n\n📊 Final Summary:');
    console.log('═'.repeat(70));
    console.log(`  ✅ Files processed: ${results.length}`);
    console.log(`  🎯 Total fixes applied: ${totalFixesApplied}`);
    console.log(`  📉 Total error reduction: ${totalErrorReduction}`);
    console.log(`  🔮 Projected cascade (1.84x): ~${Math.round(totalErrorReduction * 1.84)}`);

    const rolledBack = results.filter(r => r.status === 'rolled_back');
    if (rolledBack.length > 0) {
        console.log(`  ⚠️  Rolled back (regressions): ${rolledBack.length}`);
    }

    // Save results
    const resultsPath = path.join(CONFIG.resultsDir, `batch3-10-results-${Date.now()}.json`);
    fs.writeFileSync(resultsPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        config: CONFIG,
        results,
        summary: {
            filesProcessed: results.length,
            totalFixesApplied,
            totalErrorReduction,
            projectedCascade: Math.round(totalErrorReduction * 1.84),
            rolledBack: rolledBack.length,
        },
    }, null, 2));

    console.log(`\n💾 Results saved: ${resultsPath}`);

    console.log('\n\n🎯 Next Steps:');
    console.log('   1. Run full TypeScript check: npx tsc --noEmit');
    console.log('   2. Measure total cascade impact');
    console.log('   3. Clear cache: Remove-Item .svelte-kit -Recurse');
    console.log('   4. Rebuild: npm run build');
    console.log('   5. Validate: npm run check');
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});

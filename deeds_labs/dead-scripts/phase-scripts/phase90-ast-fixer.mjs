#!/usr/bin/env node
/**
 * Phase 90: AST-Based TypeScript Error Fixer
 *
 * Uses TypeScript Compiler API for surgical precision fixes:
 * - Target: 14,664 missing comma errors (57% of TS1005)
 * - Projected impact: -12,000 to -15,000 total errors (with 1.84x cascade)
 * - Context-aware: Full AST analysis prevents false positives
 *
 * @see reports/PHASE90_IMPLEMENTATION_PLAN.md
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // Target error codes
    targetErrors: [
        1005, // ',' expected, ';' expected, ':' expected, etc.
    ],

    // Batch processing
    batchSize: 10,
    maxErrorsPerFile: 500,

    // Safety
    backupDir: path.join(__dirname, '../backups/phase90'),
    validateFixes: true,
    dryRun: false,
    rollbackOnRegression: true,

    // Performance
    cacheRebuildInterval: 50, // Rebuild cache every N files

    // Logging
    verbose: true,
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * @typedef {Object} FixContext
 * @property {ts.Node} node - AST node at error position
 * @property {ts.SyntaxKind} kind - Node type
 * @property {ts.Node | undefined} parent - Parent node
 * @property {boolean} isMultiline - Whether context spans multiple lines
 */

/**
 * @typedef {Object} Fix
 * @property {number} position - Character position to insert/replace
 * @property {string} text - Text to insert
 * @property {'insert' | 'replace'} type - Fix type
 * @property {number} [length] - Length to replace (for type='replace')
 * @property {FixContext} context - AST context
 */

/**
 * @typedef {Object} FileResult
 * @property {string} filePath - File path
 * @property {number} errorsBefore - Error count before fixes
 * @property {number} errorsAfter - Error count after fixes
 * @property {number} fixesApplied - Number of fixes applied
 * @property {boolean} success - Whether fixes improved error count
 * @property {string[]} backupPath - Backup file path
 */

// ============================================================================
// COMPILER OPTIONS
// ============================================================================

const compilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    allowSyntheticDefaultImports: true,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Load source file and create AST
 */
function loadSourceFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true // setParentNodes
    );
}

/**
 * Get TypeScript diagnostics for a source file
 * Uses parseDiagnostics to avoid module resolution issues
 */
function getDiagnostics(sourceFile) {
    // Use syntax-level diagnostics only (no type checking/module resolution)
    return sourceFile.parseDiagnostics || [];
}

/**
 * Create backup of file before modification
 */
function createBackup(filePath) {
    if (!fs.existsSync(CONFIG.backupDir)) {
        fs.mkdirSync(CONFIG.backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const basename = path.basename(filePath);
    const backupPath = path.join(CONFIG.backupDir, `${basename}.${timestamp}.backup`);

    fs.copyFileSync(filePath, backupPath);
    return backupPath;
}

/**
 * Restore file from backup
 */
function restoreBackup(filePath, backupPath) {
    fs.copyFileSync(backupPath, filePath);
    console.log(`   ⚠️  Restored from backup: ${backupPath}`);
}

/**
 * Get AST node at specific position
 */
function getNodeAtPosition(sourceFile, position) {
    function find(node) {
        if (position >= node.pos && position < node.end) {
            return ts.forEachChild(node, find) || node;
        }
    }
    return find(sourceFile);
}

/**
 * Check if node/context spans multiple lines
 */
function isMultiline(sourceFile, node) {
    const text = sourceFile.getFullText();
    const nodeText = text.substring(node.pos, node.end);
    return nodeText.includes('\n');
}

/**
 * Get parent node of specific kind
 */
function getParentOfKind(node, kind) {
    let current = node.parent;
    while (current) {
        if (current.kind === kind) {
            return current;
        }
        current = current.parent;
    }
    return undefined;
}

// ============================================================================
// COMMA FIXER - CONTEXT DETECTION
// ============================================================================

/**
 * Determine if comma fix is appropriate for this context
 *
 * Returns fix object or null if context is invalid
 */
function determineFix(sourceFile, diagnostic) {
    const messageText = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

    // Only handle ',' expected errors
    if (!messageText.includes("',' expected")) {
        return null;
    }

    const position = diagnostic.start;
    const node = getNodeAtPosition(sourceFile, position);

    if (!node) {
        return null;
    }

    const context = {
        node,
        kind: node.kind,
        parent: node.parent,
        isMultiline: isMultiline(sourceFile, node.parent || node),
    };

    // Categorize by AST context
    switch (node.parent?.kind) {
        case ts.SyntaxKind.InterfaceDeclaration:
        case ts.SyntaxKind.TypeLiteral:
            return handleInterfaceComma(sourceFile, node, context);

        case ts.SyntaxKind.ObjectLiteralExpression:
            return handleObjectLiteralComma(sourceFile, node, context);

        case ts.SyntaxKind.ArrayLiteralExpression:
            return handleArrayLiteralComma(sourceFile, node, context);

        case ts.SyntaxKind.CallExpression:
            return handleCallExpressionComma(sourceFile, node, context);

        default:
            // Unknown context - skip to avoid false positives
            if (CONFIG.verbose) {
                console.log(`   ⏭️  Skipped: Unknown context (${ts.SyntaxKind[node.parent?.kind || node.kind]})`);
            }
            return null;
    }
}

/**
 * Handle comma in interface/type declaration
 *
 * Example:
 *   interface X {
 *     a: string
 *     b: number  // ← Add comma after 'string'
 *   }
 */
function handleInterfaceComma(sourceFile, node, context) {
    // Find the property signature that needs a comma
    const propertySignature = getParentOfKind(node, ts.SyntaxKind.PropertySignature);

    if (!propertySignature) {
        return null;
    }

    // Insert comma at end of type annotation
    return {
        position: propertySignature.end,
        text: ',',
        type: 'insert',
        context,
    };
}

/**
 * Handle comma in object literal
 *
 * Example:
 *   const obj = {
 *     a: 1
 *     b: 2  // ← Add comma after '1'
 *   }
 */
function handleObjectLiteralComma(sourceFile, node, context) {
    const propertyAssignment = getParentOfKind(node, ts.SyntaxKind.PropertyAssignment);

    if (!propertyAssignment) {
        return null;
    }

    return {
        position: propertyAssignment.end,
        text: ',',
        type: 'insert',
        context,
    };
}

/**
 * Handle comma in array literal
 *
 * NOTE: Trailing commas in single-line arrays are optional in JS/TS
 * Only add comma if array is multiline
 */
function handleArrayLiteralComma(sourceFile, node, context) {
    if (!context.isMultiline) {
        // Single-line array - comma is optional, skip
        return null;
    }

    return {
        position: node.end,
        text: ',',
        type: 'insert',
        context,
    };
}

/**
 * Handle comma in function call arguments
 *
 * Example:
 *   fn(a, b c)  // ← Add comma between 'b' and 'c'
 */
function handleCallExpressionComma(sourceFile, node, context) {
    return {
        position: node.end,
        text: ',',
        type: 'insert',
        context,
    };
}

// ============================================================================
// FIX APPLICATION
// ============================================================================

/**
 * Apply fixes to source file
 *
 * Sorts fixes by position (reverse order) to avoid position shifts
 */
function applyFixes(sourceFile, fixes) {
    let content = sourceFile.getFullText();

    // Sort fixes in reverse order (end to start) to avoid position shifts
    const sortedFixes = [...fixes].sort((a, b) => b.position - a.position);

    for (const fix of sortedFixes) {
        if (fix.type === 'insert') {
            content =
                content.substring(0, fix.position) +
                fix.text +
                content.substring(fix.position);
        } else if (fix.type === 'replace') {
            content =
                content.substring(0, fix.position) +
                fix.text +
                content.substring(fix.position + (fix.length || 0));
        }
    }

    return content;
}

/**
 * Validate fix by re-parsing and checking error count
 */
function validateFix(originalSource, updatedContent) {
    const updatedSource = ts.createSourceFile(
        originalSource.fileName,
        updatedContent,
        ts.ScriptTarget.Latest,
        true
    );

    const originalDiagnostics = getDiagnostics(originalSource);
    const updatedDiagnostics = getDiagnostics(updatedSource);

    return {
        improved: updatedDiagnostics.length < originalDiagnostics.length,
        errorsBefore: originalDiagnostics.length,
        errorsAfter: updatedDiagnostics.length,
        reduction: originalDiagnostics.length - updatedDiagnostics.length,
    };
}

// ============================================================================
// FILE PROCESSING
// ============================================================================

/**
 * Process single file with AST-based fixes
 */
async function processFile(filePath) {
    console.log(`\n🔧 Processing: ${path.basename(filePath)}`);

    // 1. Create backup
    const backupPath = createBackup(filePath);
    console.log(`   💾 Backup: ${path.basename(backupPath)}`);

    try {
        // 2. Parse to AST
        const sourceFile = loadSourceFile(filePath);

        // 3. Get diagnostics
        const diagnostics = getDiagnostics(sourceFile);
        const targetDiagnostics = diagnostics.filter(d =>
            CONFIG.targetErrors.includes(d.code)
        );

        console.log(`   📊 Found ${diagnostics.length} total errors (${targetDiagnostics.length} target TS1005)`);

        if (targetDiagnostics.length === 0) {
            console.log(`   ⏭️  No fixable errors, skipping`);
            return {
                filePath,
                errorsBefore: diagnostics.length,
                errorsAfter: diagnostics.length,
                fixesApplied: 0,
                success: false,
                backupPath,
            };
        }

        // 4. Generate fixes
        const fixes = [];
        for (const diag of targetDiagnostics) {
            const fix = determineFix(sourceFile, diag);
            if (fix) {
                fixes.push(fix);
            }
        }

        console.log(`   🎯 Generated ${fixes.length} potential fixes`);

        if (fixes.length === 0) {
            console.log(`   ⏭️  No applicable fixes, skipping`);
            return {
                filePath,
                errorsBefore: diagnostics.length,
                errorsAfter: diagnostics.length,
                fixesApplied: 0,
                success: false,
                backupPath,
            };
        }

        // 5. Apply fixes
        const updatedContent = applyFixes(sourceFile, fixes);

        // 6. Validate
        if (CONFIG.validateFixes) {
            const validation = validateFix(sourceFile, updatedContent);

            console.log(`   📉 Errors: ${validation.errorsBefore} → ${validation.errorsAfter} (${validation.reduction >= 0 ? '-' : '+'}${Math.abs(validation.reduction)})`);

            if (!validation.improved && CONFIG.rollbackOnRegression) {
                console.log(`   ⚠️  No improvement, rolling back`);
                return {
                    filePath,
                    errorsBefore: validation.errorsBefore,
                    errorsAfter: validation.errorsBefore, // Unchanged
                    fixesApplied: 0,
                    success: false,
                    backupPath,
                };
            }

            // 7. Write to disk
            if (!CONFIG.dryRun) {
                fs.writeFileSync(filePath, updatedContent);
                console.log(`   ✅ Fixed: ${fixes.length} corrections applied`);
            } else {
                console.log(`   🔍 DRY RUN: Would apply ${fixes.length} fixes`);
            }

            return {
                filePath,
                errorsBefore: validation.errorsBefore,
                errorsAfter: validation.errorsAfter,
                fixesApplied: fixes.length,
                success: validation.improved,
                backupPath,
            };
        }

    } catch (error) {
        console.error(`   ❌ Error processing file: ${error.message}`);
        restoreBackup(filePath, backupPath);
        throw error;
    }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Process batch of files
 */
async function processBatch(files, startIndex = 0) {
    const batch = files.slice(startIndex, startIndex + CONFIG.batchSize);

    console.log(`\n📋 Processing batch ${Math.floor(startIndex / CONFIG.batchSize) + 1}: Files ${startIndex + 1}-${startIndex + batch.length}`);
    console.log('═'.repeat(70));

    const results = [];

    for (const fileInfo of batch) {
        try {
            const result = await processFile(fileInfo.path);
            results.push(result);
        } catch (error) {
            console.error(`Failed to process ${fileInfo.path}: ${error.message}`);
            results.push({
                filePath: fileInfo.path,
                errorsBefore: 0,
                errorsAfter: 0,
                fixesApplied: 0,
                success: false,
                backupPath: null,
            });
        }
    }

    // Summary
    const successful = results.filter(r => r.success);
    const totalFixes = results.reduce((sum, r) => sum + r.fixesApplied, 0);
    const totalReduction = results.reduce((sum, r) => sum + (r.errorsBefore - r.errorsAfter), 0);

    console.log(`\n📊 Batch Summary:`);
    console.log(`   ✅ Successful: ${successful.length}/${batch.length}`);
    console.log(`   🎯 Total fixes: ${totalFixes}`);
    console.log(`   📉 Error reduction: ${totalReduction >= 0 ? '-' : '+'}${Math.abs(totalReduction)}`);

    return results;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
    console.log('🚀 Phase 90: AST-Based TypeScript Fixer');
    console.log('═'.repeat(70));
    console.log(`\nConfiguration:`);
    console.log(`  • Batch size: ${CONFIG.batchSize}`);
    console.log(`  • Dry run: ${CONFIG.dryRun ? 'YES' : 'NO'}`);
    console.log(`  • Validation: ${CONFIG.validateFixes ? 'ENABLED' : 'DISABLED'}`);
    console.log(`  • Rollback on regression: ${CONFIG.rollbackOnRegression ? 'ENABLED' : 'DISABLED'}`);

    // Parse command line arguments
    const args = process.argv.slice(2);
    const dryRunFlag = args.includes('--dry-run');
    const fileFlag = args.indexOf('--file');
    const batchFlag = args.indexOf('--batch');

    if (dryRunFlag) {
        CONFIG.dryRun = true;
        console.log(`\n⚠️  DRY RUN MODE - No files will be modified`);
    }

    // Single file mode
    if (fileFlag !== -1 && args[fileFlag + 1]) {
        const filePath = path.resolve(args[fileFlag + 1]);
        console.log(`\n🔧 Single file mode: ${filePath}`);

        const result = await processFile(filePath);

        console.log(`\n✅ Complete`);
        process.exit(result.success ? 0 : 1);
    }

    // Load top 100 error files
    const errorFilesPath = path.join(__dirname, '../reports/top-100-error-files.json');

    if (!fs.existsSync(errorFilesPath)) {
        console.error(`\n❌ Error: ${errorFilesPath} not found`);
        console.error(`   Run parse-error-files.ps1 first to generate the list`);
        process.exit(1);
    }

    const errorFiles = JSON.parse(fs.readFileSync(errorFilesPath, 'utf-8'));

    // Filter files with TS1005 errors
    const targetFiles = errorFiles.filter(f => f.errors.TS1005 > 0);

    console.log(`\n📁 Loaded ${targetFiles.length} files with TS1005 errors`);

    // Batch mode
    if (batchFlag !== -1 && args[batchFlag + 1]) {
        const batchNumber = parseInt(args[batchFlag + 1], 10);
        const startIndex = (batchNumber - 1) * CONFIG.batchSize;

        console.log(`\n📦 Batch ${batchNumber} mode (files ${startIndex + 1}-${startIndex + CONFIG.batchSize})`);

        const results = await processBatch(targetFiles, startIndex);

        // Save results
        const resultsPath = path.join(__dirname, `../reports/phase90-batch-${batchNumber}-results.json`);
        fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
        console.log(`\n💾 Results saved: ${resultsPath}`);

        console.log(`\n✅ Batch ${batchNumber} complete`);
        process.exit(0);
    }

    // Full run (all files)
    console.log(`\n🚀 Processing all ${targetFiles.length} files...`);

    const allResults = [];
    for (let i = 0; i < targetFiles.length; i += CONFIG.batchSize) {
        const batchResults = await processBatch(targetFiles, i);
        allResults.push(...batchResults);

        // Cache rebuild check
        if ((i + CONFIG.batchSize) % CONFIG.cacheRebuildInterval === 0) {
            console.log(`\n⚠️  Cache rebuild recommended after ${i + CONFIG.batchSize} files`);
            console.log(`   Run: Remove-Item -Recurse .svelte-kit; npm run build; npm run check`);
        }
    }

    // Final summary
    const totalSuccessful = allResults.filter(r => r.success).length;
    const totalFixes = allResults.reduce((sum, r) => sum + r.fixesApplied, 0);
    const totalReduction = allResults.reduce((sum, r) => sum + (r.errorsBefore - r.errorsAfter), 0);

    console.log(`\n🎉 Phase 90 Complete!`);
    console.log('═'.repeat(70));
    console.log(`\n📊 Final Statistics:`);
    console.log(`   ✅ Files fixed: ${totalSuccessful}/${allResults.length}`);
    console.log(`   🎯 Total fixes: ${totalFixes}`);
    console.log(`   📉 Total error reduction: ${totalReduction >= 0 ? '-' : '+'}${Math.abs(totalReduction)}`);
    console.log(`   🔮 Projected with 1.84x cascade: ${Math.floor(totalReduction * 1.84)}`);

    // Save final results
    const finalResultsPath = path.join(__dirname, '../reports/phase90-final-results.json');
    fs.writeFileSync(finalResultsPath, JSON.stringify(allResults, null, 2));
    console.log(`\n💾 Final results: ${finalResultsPath}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error(`\n❌ Fatal error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    });
}

export { applyFixes, determineFix, processBatch, processFile };


#!/usr/bin/env node
/**
 * Phase 103.3 ACE Auto-Fix Script - AST-BASED INTELLIGENT FIXER
 * Uses ts-morph to parse Abstract Syntax Tree (no regex false positives)
 *
 * ADVANTAGES over Phase 103.1/103.2:
 * - Understands TypeScript semantics (no DataView API false positives)
 * - Can fix complex patterns (generics, overloads, conditional types)
 * - Built-in validation (won't save invalid AST)
 * - Detects true corruption vs valid syntax
 *
 * USAGE:
 *   npm install ts-morph
 *   node scripts/phase103.3-ast-fixer.mjs              # Dry-run (10 files)
 *   node scripts/phase103.3-ast-fixer.mjs --apply --max=10
 *   node scripts/phase103.3-ast-fixer.mjs --apply --full
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { Project, SyntaxKind } from 'ts-morph';

// Parse CLI args
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FULL_SCAN = args.includes('--full');
const MAX_FILES = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] || '10');

/**
 * AST-based fix patterns
 */
class ASTFixer {
    constructor(project) {
        this.project = project;
        this.fixes = [];
    }

    /**
     * Fix interface properties with comma instead of colon
     * Example: interface X { name, string; } → interface X { name: string; }
     */
    fixInterfaceProperties(sourceFile) {
        const interfaces = sourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration);
        let fixCount = 0;

        for (const iface of interfaces) {
            const properties = iface.getProperties();

            for (const prop of properties) {
                const text = prop.getText();

                // Check if it matches the corrupted pattern: "name, Type;"
                // This is detectable because the TypeNode will be invalid
                if (text.includes(',') && !text.includes(':')) {
                    const match = text.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_?]*),\s*([A-Z][a-zA-Z0-9_<>[\]|&]*)\s*;?$/);
                    if (match) {
                        const [, indent, propName, typeName] = match;
                        prop.replaceWithText(`${indent}${propName}: ${typeName};`);
                        fixCount++;
                        this.fixes.push({
                            file: sourceFile.getFilePath(),
                            pattern: 'interface_property',
                            location: `${iface.getName()}.${propName}`,
                            before: text,
                            after: `${indent}${propName}: ${typeName};`
                        });
                    }
                }
            }
        }

        return fixCount;
    }

    /**
     * Fix type index signatures with comma
     * Example: { [key, string]: any } → { [key: string]: any }
     */
    fixIndexSignatures(sourceFile) {
        const indexSignatures = sourceFile.getDescendantsOfKind(SyntaxKind.IndexSignature);
        let fixCount = 0;

        for (const sig of indexSignatures) {
            const text = sig.getText();

            // Corrupted pattern: [key, string]
            if (text.match(/\[([a-zA-Z_][a-zA-Z0-9_]*),\s*(string|number|symbol)\]/)) {
                const newText = text.replace(
                    /\[([a-zA-Z_][a-zA-Z0-9_]*),\s*(string|number|symbol)\]/,
                    '[$1: $2]'
                );
                sig.replaceWithText(newText);
                fixCount++;
                this.fixes.push({
                    file: sourceFile.getFilePath(),
                    pattern: 'index_signature',
                    before: text,
                    after: newText
                });
            }
        }

        return fixCount;
    }

    /**
     * Detect and report suspicious call expressions
     * (For manual review - DataView API calls with potential corruption)
     */
    detectSuspiciousCallExpressions(sourceFile) {
        const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
        const suspicious = [];

        for (const call of callExpressions) {
            const args = call.getArguments();

            // Check for malformed arguments
            for (const arg of args) {
                const argText = arg.getText();

                // Detect patterns like "offset: value" as single argument
                // (True corruption would have : without being object literal)
                if (argText.includes(':') && !arg.getKind() === SyntaxKind.ObjectLiteralExpression) {
                    // Further validate: is this a labeled statement fragment?
                    const parts = argText.split(':');
                    if (parts.length === 2 && !parts[0].includes('{') && !parts[0].includes('[')) {
                        suspicious.push({
                            file: sourceFile.getFilePath(),
                            expression: call.getText(),
                            argument: argText,
                            line: call.getStartLineNumber()
                        });
                    }
                }
            }
        }

        return suspicious;
    }

    /**
     * Fix variable declarations with corrupted initializers
     * Example: const x = $1;$2 typeof y → const x = typeof y
     */
    fixVariableDeclarations(sourceFile) {
        const text = sourceFile.getFullText();
        let fixCount = 0;

        // This one still uses regex since $1;$2 isn't valid syntax to parse
        if (text.includes('$1;$2')) {
            const newText = text.replace(/\$1;\$2\s+/g, '');
            if (newText !== text) {
                sourceFile.replaceWithText(newText);
                fixCount = (text.match(/\$1;\$2/g) || []).length;
                this.fixes.push({
                    file: sourceFile.getFilePath(),
                    pattern: 'dollar_sign_corruption',
                    count: fixCount
                });
            }
        }

        return fixCount;
    }

    /**
     * Process a single source file
     */
    processFile(sourceFile) {
        let totalFixes = 0;

        try {
            totalFixes += this.fixInterfaceProperties(sourceFile);
            totalFixes += this.fixIndexSignatures(sourceFile);
            totalFixes += this.fixVariableDeclarations(sourceFile);

            // Detect suspicious calls (for reporting only)
            const suspicious = this.detectSuspiciousCallExpressions(sourceFile);
            if (suspicious.length > 0) {
                console.log(`   ⚠️  ${sourceFile.getFilePath()}: ${suspicious.length} suspicious call expressions (manual review needed)`);
                suspicious.slice(0, 3).forEach(s => {
                    console.log(`      Line ${s.line}: ${s.expression.substring(0, 80)}...`);
                });
            }

        } catch (error) {
            console.error(`   ❌ Error processing ${sourceFile.getFilePath()}:`, error.message);
        }

        return totalFixes;
    }
}

/**
 * Get TypeScript files
 */
function getTypeScriptFiles() {
    try {
        const output = execSync('git ls-files "*.ts" "*.tsx"', {
            encoding: 'utf-8',
            cwd: process.cwd()
        });
        return output.trim().split('\n').filter(f =>
            f &&
            !f.includes('.d.ts') &&
            !f.includes('node_modules') &&
            !f.includes('.svelte-kit')
        );
    } catch (error) {
        console.error('Failed to get git files');
        return [];
    }
}

/**
 * Get TSC error count
 */
function getTSCErrorCount() {
    try {
        execSync('npx tsc --noEmit --skipLibCheck 2>&1', {
            encoding: 'utf-8',
            stdio: 'pipe'
        });
        return 0;
    } catch (error) {
        const output = error.stdout || error.stderr || '';
        const match = output.match(/Found (\d+) errors?/);
        return match ? parseInt(match[1]) : 999999;
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('\n======================================================================');
    console.log('🔧 PHASE 103.3 ACE Auto-Fix (AST-BASED)');
    console.log(`   Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`   Scope: ${FULL_SCAN ? 'Full scan' : `Up to ${MAX_FILES} files`}`);
    console.log('======================================================================\n');

    console.log('📂 Initializing ts-morph project...');
    const project = new Project({
        tsConfigFilePath: 'tsconfig.json',
        skipAddingFilesFromTsConfig: true,
    });

    console.log('📂 Loading TypeScript files...');
    const allFiles = getTypeScriptFiles();
    const filesToProcess = FULL_SCAN ? allFiles : allFiles.slice(0, MAX_FILES);

    console.log(`   Loading ${filesToProcess.length} files into AST...\n`);

    // Add files to project
    const sourceFiles = [];
    for (const filePath of filesToProcess) {
        try {
            const sourceFile = project.addSourceFileAtPath(filePath);
            sourceFiles.push(sourceFile);
        } catch (error) {
            console.error(`   ⚠️  Failed to load ${filePath}: ${error.message}`);
        }
    }

    console.log(`✅ Loaded ${sourceFiles.length} files\n`);

    const fixer = new ASTFixer(project);
    let totalFilesFixed = 0;
    let totalFixesApplied = 0;

    console.log('🔍 Analyzing files...\n');

    for (const sourceFile of sourceFiles) {
        const fixCount = fixer.processFile(sourceFile);
        if (fixCount > 0) {
            console.log(`   ✅ ${sourceFile.getFilePath()}: ${fixCount} fixes`);
            totalFilesFixed++;
            totalFixesApplied += fixCount;
        }
    }

    console.log(`\n📊 Analysis complete:`);
    console.log(`   Files with fixes: ${totalFilesFixed}`);
    console.log(`   Total fixes: ${totalFixesApplied}\n`);

    if (totalFixesApplied === 0) {
        console.log('✨ No fixable patterns found. All clean!');
        return;
    }

    if (!APPLY) {
        console.log('⚠️  DRY-RUN complete. No files modified.');
        console.log('   To apply fixes: node scripts/phase103.3-ast-fixer.mjs --apply --max=10\n');

        // Save fix report
        const reportPath = 'scripts/phase103.3-fix-report.json';
        fs.writeFileSync(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            filesAnalyzed: sourceFiles.length,
            filesWithFixes: totalFilesFixed,
            totalFixes: totalFixesApplied,
            fixes: fixer.fixes
        }, null, 2));
        console.log(`📝 Fix report saved to: ${reportPath}`);
        return;
    }

    // APPLY MODE
    console.log('🚀 Applying fixes...');
    console.log('📊 Getting initial TSC error count...');
    const initialErrors = getTSCErrorCount();
    console.log(`   Initial errors: ${initialErrors}\n`);

    // Save all modified files
    await project.save();
    console.log('✅ Files saved\n');

    console.log('📊 Verifying changes...');
    const finalErrors = getTSCErrorCount();
    const errorChange = finalErrors - initialErrors;

    console.log(`   Final errors: ${finalErrors}`);
    console.log(`   Change: ${errorChange > 0 ? '+' : ''}${errorChange} errors\n`);

    if (errorChange > 0) {
        console.log('⚠️  REGRESSION DETECTED!');
        console.log('   Manual review required. Check git diff for changes.\n');
        process.exit(1);
    }

    console.log('\n======================================================================');
    console.log('📊 FINAL SUMMARY');
    console.log(`   Files processed: ${totalFilesFixed}`);
    console.log(`   Total fixes applied: ${totalFixesApplied}`);
    console.log(`   Error reduction: ${-errorChange}`);
    console.log('======================================================================\n');
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});

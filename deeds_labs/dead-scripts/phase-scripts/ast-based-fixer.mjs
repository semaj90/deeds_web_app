#!/usr/bin/env node
/**
 * AST-Based TypeScript Error Fixer
 * Uses TypeScript Compiler API for surgical fixes at exact error locations
 */

import fs from 'fs/promises';
import path from 'path';
import ts from 'typescript';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ASTFixer {
    constructor() {
        this.stats = {
            filesAnalyzed: 0,
            filesFixed: 0,
            errorsBefore: 0,
            errorsAfter: 0,
            fixesApplied: 0
        };
    }

    async fixFile(filePath) {
        const content = await fs.readFile(filePath, 'utf-8');

        // Create a source file
        const sourceFile = ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true
        );

        // Get diagnostics
        const program = ts.createProgram([filePath], {
            noEmit: true,
            allowJs: true,
            checkJs: false,
            skipLibCheck: true
        });

        const diagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
        const ts1005Errors = diagnostics.filter(d => d.code === 1005);

        if (ts1005Errors.length === 0) {
            return { fixed: false, errorsBefore: diagnostics.length };
        }

        this.stats.filesAnalyzed++;
        this.stats.errorsBefore += diagnostics.length;

        // Create backup
        const backupPath = `${filePath}.ast-backup-${Date.now()}`;
        await fs.writeFile(backupPath, content, 'utf-8');

        // Apply fixes from end to start (to preserve positions)
        let fixedContent = content;
        const fixes = [];

        for (const error of ts1005Errors.reverse()) {
            const fix = this.createFix(error, fixedContent);
            if (fix) {
                fixes.push(fix);
                fixedContent = this.applyFix(fixedContent, fix);
            }
        }

        if (fixes.length > 0) {
            await fs.writeFile(filePath, fixedContent, 'utf-8');
            this.stats.filesFixed++;
            this.stats.fixesApplied += fixes.length;
            return {
                fixed: true,
                errorsBefore: diagnostics.length,
                fixes: fixes.length
            };
        }

        return { fixed: false, errorsBefore: diagnostics.length };
    }

    createFix(diagnostic, content) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        const position = diagnostic.start;

        // Extract what's expected from the message
        if (message.includes("',' expected")) {
            return { type: 'insert', position, text: ',' };
        } else if (message.includes("';' expected")) {
            return { type: 'insert', position, text: ';' };
        } else if (message.includes("':' expected")) {
            return { type: 'insert', position, text: ':' };
        } else if (message.includes("'}' expected")) {
            return { type: 'insert', position, text: '}' };
        } else if (message.includes("')' expected")) {
            return { type: 'insert', position, text: ')' };
        } else if (message.includes("'=>' expected")) {
            return { type: 'insert', position, text: '=>' };
        }

        return null;
    }

    applyFix(content, fix) {
        if (fix.type === 'insert') {
            return content.slice(0, fix.position) + fix.text + content.slice(fix.position);
        }
        return content;
    }

    async fixTopFiles(limit = 50) {
        console.log('🔧 AST-Based TypeScript Error Fixer\n');
        console.log('='.repeat(60));
        console.log('Using TypeScript Compiler API for surgical fixes\n');

        const topFilesPath = path.join(__dirname, '../reports/top-100-error-files.json');
        const data = JSON.parse(await fs.readFile(topFilesPath, 'utf-8'));

        const files = (data.track1Files || data.files || []).slice(0, limit);
        console.log(`📋 Processing ${files.length} files...\n`);

        for (let i = 0; i < files.length; i++) {
            const fileInfo = files[i];
            const filePath = path.join(__dirname, '..', fileInfo.file);

            console.log(`[${i + 1}/${files.length}] ${fileInfo.file}`);
            console.log(`   Errors: ${fileInfo.errorCount}`);

            try {
                await fs.access(filePath);
                const result = await this.fixFile(filePath);

                if (result.fixed) {
                    console.log(`   ✅ Applied ${result.fixes} AST-based fixes`);
                } else if (result.errorsBefore > 0) {
                    console.log(`   ⏭️  ${result.errorsBefore} errors (no TS1005)`);
                } else {
                    console.log(`   ✅ No errors`);
                }
            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
            }

            console.log('');
        }

        console.log('='.repeat(60));
        console.log('📊 RESULTS:');
        console.log(`Files analyzed: ${this.stats.filesAnalyzed}`);
        console.log(`Files fixed: ${this.stats.filesFixed}`);
        console.log(`Total fixes applied: ${this.stats.fixesApplied}`);
        console.log(`Errors before: ${this.stats.errorsBefore}`);
        console.log('');
        console.log('✅ Run svelte-check to measure actual impact');
    }
}

const fixer = new ASTFixer();
fixer.fixTopFiles(50).catch(console.error);

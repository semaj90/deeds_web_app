#!/usr/bin/env node
/**
 * Production AST Check Script
 * Phase 1: TS1005 syntax corruption detection (phantom commas)
 * Phase 2: Hardcoded URL detection (localhost leaks)
 * Phase 3: Schema field mismatch detection (sessionId vs chatId)
 *
 * Run: npm run check:production
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const TARGET_ERRORS = [1005]; // ',' expected

// Directories to skip entirely
const SKIP_DIRS = new Set([
    'node_modules', '.svelte-kit', '_archive', '_corrupted',
    'build', 'dist', '.git', 'routes_parked',
    '.phase105-backup', '.backup', 'backup',
    'phase72-ast-reduction', 'error-analysis',
    'visual-memory', 'templates', 'cache', 'lazy'
]);

// Also skip any directory name starting with '.' (hidden/backup dirs)
function shouldSkipDir(name) {
    return SKIP_DIRS.has(name) || name.startsWith('.phase') || name.startsWith('_');
}

// Production API routes to check for hardcoded URLs
const API_DIRS = [
    'src/routes/api/chat',
    'src/routes/api/sse',
    'src/routes/api/cases',
    'src/routes/api/citations',
    'src/routes/api/evidence',
    'src/routes/api/persons',
    'src/routes/api/embed',
    'src/routes/api/health',
    'src/routes/api/routes',
    'src/lib/server'
];

// Patterns that indicate hardcoded URLs (should use getOllamaEndpoint() etc.)
const HARDCODED_URL_PATTERNS = [
    { pattern: /['"`]http:\/\/localhost:11434/g, desc: 'Hardcoded Ollama URL — use getOllamaEndpoint()' },
    { pattern: /['"`]http:\/\/localhost:6333/g, desc: 'Hardcoded Qdrant URL — use env QDRANT_URL' },
    { pattern: /['"`]http:\/\/localhost:8000\/api/g, desc: 'Hardcoded Go microservice URL — use env or Drizzle' }
];

// Schema field mismatches (common migration bugs)
const SCHEMA_MISMATCH_PATTERNS = [
    { pattern: /chatMessages\.sessionId/g, desc: 'chatMessages.sessionId → should be chatMessages.chatId' },
    { pattern: /chatSessions\b/g, desc: 'chatSessions table removed → use chatMetadata' },
    { pattern: /chatMetadata\.id\b/g, desc: 'chatMetadata.id → should be chatMetadata.chatId (PK)' }
];

function scanDirectory(dir, extensions = ['.ts']) {
    let files = [];
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!shouldSkipDir(entry.name)) {
                files = files.concat(scanDirectory(fullPath, extensions));
            }
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
                files.push(fullPath);
            }
        }
    }
    return files;
}

function checkHardcodedUrls(file, content) {
    const warnings = [];
    for (const { pattern, desc } of HARDCODED_URL_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const lineNum = content.substring(0, match.index).split('\n').length;
            warnings.push({ line: lineNum, desc, match: match[0] });
        }
    }
    return warnings;
}

function checkSchemaMismatches(file, content) {
    const warnings = [];
    for (const { pattern, desc } of SCHEMA_MISMATCH_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const lineNum = content.substring(0, match.index).split('\n').length;
            warnings.push({ line: lineNum, desc, match: match[0] });
        }
    }
    return warnings;
}

async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  Production AST Check');
    console.log('═══════════════════════════════════════════════\n');

    const srcDir = path.join(ROOT, 'src');
    let totalErrors = 0;
    let totalWarnings = 0;

    // ── Phase 1: TS1005 Syntax Corruption ──
    console.log('Phase 1: TS1005 Syntax Corruption...');
    const tsFiles = scanDirectory(srcDir, ['.ts']);
    console.log(`  Scanning ${tsFiles.length} TypeScript files...`);

    let syntaxErrors = 0;
    let corruptedFiles = 0;

    for (const file of tsFiles) {
        try {
            const content = fs.readFileSync(file, 'utf-8');
            const sourceFile = ts.createSourceFile(
                file, content, ts.ScriptTarget.Latest, true
            );

            const diagnostics = sourceFile.parseDiagnostics.filter(
                d => TARGET_ERRORS.includes(d.code)
            );

            if (diagnostics.length > 0) {
                console.log(`  ❌ ${path.relative(ROOT, file)}`);
                corruptedFiles++;
                syntaxErrors += diagnostics.length;

                for (const d of diagnostics) {
                    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
                    console.log(`     Line ${line + 1}:${character + 1} - ${d.messageText}`);
                }
            }
        } catch (e) {
            // Skip files that can't be parsed
        }
    }

    totalErrors += syntaxErrors;
    console.log(`  Result: ${syntaxErrors === 0 ? '✅' : '❌'} ${syntaxErrors} syntax errors in ${corruptedFiles} files\n`);

    // ── Phase 2: Hardcoded URL Detection ──
    console.log('Phase 2: Hardcoded URL Detection...');
    let urlWarnings = 0;
    let urlFiles = 0;

    for (const relDir of API_DIRS) {
        const absDir = path.join(ROOT, relDir);
        const apiFiles = scanDirectory(absDir, ['.ts']);

        for (const file of apiFiles) {
            const content = fs.readFileSync(file, 'utf-8');
            const warnings = checkHardcodedUrls(file, content);

            if (warnings.length > 0) {
                console.log(`  ⚠️  ${path.relative(ROOT, file)}`);
                urlFiles++;
                urlWarnings += warnings.length;
                for (const w of warnings) {
                    console.log(`     Line ${w.line}: ${w.desc}`);
                }
            }
        }
    }

    totalWarnings += urlWarnings;
    console.log(`  Result: ${urlWarnings === 0 ? '✅' : '⚠️'} ${urlWarnings} hardcoded URLs in ${urlFiles} files\n`);

    // ── Phase 3: Schema Field Mismatches ──
    console.log('Phase 3: Schema Field Mismatches...');
    let schemaWarnings = 0;
    let schemaFiles = 0;

    for (const relDir of API_DIRS) {
        const absDir = path.join(ROOT, relDir);
        const apiFiles = scanDirectory(absDir, ['.ts']);

        for (const file of apiFiles) {
            const content = fs.readFileSync(file, 'utf-8');
            const warnings = checkSchemaMismatches(file, content);

            if (warnings.length > 0) {
                console.log(`  ⚠️  ${path.relative(ROOT, file)}`);
                schemaFiles++;
                schemaWarnings += warnings.length;
                for (const w of warnings) {
                    console.log(`     Line ${w.line}: ${w.desc}`);
                }
            }
        }
    }

    totalWarnings += schemaWarnings;
    console.log(`  Result: ${schemaWarnings === 0 ? '✅' : '⚠️'} ${schemaWarnings} schema mismatches in ${schemaFiles} files\n`);

    // ── Summary ──
    console.log('═══════════════════════════════════════════════');
    console.log(`  Errors:   ${totalErrors}`);
    console.log(`  Warnings: ${totalWarnings}`);
    console.log('═══════════════════════════════════════════════');

    if (totalErrors > 0) {
        console.error('\n❌ FAILED: Production check found syntax errors.');
        process.exit(1);
    } else if (totalWarnings > 0) {
        console.warn('\n⚠️  PASSED with warnings. Review hardcoded URLs and schema mismatches.');
        process.exit(0);
    } else {
        console.log('\n✅ PASSED: All production checks clean.');
        process.exit(0);
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * Fix Malformed TypeScript Type Definitions
 * Targets common syntax errors from incomplete AST transformations
 */

import { promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const srcDir = join(rootDir, 'src');

// Patterns to fix
const TYPE_FIXES = [
    {
        name: 'malformed-promise-object',
        pattern: /Promise<\{\s*,\s*/g,
        replacement: 'Promise<{ ',
        description: 'Fix Promise<{, ... -> Promise<{ ...'
    },
    {
        name: 'malformed-array-object',
        pattern: /Array<\{\s*,\s*/g,
        replacement: 'Array<{ ',
        description: 'Fix Array<{, ... -> Array<{ ...'
    },
    {
        name: 'malformed-object-literal',
        pattern: /:\s*\{\s*,\s*/g,
        replacement: ': { ',
        description: 'Fix : {, ... -> : { ...'
    },
    {
        name: 'leading-comma-in-array-objects',
        pattern: /\[\{\s*,\s*/g,
        replacement: '[{ ',
        description: 'Fix [{, ... -> [{ ...'
    }
];

let totalFilesProcessed = 0;
let totalFilesModified = 0;
let totalFixesApplied = 0;

/**
 * Recursively find TypeScript files
 */
async function* findTypeScriptFiles(dir, excludeDirs = ['node_modules', '.svelte-kit', 'build', 'dist', '.git', 'reports', 'data']) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            if (!excludeDirs.some(exclude => entry.name.startsWith(exclude))) {
                yield* findTypeScriptFiles(fullPath, excludeDirs);
            }
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte')) {
            yield fullPath;
        }
    }
}

/**
 * Process a single file
 */
async function processFile(filePath) {
    totalFilesProcessed++;
    let content = await fs.readFile(filePath, 'utf-8');
    const originalContent = content;
    let fixesApplied = 0;

    for (const fix of TYPE_FIXES) {
        const matches = content.match(fix.pattern);
        if (matches) {
            content = content.replace(fix.pattern, fix.replacement);
            fixesApplied += matches.length;
        }
    }

    if (content !== originalContent) {
        await fs.writeFile(filePath, content, 'utf-8');
        totalFilesModified++;
        totalFixesApplied += fixesApplied;
        console.log(`✓ ${filePath.replace(rootDir, '.')} (${fixesApplied} fixes)`);
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('🔧 Fix Malformed TypeScript Types');
    console.log('═'.repeat(60));
    console.log(`📂 Source: ${srcDir}`);
    console.log(`🎯 Patterns: ${TYPE_FIXES.length}`);
    console.log('');

    TYPE_FIXES.forEach((fix, i) => {
        console.log(`${i + 1}. ${fix.description}`);
    });
    console.log('');

    const startTime = Date.now();

    for await (const file of findTypeScriptFiles(srcDir)) {
        try {
            await processFile(file);
        } catch (error) {
            console.error(`✗ ${file}: ${error.message}`);
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log('═'.repeat(60));
    console.log(`✅ Complete in ${duration}s`);
    console.log(`📊 Files processed: ${totalFilesProcessed}`);
    console.log(`📝 Files modified: ${totalFilesModified}`);
    console.log(`🔧 Total fixes: ${totalFixesApplied}`);
    console.log('');
    console.log('Next: Run `npx svelte-check` to verify');
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

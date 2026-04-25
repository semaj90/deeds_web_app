#!/usr/bin/env node
/**
 * Phase 103: Fix Complex $props() Patterns
 * Targets common TypeScript errors in $props() destructuring
 * Focus areas:
 * - TS1005: Missing commas
 * - TS1109: Missing default values
 * - TS1128: Invalid semicolons
 * - TS1131: Invalid property syntax
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const stats = {
    filesScanned: 0,
    filesModified: 0,
    patternsFixed: 0,
    errors: 0
};

// Common $props() error patterns
const PROPS_PATTERNS = [
    // Fix: Missing comma in destructuring (TS1005)
    {
        name: 'missing-comma-in-destructuring',
        pattern: /\{\s*(\w+)\s*=\s*([^,}\n]+)\s+(\w+)\s*=\s*/g,
        replacement: '{ $1 = $2, $3 = ',
        test: (content) => /\{\s*\w+\s*=\s*[^,}\n]+\s+\w+\s*=\s*/.test(content)
    },

    // Fix: Missing default value (TS1109)
    {
        name: 'missing-default-value',
        pattern: /(\w+)\s*=\s*,/g,
        replacement: '$1 = undefined,',
        test: (content) => /\w+\s*=\s*,/.test(content)
    },

    // Fix: Semicolon instead of comma in destructuring (TS1128)
    {
        name: 'semicolon-in-destructuring',
        pattern: /\{\s*([^}]+);(\s*\.\.\.|\s*\w+)/g,
        replacement: '{ $1,$2',
        test: (content) => /\{[^}]+;(\s*\.\.\.|\s*\w+)/.test(content)
    },

    // Fix: Invalid rest spread syntax
    {
        name: 'invalid-rest-spread',
        pattern: /\.\.\.\s*(\w+);/g,
        replacement: '...$1',
        test: (content) => /\.\.\.\s*\w+;/.test(content)
    },

    // Fix: Colon chain in destructuring (a: b: c → a: b, c)
    {
        name: 'colon-chain-destructuring',
        pattern: /\{\s*(\w+):\s*(\w+):\s*(\w+)\s*\}/g,
        replacement: '{ $1: $2, $3 }',
        test: (content) => /\{\s*\w+:\s*\w+:\s*\w+\s*\}/.test(content)
    },

    // Fix: Type annotation in wrong position
    {
        name: 'misplaced-type-annotation',
        pattern: /\{\s*(\w+)\s*:\s*([A-Z]\w+)\s*=\s*([^,}]+)\s*\}/g,
        replacement: '{ $1 = $3 }: { $1?: $2 }',
        test: (content) => /\{\s*\w+\s*:\s*[A-Z]\w+\s*=\s*[^,}]+\s*\}/.test(content)
    },

    // Fix: Empty object in destructuring
    {
        name: 'empty-object-default',
        pattern: /(\w+)\s*=\s*\{\s*\}/g,
        replacement: '$1 = {}',
        test: (content) => /\w+\s*=\s*\{\s*\}/.test(content)
    },

    // Fix: Missing type annotation on $props with complex types
    {
        name: 'add-type-annotation',
        pattern: /let\s*\{\s*([^}]+)\s*\}\s*=\s*\$props\(\);/g,
        replacement: (match, destructure) => {
            // Only add type if it doesn't already have one
            if (match.includes('}: ') || match.includes('>')) {
                return match;
            }
            return `let { ${destructure} }: Record<string, any> = $props();`;
        },
        test: (content) => /let\s*\{[^}]+\}\s*=\s*\$props\(\);/.test(content) &&
                           !/let\s*\{[^}]+\}\s*:\s*\{/.test(content)
    }
];

/**
 * Check if file needs processing
 */
function needsProcessing(content) {
    return content.includes('$props()') ||
           content.includes('export let') ||
           /let\s*\{[^}]+\}/.test(content);
}

/**
 * Apply pattern fixes to content
 */
function applyPatternFixes(content) {
    let modified = content;
    let fixCount = 0;

    for (const pattern of PROPS_PATTERNS) {
        if (pattern.test(modified)) {
            const before = modified;

            if (typeof pattern.replacement === 'function') {
                modified = modified.replace(pattern.pattern, pattern.replacement);
            } else {
                modified = modified.replace(pattern.pattern, pattern.replacement);
            }

            if (before !== modified) {
                fixCount++;
                if (process.env.VERBOSE) {
                    console.log(`  Applied fix: ${pattern.name}`);
                }
            }
        }
    }

    return { content: modified, fixCount };
}

/**
 * Process a single file
 */
async function processFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');

        if (!needsProcessing(content)) {
            return { modified: false };
        }

        const { content: fixed, fixCount } = applyPatternFixes(content);

        if (fixCount > 0) {
            await fs.writeFile(filePath, fixed, 'utf-8');
            stats.patternsFixed += fixCount;
            return { modified: true, fixCount };
        }

        return { modified: false };
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        stats.errors++;
        return { modified: false, error: error.message };
    }
}

/**
 * Find all Svelte and TypeScript files
 */
async function* findFiles(dir, extensions = ['.svelte', '.ts']) {
    const excludeDirs = [
        'node_modules',
        '.svelte-kit',
        'build',
        'dist',
        '.git',
        'reports',
        'data',
        'src.backup',
        'src_fixed',
        'temp',
        'routes_parked'
    ];

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (!excludeDirs.includes(entry.name)) {
                yield* findFiles(fullPath, extensions);
            }
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
                yield fullPath;
            }
        }
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('🔧 Phase 103: Fix Complex $props() Patterns\n');

    const startTime = Date.now();
    const modifiedFiles = [];

    // Process files
    for await (const filePath of findFiles(projectRoot)) {
        stats.filesScanned++;

        const result = await processFile(filePath);

        if (result.modified) {
            stats.filesModified++;
            modifiedFiles.push({
                path: path.relative(projectRoot, filePath),
                fixes: result.fixCount
            });
            console.log(`✅ Updated: ${path.relative(projectRoot, filePath)} (${result.fixCount} fixes)`);
        }

        // Progress indicator every 100 files
        if (stats.filesScanned % 100 === 0) {
            process.stdout.write(`\rScanned ${stats.filesScanned} files...`);
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n\n============================================================');
    console.log('📊 Phase 103 Statistics');
    console.log('============================================================');
    console.log(`Files scanned:       ${stats.filesScanned}`);
    console.log(`Files modified:      ${stats.filesModified}`);
    console.log(`Patterns fixed:      ${stats.patternsFixed}`);
    console.log(`Errors:              ${stats.errors}`);
    console.log(`Duration:            ${duration}s`);
    console.log('============================================================\n');

    if (stats.filesModified > 0) {
        console.log('✅ $props() patterns successfully fixed!\n');
        console.log('Next steps:');
        console.log('1. Run: npx svelte-check --threshold error');
        console.log('2. Validate error count reduction');
        console.log('3. Test components');
    } else {
        console.log('ℹ️  No files needed modification');
    }
}

main().catch(console.error);

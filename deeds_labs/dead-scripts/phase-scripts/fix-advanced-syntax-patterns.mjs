#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

/**
 * Advanced syntax patterns for TypeScript/Svelte error fixing
 * Targeting TS1005 (missing commas), TS1128 (statements), TS1109 (expressions), TS1131 (signatures)
 */
const ADVANCED_PATTERNS = [
    // Pattern 1: Missing comma between object properties
    {
        name: 'missing-property-comma',
        pattern: /(\w+):\s*([^,}\n]+)\s+(\w+):\s*/g,
        replacement: (match, prop1, value1, prop2) => {
            // Only fix if value1 doesn't end with comma or semicolon
            if (!/[,;]\s*$/.test(value1)) {
                return `${prop1}: ${value1}, ${prop2}: `;
            }
            return match;
        },
        description: 'Fix: prop1: value prop2: → prop1: value, prop2:'
    },

    // Pattern 2: Semicolon instead of comma in parameter lists
    {
        name: 'semicolon-in-params',
        pattern: /\(([^)]*);([^)]*)\)/g,
        replacement: (match, before, after) => {
            // Only fix if we're in a parameter list (contains : for types)
            if (before.includes(':') && after.includes(':')) {
                return `(${before},${after})`;
            }
            return match;
        },
        description: 'Fix: (param1: Type; param2: Type) → (param1: Type, param2: Type)'
    },

    // Pattern 3: Missing default value assignment
    {
        name: 'missing-default-value',
        pattern: /(\w+)\s*=\s*,/g,
        replacement: '$1 = undefined,',
        description: 'Fix: prop = , → prop = undefined,'
    },

    // Pattern 4: Double comma artifacts
    {
        name: 'double-comma',
        pattern: /,\s*,/g,
        replacement: ',',
        description: 'Fix: ,, → ,'
    },

    // Pattern 5: Comma before closing brace/bracket
    {
        name: 'trailing-comma-fix',
        pattern: /,(\s*[}\]])/g,
        replacement: '$1',
        description: 'Fix: , } → }'
    },

    // Pattern 6: Missing type annotation colon
    {
        name: 'missing-type-colon',
        pattern: /(\w+)\s+(\w+)<([^>]+)>/g,
        replacement: (match, name, type, generic) => {
            // Only fix if type starts with capital (likely a type)
            if (/^[A-Z]/.test(type)) {
                return `${name}: ${type}<${generic}>`;
            }
            return match;
        },
        description: 'Fix: prop Promise<T> → prop: Promise<T>'
    },

    // Pattern 7: Invalid destructuring with semicolon
    {
        name: 'destructure-semicolon',
        pattern: /\{\s*(\w+)\s*;\s*(\w+)\s*\}/g,
        replacement: '{ $1, $2 }',
        description: 'Fix: { prop1; prop2 } → { prop1, prop2 }'
    },

    // Pattern 8: Missing comma in array types
    {
        name: 'array-type-comma',
        pattern: /\[([^\]]+)\s+([^\]]+)\]/g,
        replacement: (match, item1, item2) => {
            // Only fix if items don't already have comma
            if (!item1.includes(',') && !item2.includes(',')) {
                return `[${item1}, ${item2}]`;
            }
            return match;
        },
        description: 'Fix: [Type1 Type2] → [Type1, Type2]'
    }
];

const EXCLUDE_DIRS = [
    'node_modules',
    '.svelte-kit',
    'build',
    'dist',
    '.git',
    'reports',
    'data',
    'src.backup',
    'src_fixed',
    'temp'
];

async function* findTypeScriptFiles(dir, excludeDirs = EXCLUDE_DIRS) {
    const { readdir, stat } = await import('fs/promises');

    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                // Skip excluded directories
                if (excludeDirs.some(excluded => entry.name === excluded || entry.name.startsWith(excluded))) {
                    continue;
                }
                yield* findTypeScriptFiles(fullPath, excludeDirs);
            } else if (entry.isFile()) {
                // Process .ts, .svelte, .d.ts files
                if (/\.(ts|svelte|d\.ts)$/.test(entry.name)) {
                    yield fullPath;
                }
            }
        }
    } catch (error) {
        // Silently skip directories we can't read
    }
}

async function applyAdvancedPatterns(filePath) {
    let content = await readFile(filePath, 'utf-8');
    let modified = false;
    let fixCount = 0;

    for (const pattern of ADVANCED_PATTERNS) {
        const before = content;

        if (typeof pattern.replacement === 'function') {
            content = content.replace(pattern.pattern, (...args) => {
                fixCount++;
                modified = true;
                return pattern.replacement(...args);
            });
        } else {
            const matches = content.match(pattern.pattern);
            if (matches) {
                content = content.replace(pattern.pattern, pattern.replacement);
                fixCount += matches.length;
                modified = true;
            }
        }
    }

    if (modified) {
        await writeFile(filePath, content, 'utf-8');
        return fixCount;
    }

    return 0;
}

async function main() {
    console.log('🔧 Advanced TypeScript Syntax Fixer');
    console.log('═'.repeat(60));

    const sourceDir = join(PROJECT_ROOT, 'src');
    console.log(`📂 Source: ${sourceDir}`);
    console.log(`🎯 Patterns: ${ADVANCED_PATTERNS.length}\n`);

    // Display patterns
    ADVANCED_PATTERNS.forEach((p, i) => {
        console.log(`${i + 1}. ${p.description}`);
    });
    console.log();

    const startTime = Date.now();
    let filesProcessed = 0;
    let filesModified = 0;
    let totalFixes = 0;

    for await (const filePath of findTypeScriptFiles(sourceDir)) {
        filesProcessed++;
        const fixes = await applyAdvancedPatterns(filePath);

        if (fixes > 0) {
            filesModified++;
            totalFixes += fixes;
            const relPath = relative(PROJECT_ROOT, filePath);
            console.log(`✓ .\\${relPath} (${fixes} fixes)`);
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '═'.repeat(60));
    console.log(`✅ Complete in ${duration}s`);
    console.log(`📊 Files processed: ${filesProcessed}`);
    console.log(`📝 Files modified: ${filesModified}`);
    console.log(`🔧 Total fixes: ${totalFixes}`);
    console.log('\nNext: Run \`npx svelte-check\` to verify');
}

main().catch(console.error);

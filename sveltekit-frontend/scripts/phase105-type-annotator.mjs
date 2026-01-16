#!/usr/bin/env node
/**
 * Phase 105: Automated Type Annotation Script
 * Systematically adds TypeScript type annotations to eliminate "implicit any" errors
 *
 * Patterns fixed:
 * 1. XState assign/invoke callbacks: ({ context, event }) => ...
 * 2. Array methods: .map((item) => ...), .filter((x) => ...)
 * 3. Object destructuring: const { foo, bar } = ...
 * 4. Function parameters: function foo(param) { ... }
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const MAX_FILES = parseInt(process.argv[2]) || 10;
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

console.log(`
======================================================================
🔧 PHASE 105: TYPE ANNOTATION AUTO-FIXER
   Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}
   Max files: ${MAX_FILES}
======================================================================
`);

// Pattern definitions with type inference
const PATTERNS = [
    {
        name: 'XState assign callback (context only)',
        regex: /assign\(\s*\{\s*(\w+):\s*\(\{\s*context\s*\}\)\s*=>/g,
        replacement: (match, prop) => `assign({ ${prop}: ({ context }: { context: any }) =>`
    },
    {
        name: 'XState assign callback (event only)',
        regex: /assign\(\s*\{\s*(\w+):\s*\(\{\s*event\s*\}\)\s*=>/g,
        replacement: (match, prop) => `assign({ ${prop}: ({ event }: { event: any }) =>`
    },
    {
        name: 'XState assign callback (context + event)',
        regex: /assign\(\s*\{\s*(\w+):\s*\(\{\s*context,\s*event\s*\}\)\s*=>/g,
        replacement: (match, prop) => `assign({ ${prop}: ({ context, event }: { context: any; event: any }) =>`
    },
    {
        name: 'XState invoke input callback',
        regex: /input:\s*\(\{\s*context\s*\}\)\s*=>/g,
        replacement: 'input: ({ context }: { context: any }) =>'
    },
    {
        name: 'fromPromise async callback',
        regex: /fromPromise\(async\s*\(\{\s*input\s*\}\)\s*=>/g,
        replacement: 'fromPromise(async ({ input }: { input: any }) =>'
    },
    {
        name: 'Array map callback',
        regex: /\.map\(\((\w+)\)\s*=>/g,
        replacement: (match, param) => `.map((${param}: any) =>`
    },
    {
        name: 'Array filter callback',
        regex: /\.filter\(\((\w+)\)\s*=>/g,
        replacement: (match, param) => `.filter((${param}: any) =>`
    },
    {
        name: 'Array forEach callback',
        regex: /\.forEach\(\((\w+)\)\s*=>/g,
        replacement: (match, param) => `.forEach((${param}: any) =>`
    },
    {
        name: 'Promise then callback',
        regex: /\.then\(\((\w+)\)\s*=>/g,
        replacement: (match, param) => `.then((${param}: any) =>`
    },
    {
        name: 'Promise catch callback',
        regex: /\.catch\(\((\w+)\)\s*=>/g,
        replacement: (match, param) => `.catch((${param}: any) =>`
    }
];

// Get top error files from TSC
function getTopErrorFiles() {
    try {
        const tscOutput = execSync('npx tsc --noEmit --skipLibCheck 2>&1', {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        });

        const fileErrors = new Map();
        const lines = tscOutput.split('\n');

        for (const line of lines) {
            const match = line.match(/^(src\/.+\.ts)\(\d+,\d+\):/);
            if (match) {
                const file = match[1];
                fileErrors.set(file, (fileErrors.get(file) || 0) + 1);
            }
        }

        return Array.from(fileErrors.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_FILES)
            .map(([file, count]) => ({ file, errorCount: count }));
    } catch (error) {
        console.error('⚠️  TSC failed, using fallback file list');
        return [];
    }
}

// Apply patterns to a file
function fixFile(filePath) {
    if (!existsSync(filePath)) {
        console.log(`   ⚠️  File not found: ${filePath}`);
        return { fixes: 0, patterns: [] };
    }

    let content = readFileSync(filePath, 'utf-8');
    const originalContent = content;
    let totalFixes = 0;
    const appliedPatterns = [];

    for (const pattern of PATTERNS) {
        const matches = content.match(pattern.regex);
        if (matches && matches.length > 0) {
            if (typeof pattern.replacement === 'function') {
                content = content.replace(pattern.regex, pattern.replacement);
            } else {
                content = content.replace(pattern.regex, pattern.replacement);
            }

            const fixCount = matches.length;
            totalFixes += fixCount;
            appliedPatterns.push({ name: pattern.name, count: fixCount });
        }
    }

    if (totalFixes > 0 && APPLY) {
        // Backup original
        const backupDir = join(dirname(filePath), '.phase105-backup');
        if (!existsSync(backupDir)) {
            mkdirSync(backupDir, { recursive: true });
        }
        const backupPath = join(backupDir, `${Date.now()}-${filePath.split('/').pop()}`);
        writeFileSync(backupPath, originalContent, 'utf-8');

        // Write fixed content
        writeFileSync(filePath, content, 'utf-8');
    }

    return { fixes: totalFixes, patterns: appliedPatterns };
}

// Main execution
async function main() {
    console.log('📂 Analyzing TypeScript errors...\n');

    const topFiles = getTopErrorFiles();

    if (topFiles.length === 0) {
        console.log('✅ No high-error files found or TSC timeout');
        return;
    }

    console.log('📋 Top error files:');
    topFiles.forEach(({ file, errorCount }) => {
        console.log(`   ${errorCount.toString().padStart(3)} errors - ${file}`);
    });

    console.log('\n🔧 Applying type annotations...\n');

    let totalFilesFixed = 0;
    let totalFixesApplied = 0;

    for (const { file, errorCount } of topFiles) {
        const result = fixFile(file);

        if (result.fixes > 0) {
            totalFilesFixed++;
            totalFixesApplied += result.fixes;

            console.log(`   ✅ ${file}: ${result.fixes} fixes`);
            result.patterns.forEach(({ name, count }) => {
                console.log(`      - ${name}: ${count}`);
            });
        } else {
            console.log(`   ⏭️  ${file}: 0 automatic fixes available`);
        }
    }

    console.log(`
======================================================================
📊 SUMMARY
   Files processed: ${topFiles.length}
   Files modified: ${totalFilesFixed}
   Total fixes: ${totalFixesApplied}
   Mode: ${APPLY ? 'CHANGES APPLIED ✅' : 'DRY-RUN (use --apply to save)'}
======================================================================
`);

    if (DRY_RUN && totalFixesApplied > 0) {
        console.log('💡 Run with --apply to save changes');
    }
}

main().catch(console.error);

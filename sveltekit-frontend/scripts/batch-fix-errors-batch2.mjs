#!/usr/bin/env node
/**
 * Advanced Batch Error Fixer - Batch 2
 * Processes files 21-40 from top error list
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const START_INDEX = 20; // Start at file #21
const BATCH_SIZE = 20;  // Process files 21-40
const INPUT_FILE = path.join(__dirname, '../reports/top-100-error-files.json');

// Enhanced corruption patterns
const PATTERNS = [
    {
        name: 'Missing semicolon after closing brace',
        regex: /(\})\s*\n(\s*)(const|let|var|function|class|export|async|private|public|protected)/g,
        replacement: '$1;\n$2$3'
    },
    {
        name: 'Missing closing parenthesis with trailing comment',
        regex: /([a-zA-Z_$][a-zA-Z0-9_$]*)\(([^)]{1,200}),\s*(\/\/[^\n]*)\n/g,
        replacement: '$1($2); $3\n'
    },
    {
        name: 'Missing comma in object literal',
        regex: /:\s*([^,\s\n]+)\s+([a-zA-Z_$][a-zA-Z0-9_$]*):/g,
        replacement: ': $1, $2:'
    },
    {
        name: 'Missing closing brace after Map.set',
        regex: /(\.set\([^,]+,\s*\{[^}]+\})\s*\}([^}])/g,
        replacement: '$1);\n}$2'
    },
    {
        name: 'Missing semicolon in for loop closure',
        regex: /(\s+)\}(\s*)\}(\s*\n\s*)(return|const|let|var)/g,
        replacement: '$1}$2};$3$4'
    },
    {
        name: 'Malformed arrow function return',
        regex: /=>\s*\{([^}]+)\}\s*([,;])/g,
        replacement: '=> { $1 }$2'
    },
    {
        name: 'Missing comma after property value',
        regex: /:\s*(['\"]?[a-zA-Z0-9_$.]+['\"]?)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
        replacement: ': $1, $2:'
    },
    {
        name: 'Double colon in object',
        regex: /:\s*([^:,\n]+):\s*([^:,\n]+),/g,
        replacement: ': $1, $2,'
    }
];

async function main() {
    console.log('🔧 Batch 2 Error Fixer (Files 21-40)\n');
    console.log('='.repeat(60));
    console.log('');

    const data = JSON.parse(await fs.readFile(INPUT_FILE, 'utf-8'));
    const filesToFix = data.track1Files.slice(START_INDEX, START_INDEX + BATCH_SIZE);

    console.log(`📋 Processing ${filesToFix.length} files (${START_INDEX + 1}-${START_INDEX + filesToFix.length})\n`);

    const results = {
        fixed: 0,
        failed: 0,
        skipped: 0,
        totalPatternMatches: 0
    };

    for (let i = 0; i < filesToFix.length; i++) {
        const fileInfo = filesToFix[i];
        const filePath = path.join(__dirname, '..', fileInfo.file);
        const fileName = path.basename(filePath);
        const fileNum = START_INDEX + i + 1;

        console.log(`${String(fileNum).padStart(3)}. ${fileName.padEnd(50)} (${fileInfo.errorCount} errors)`);

        try {
            try {
                await fs.access(filePath);
            } catch {
                console.log(`     ⏭️  File not found, skipping`);
                results.skipped++;
                continue;
            }

            const originalContent = await fs.readFile(filePath, 'utf-8');
            let content = originalContent;
            let patternsApplied = 0;

            for (const pattern of PATTERNS) {
                const before = content;
                content = content.replace(pattern.regex, pattern.replacement);

                if (content !== before) {
                    patternsApplied++;
                    results.totalPatternMatches++;
                }
            }

            if (content !== originalContent) {
                const backupPath = `${filePath}.backup-${Date.now()}`;
                await fs.writeFile(backupPath, originalContent);
                await fs.writeFile(filePath, content);

                console.log(`     ✅ Fixed (${patternsApplied} patterns applied)`);
                results.fixed++;
            } else {
                console.log(`     ⚠️  No changes needed`);
                results.skipped++;
            }
        } catch (error) {
            console.log(`     ❌ Error: ${error.message}`);
            results.failed++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Batch 2 Results:\n');
    console.log(`  ✅ Fixed: ${results.fixed}`);
    console.log(`  ❌ Failed: ${results.failed}`);
    console.log(`  ⏭️  Skipped: ${results.skipped}`);
    console.log(`  🎯 Total pattern matches: ${results.totalPatternMatches}`);
    console.log('');

    if (results.fixed > 0) {
        console.log('💾 Next steps:');
        console.log('   1. Review: git diff --stat');
        console.log('   2. Test: npm run check');
        console.log('   3. Commit: git commit -am "Phase 89 Batch 2: Fix files 21-40"');
        console.log('   4. Push: git push origin svelte5-error-fixes');
    }
}

main().catch(console.error);

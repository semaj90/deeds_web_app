#!/usr/bin/env node
/**
 * CORRECTED Batch Error Fixer - Batch 3
 * Fixed patterns to handle semicolon→comma replacement properly
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const START_INDEX = 80; // Start at file #81
const BATCH_SIZE = 20;  // Process files 81-100
const INPUT_FILE = path.join(__dirname, '../reports/top-100-error-files.json');

// CORRECTED corruption patterns
const PATTERNS = [
    {
        name: 'Semicolon should be comma in interface/type (CORRECTED)',
        regex: /:\s*([a-zA-Z_$][a-zA-Z0-9_$<>[\]|]+)\s*;\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
        replacement: ': $1, $2:'
    },
    {
        name: 'Missing comma between object properties',
        regex: /:\s*(['\"]?[a-zA-Z0-9_$.]+['\"]?)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
        replacement: ': $1, $2:'
    },
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
        name: 'Missing closing brace after Map.set',
        regex: /(\.set\([^,]+,\s*\{[^}]+\})\s*\}([^}])/g,
        replacement: '$1);\n}$2'
    },
    {
        name: 'Missing semicolon in nested block closure',
        regex: /(\s+)\}(\s*)\}(\s*\n\s*)(return|const|let|var)/g,
        replacement: '$1}$2};$3$4'
    },
    {
        name: 'Malformed arrow function return',
        regex: /=>\s*\{([^}]+)\}\s*([,;])/g,
        replacement: '=> { $1 }$2'
    }
];

async function main() {
    console.log('🔧 CORRECTED Batch 3 Error Fixer (Files 41-60)\n');
    console.log('='.repeat(60));
    console.log('✅ Fixed Pattern #1: Properly replaces semicolons with commas');
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

        console.log(`\n📄 File ${START_INDEX + i + 1}: ${fileInfo.file}`);
        console.log(`   Original errors: ${fileInfo.errorCount}`);

        try {
            // Check if file exists
            try {
                await fs.access(filePath);
            } catch {
                console.log(`   ⚠️  File not found, skipping`);
                results.skipped++;
                continue;
            }

            // Read file
            let content = await fs.readFile(filePath, 'utf-8');
            const originalContent = content;

            // Create backup
            const backupPath = `${filePath}.backup-${Date.now()}`;
            await fs.writeFile(backupPath, content, 'utf-8');

            // Apply all patterns
            let patternMatches = 0;
            for (const pattern of PATTERNS) {
                const matches = content.match(pattern.regex);
                if (matches) {
                    content = content.replace(pattern.regex, pattern.replacement);
                    patternMatches += matches.length;
                }
            }

            if (patternMatches > 0) {
                await fs.writeFile(filePath, content, 'utf-8');
                console.log(`   ✅ Fixed with ${patternMatches} pattern matches`);
                results.fixed++;
                results.totalPatternMatches += patternMatches;
            } else {
                console.log(`   ⏭️  No patterns matched, skipping`);
                results.skipped++;
            }

        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
            results.failed++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESULTS:');
    console.log(`✅ Fixed: ${results.fixed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⏭️ Skipped: ${results.skipped}`);
    console.log(`🎯 Total pattern matches: ${results.totalPatternMatches}`);
    console.log('');
}

main().catch(console.error);

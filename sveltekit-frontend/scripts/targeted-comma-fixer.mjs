#!/usr/bin/env node
/**
 * Targeted Missing Comma Fixer
 * Addresses 14,664 missing comma errors (57% of TS1005)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Advanced patterns specifically for missing commas
const COMMA_PATTERNS = [
    {
        name: 'Missing comma between interface/type properties',
        regex: /^(\s+)([a-zA-Z_$][a-zA-Z0-9_$?]*)\s*:\s*([^;,\n]+)\s*\n(\s+)([a-zA-Z_$][a-zA-Z0-9_$?]*)\s*:/gm,
        replacement: '$1$2: $3,\n$4$5:'
    },
    {
        name: 'Missing comma after object property value',
        regex: /:\s*(['\"]?[a-zA-Z0-9_$.()[\]<>]+['\"]?)\s*\n(\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/gm,
        replacement: ': $1,\n$2$3:'
    },
    {
        name: 'Missing comma in type union/intersection',
        regex: /:\s*(string|number|boolean|null|undefined|any|unknown)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
        replacement: ': $1, $2:'
    },
    {
        name: 'Missing comma after array element',
        regex: /\[\s*(['\"][^'"]+['"])\s+(['\"])/g,
        replacement: '[$1, $2'
    },
    {
        name: 'Missing comma in function parameters',
        regex: /\(([a-zA-Z_$][a-zA-Z0-9_$]*:\s*[a-zA-Z_$][a-zA-Z0-9_$<>[\]|]+)\s+([a-zA-Z_$][a-zA-Z0-9_$]*:\s*[a-zA-Z_$])/g,
        replacement: '($1, $2'
    }
];

async function analyzeFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    let totalMatches = 0;

    for (const pattern of COMMA_PATTERNS) {
        const matches = content.match(pattern.regex);
        if (matches) {
            totalMatches += matches.length;
        }
    }

    return totalMatches;
}

async function fixFile(filePath) {
    let content = await fs.readFile(filePath, 'utf-8');
    const originalContent = content;

    // Create backup
    const backupPath = `${filePath}.comma-backup-${Date.now()}`;
    await fs.writeFile(backupPath, content, 'utf-8');

    let totalMatches = 0;

    // Apply all comma patterns
    for (const pattern of COMMA_PATTERNS) {
        const matches = content.match(pattern.regex);
        if (matches) {
            content = content.replace(pattern.regex, pattern.replacement);
            totalMatches += matches.length;
        }
    }

    if (totalMatches > 0) {
        await fs.writeFile(filePath, content, 'utf-8');
    }

    return totalMatches;
}

async function main() {
    console.log('🎯 Targeted Missing Comma Fixer\n');
    console.log('='.repeat(60));
    console.log('Target: 14,664 missing comma errors (57% of TS1005)\n');

    // Read top error files
    const topFilesPath = path.join(__dirname, '../reports/top-100-error-files.json');
    const data = JSON.parse(await fs.readFile(topFilesPath, 'utf-8'));

    // Process top 100 files
    const files = data.track1Files || data.files || [];
    console.log(`📋 Analyzing ${files.length} files...\n`);

    // First pass: analyze
    const candidates = [];
    for (const fileInfo of files) {
        const filePath = path.join(__dirname, '..', fileInfo.file);

        try {
            await fs.access(filePath);
            const matches = await analyzeFile(filePath);
            if (matches > 0) {
                candidates.push({ ...fileInfo, filePath, potentialMatches: matches });
            }
        } catch {
            // File not found, skip
        }
    }

    console.log(`🎯 Found ${candidates.length} files with potential comma fixes`);
    console.log(`📊 Estimated matches: ${candidates.reduce((sum, c) => sum + c.potentialMatches, 0)}\n`);

    // Second pass: fix top 50 files
    const toFix = candidates.slice(0, 50);
    console.log(`🔧 Fixing top ${toFix.length} files...\n`);

    const results = {
        fixed: 0,
        totalMatches: 0,
        files: []
    };

    for (let i = 0; i < toFix.length; i++) {
        const candidate = toFix[i];
        console.log(`[${i + 1}/${toFix.length}] ${candidate.file}`);

        try {
            const matches = await fixFile(candidate.filePath);

            if (matches > 0) {
                console.log(`   ✅ Fixed ${matches} missing commas`);
                results.fixed++;
                results.totalMatches += matches;
                results.files.push({
                    file: candidate.file,
                    matches,
                    originalErrors: candidate.errorCount
                });
            } else {
                console.log(`   ⏭️  No matches (analysis may have been off)`);
            }
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESULTS:');
    console.log(`✅ Files fixed: ${results.fixed}`);
    console.log(`🎯 Total comma fixes: ${results.totalMatches}`);
    console.log(`📈 Estimated error reduction: ${results.totalMatches * 2}-${results.totalMatches * 3}`);
    console.log('');

    // Save report
    await fs.writeFile(
        path.join(__dirname, '../reports/comma-fix-report.json'),
        JSON.stringify(results, null, 2)
    );

    console.log('✅ Run svelte-check to measure actual impact');
}

main().catch(console.error);

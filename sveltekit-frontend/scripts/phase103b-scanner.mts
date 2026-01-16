// Phase 103b: Full codebase pattern scanner
// Scans ALL TypeScript files for safe patterns

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const CONSERVATIVE_PATTERNS = [
    {
        name: 'index_signature_comma_to_colon',
        pattern: /\[([a-zA-Z_][a-zA-Z0-9_]*),\s*(string|number)\]/g,
        replacement: '[$1: $2]'
    },
    {
        name: 'property_comma_to_colon',
        pattern: /(\s+)([a-zA-Z_][a-zA-Z0-9_?]*),\s*(Date|string|number|boolean)\s*;/g,
        replacement: '$1$2: $3;'
    },
    {
        name: 'embeddings_constructor_fix',
        pattern: /new OllamaHTTPEmbeddings\(([^;,)]+);\s*([^)]+)\)/g,
        replacement: 'new OllamaHTTPEmbeddings($1, $2)'
    },
    {
        name: 'redis_setex_fix',
        pattern: /\.setex\(([^:)]+):\s*([^:)]+):\s*([^)]+)\)/g,
        replacement: '.setex($1, $2, $3)'
    },
    {
        name: 'constructor_param_colon',
        pattern: /constructor\(([a-zA-Z_][a-zA-Z0-9_]*)\s+([A-Z][a-zA-Z0-9_<>[\]'|]+)\)/g,
        replacement: 'constructor($1: $2)'
    }
];

async function scanAllFiles() {
    console.log('\n🔍 Phase 103b: Full Codebase Pattern Scanner\n');
    console.log('=' .repeat(70));

    // Find all TypeScript files
    const files = await glob('src/**/*.ts', {
        ignore: ['**/*.d.ts', '**/node_modules/**', '**/*.bak']
    });

    console.log(`📂 Found ${files.length} TypeScript files to scan\n`);

    const results: { file: string; fixes: number; patterns: string[] }[] = [];
    let totalFixes = 0;
    const patternCounts = new Map<string, number>();

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const fileFixes: string[] = [];
        let fileFixCount = 0;

        for (const p of CONSERVATIVE_PATTERNS) {
            const matches = content.match(p.pattern) || [];
            if (matches.length > 0) {
                fileFixCount += matches.length;
                fileFixes.push(`${p.name}: ${matches.length}`);
                patternCounts.set(p.name, (patternCounts.get(p.name) || 0) + matches.length);
            }
        }

        if (fileFixCount > 0) {
            results.push({ file, fixes: fileFixCount, patterns: fileFixes });
            totalFixes += fileFixCount;
        }
    }

    // Sort by fix count
    results.sort((a, b) => b.fixes - a.fixes);

    console.log('📊 Files with fixable patterns:\n');
    for (const r of results.slice(0, 30)) {
        console.log(`   ${r.file}: ${r.fixes} fixes`);
        r.patterns.forEach(p => console.log(`      - ${p}`));
    }

    if (results.length > 30) {
        console.log(`   ... and ${results.length - 30} more files`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('\n📊 SUMMARY');
    console.log(`   Files scanned: ${files.length}`);
    console.log(`   Files with fixes: ${results.length}`);
    console.log(`   Total fixes available: ${totalFixes}`);
    console.log('\n   By pattern:');
    patternCounts.forEach((count, pattern) => {
        console.log(`     - ${pattern}: ${count}`);
    });

    // Save results
    fs.writeFileSync('scripts/phase103b-scan.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        filesScanned: files.length,
        filesWithFixes: results.length,
        totalFixes,
        patternCounts: Object.fromEntries(patternCounts),
        files: results
    }, null, 2));

    console.log('\n📝 Results saved to: scripts/phase103b-scan.json');
    console.log('\n⚠️  This was a SCAN only. No files were modified.\n');
}

scanAllFiles().catch(console.error);

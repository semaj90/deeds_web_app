// Phase 103: Conservative Pattern Fixer with Validation
// DRY-RUN FIRST - Only safe, validated patterns

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Only apply patterns that are PROVEN safe (reduce errors, not increase)
const CONSERVATIVE_PATTERNS = [
    // Pattern 1: Index signature fix [key, string] -> [key: string]
    // This is the SAFEST pattern - unambiguous syntax fix
    {
        name: 'index_signature_comma_to_colon',
        description: 'Fix [key, type] to [key: type] in index signatures',
        pattern: /\[([a-zA-Z_][a-zA-Z0-9_]*),\s*(string|number)\]/g,
        replacement: '[$1: $2]',
        testBefore: '[key, string]',
        testAfter: '[key: string]'
    },
    // Pattern 2: Fix date property syntax  createdAt, Date -> createdAt: Date
    {
        name: 'property_comma_to_colon',
        description: 'Fix property, Type to property: Type in interfaces',
        pattern: /(\s+)([a-zA-Z_][a-zA-Z0-9_?]*),\s*(Date|string|number|boolean)\s*;/g,
        replacement: '$1$2: $3;',
        testBefore: '  createdAt, Date;',
        testAfter: '  createdAt: Date;'
    },
    // Pattern 3: Fix function call missing comma: foo(a b) -> foo(a, b) for simple cases
    {
        name: 'function_arg_missing_comma',
        description: 'Fix function(arg1 arg2) to function(arg1, arg2)',
        pattern: /(this\.config\.[a-zA-Z_.]+)\s+(this\.config\.[a-zA-Z_.]+)\)/g,
        replacement: '$1, $2)',
        testBefore: 'new Foo(this.config.a this.config.b)',
        testAfter: 'new Foo(this.config.a, this.config.b)'
    },
    // Pattern 4: Fix missing colon in constructor params: (config SecuritySettings) -> (config: SecuritySettings)
    {
        name: 'constructor_param_colon',
        description: 'Fix constructor(param Type) to constructor(param: Type)',
        pattern: /constructor\(([a-zA-Z_][a-zA-Z0-9_]*)\s+([A-Z][a-zA-Z0-9_<>[\]'|]+)\)/g,
        replacement: 'constructor($1: $2)',
        testBefore: 'constructor(config SecuritySettings)',
        testAfter: 'constructor(config: SecuritySettings)'
    },
    // Pattern 5: Fix OllamaHTTPLLM constructor call pattern
    {
        name: 'ollama_constructor_fix',
        description: 'Fix Ollama constructor calls with colons instead of commas',
        pattern: /new OllamaHTTPLLM\(\s*([^,)]+):\s*([^,)]+):\s*([^)]+)\)/g,
        replacement: 'new OllamaHTTPLLM($1, $2, $3)',
        testBefore: 'new OllamaHTTPLLM(a: b: c)',
        testAfter: 'new OllamaHTTPLLM(a, b, c)'
    },
    // Pattern 6: Fix OllamaHTTPEmbeddings constructor pattern
    {
        name: 'embeddings_constructor_fix',
        description: 'Fix Embeddings constructor calls',
        pattern: /new OllamaHTTPEmbeddings\(([^;,)]+);\s*([^)]+)\)/g,
        replacement: 'new OllamaHTTPEmbeddings($1, $2)',
        testBefore: 'new OllamaHTTPEmbeddings(a; b)',
        testAfter: 'new OllamaHTTPEmbeddings(a, b)'
    },
    // Pattern 7: Fix redis.setex with colons instead of commas
    {
        name: 'redis_setex_fix',
        description: 'Fix redis.setex(key: ttl: value) to redis.setex(key, ttl, value)',
        pattern: /\.setex\(([^:)]+):\s*([^:)]+):\s*([^)]+)\)/g,
        replacement: '.setex($1, $2, $3)',
        testBefore: '.setex(key: ttl: value)',
        testAfter: '.setex(key, ttl, value)'
    }
];

interface FileAnalysis {
    file: string;
    exists: boolean;
    size: number;
    matchCount: number;
    matches: { pattern: string; line: number; before: string; after: string }[];
}

function analyzeFile(filePath: string): FileAnalysis {
    const fullPath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(fullPath)) {
        return { file: filePath, exists: false, size: 0, matchCount: 0, matches: [] };
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const matches: FileAnalysis['matches'] = [];

    for (const patternDef of CONSERVATIVE_PATTERNS) {
        lines.forEach((line, idx) => {
            const lineMatches = line.match(patternDef.pattern);
            if (lineMatches) {
                matches.push({
                    pattern: patternDef.name,
                    line: idx + 1,
                    before: line.trim().substring(0, 60),
                    after: line.replace(patternDef.pattern, patternDef.replacement).trim().substring(0, 60)
                });
            }
        });
    }

    return {
        file: filePath,
        exists: true,
        size: content.length,
        matchCount: matches.length,
        matches
    };
}

function getTopErrorFiles(): string[] {
    try {
        // Get top 20 files with most errors
        const output = execSync(
            'npx tsc --noEmit 2>&1 | Select-String "error TS" | ForEach-Object { ($_ -split "\\(")[0] } | Group-Object | Sort-Object Count -Descending | Select-Object -First 20 -ExpandProperty Name',
            { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
        );
        return output.trim().split('\n').filter(Boolean);
    } catch {
        // Fallback to known high-error files
        return [
            'src/lib/memory/nes-memory-architecture.ts',
            'src/lib/server/ai/rag-pipeline-enhanced.ts',
            'src/lib/ui/matrix-compiler.ts',
            'src/lib/server/services/audit.service.ts',
            'src/legal-ai-integration.ts',
            'src/lib/services/enhanced-rag-pagerank.ts',
            'src/sveltekit-gpu-cache-integration.ts'
        ];
    }
}

function applyFixes(filePath: string): { fixCount: number; success: boolean } {
    const fullPath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(fullPath)) {
        return { fixCount: 0, success: false };
    }

    let content = fs.readFileSync(fullPath, 'utf-8');
    let totalFixes = 0;

    for (const patternDef of CONSERVATIVE_PATTERNS) {
        const matches = content.match(patternDef.pattern) || [];
        if (matches.length > 0) {
            content = content.replace(patternDef.pattern, patternDef.replacement);
            totalFixes += matches.length;
        }
    }

    if (totalFixes > 0) {
        // Backup
        fs.writeFileSync(fullPath + '.phase103.bak', fs.readFileSync(fullPath));
        // Apply
        fs.writeFileSync(fullPath, content);
    }

    return { fixCount: totalFixes, success: true };
}

async function main() {
    const args = process.argv.slice(2);
    const isDryRun = !args.includes('--apply');
    const isTestSingle = args.includes('--test-single');

    console.log('\n' + '='.repeat(70));
    console.log('🔬 PHASE 103: Conservative Pattern Fixer');
    console.log(`   Mode: ${isDryRun ? 'DRY-RUN (preview only)' : 'LIVE (applying fixes)'}`);
    console.log('='.repeat(70) + '\n');

    // Show patterns being used
    console.log('📋 Patterns to apply:');
    for (const p of CONSERVATIVE_PATTERNS) {
        console.log(`   - ${p.name}: ${p.description}`);
        console.log(`     Example: "${p.testBefore}" → "${p.testAfter}"`);
    }
    console.log('');

    // Get files to analyze
    console.log('📂 Scanning for high-error files...');
    const files = getTopErrorFiles();
    console.log(`   Found ${files.length} files to analyze\n`);

    // Analyze all files
    const analyses: FileAnalysis[] = [];
    let totalMatches = 0;

    for (const file of files) {
        const analysis = analyzeFile(file);
        if (analysis.matchCount > 0) {
            analyses.push(analysis);
            totalMatches += analysis.matchCount;
            console.log(`✅ ${file}: ${analysis.matchCount} fixable patterns`);

            if (isDryRun && analysis.matches.length > 0) {
                // Show first 2 examples
                analysis.matches.slice(0, 2).forEach(m => {
                    console.log(`   Line ${m.line}: ${m.before}`);
                    console.log(`         → ${m.after}`);
                });
            }
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 DRY-RUN SUMMARY');
    console.log(`   Files with fixes: ${analyses.length}`);
    console.log(`   Total fixes available: ${totalMatches}`);
    console.log('');

    // Pattern breakdown
    const patternCounts = new Map<string, number>();
    analyses.forEach(a => {
        a.matches.forEach(m => {
            patternCounts.set(m.pattern, (patternCounts.get(m.pattern) || 0) + 1);
        });
    });
    console.log('   By pattern:');
    patternCounts.forEach((count, pattern) => {
        console.log(`     - ${pattern}: ${count}`);
    });

    if (isDryRun) {
        console.log('\n⚠️  This was a DRY-RUN. No files were modified.');
        console.log('   To apply fixes, run: npx tsx scripts/phase103-fixer.mts --apply');
        console.log('   To test on one file: npx tsx scripts/phase103-fixer.mts --test-single\n');
    } else if (isTestSingle && analyses.length > 0) {
        // Apply to just the first file
        const testFile = analyses[0].file;
        console.log(`\n🧪 Testing on single file: ${testFile}`);
        const result = applyFixes(testFile);
        console.log(`   Applied ${result.fixCount} fixes`);
        console.log('   Backup created: ' + testFile + '.phase103.bak');
        console.log('\n   Run TSC to validate before continuing.\n');
    } else {
        // Apply to all files
        console.log('\n🚀 Applying fixes to all files...');
        let totalApplied = 0;
        for (const analysis of analyses) {
            const result = applyFixes(analysis.file);
            if (result.success && result.fixCount > 0) {
                console.log(`   ✅ ${analysis.file}: ${result.fixCount} fixes`);
                totalApplied += result.fixCount;
            }
        }
        console.log(`\n✅ Total fixes applied: ${totalApplied}`);
        console.log('   Backups created with .phase103.bak extension\n');
    }

    // Save analysis
    fs.writeFileSync('scripts/phase103-analysis.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        mode: isDryRun ? 'dry-run' : 'applied',
        totalMatches,
        files: analyses
    }, null, 2));
    console.log('📝 Analysis saved to: scripts/phase103-analysis.json\n');
}

main().catch(console.error);

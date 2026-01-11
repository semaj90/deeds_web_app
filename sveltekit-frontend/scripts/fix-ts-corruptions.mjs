import fs from 'fs';
import { globSync } from 'glob';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetFiles = args.filter(a => !a.startsWith('--'));
const limit = args.find(a => a.startsWith('--limit='));
const fileLimit = limit ? parseInt(limit.split('=')[1]) : Infinity;

// Get files to process - either specified or all TS files
let files;
if (targetFiles.length > 0) {
    files = targetFiles;
} else {
    files = globSync('src/**/*.ts').slice(0, fileLimit);
}

// Patterns to fix property/parameter corruptions
const patterns = [
    // Pattern 1: Comma replaced by colon in function params
    // f(param1: Type1: param2) → f(param1: Type1, param2)
    {
        name: 'param-colon-to-comma',
        regex: /(\w+:\s*\w+(?:<[^>]+>)?)\s*:\s*(\w+)(?=\s*[,):=])/g,
        replacement: '$1, $2'
    },
    // Pattern 2: Object property comma replaced by colon
    // { key1: value1: key2: value2 } → { key1: value1, key2: value2 }
    {
        name: 'object-prop-colon',
        regex: /(\w+:\s*(?:[^,{}[\]]+?))\s*:\s*(\w+:)/g,
        replacement: '$1, $2'
    },
    // Pattern 3: Missing comma after object property
    // { key: value key2: } → { key: value, key2: }
    {
        name: 'missing-comma',
        regex: /(\w+:\s*[^,{}\n;]+)\s+(\w+:)/g,
        replacement: '$1, $2'
    },
    // Pattern 4: Duplicate code merging (simplified detection)
    // }returnreturn → } return
    {
        name: 'duplicate-return',
        regex: /}return\s*return/g,
        replacement: '}\n\treturn'
    },
    // Pattern 5: Statement smashing
    // }const → }; const
    {
        name: 'stmt-smash',
        regex: /}(const|let|var|function|async|private|public|protected)/g,
        replacement: '};\n$1'
    },
    // Pattern 6: Closing brace + immediately opening
    // }{get → }; { get
    {
        name: 'brace-smash',
        regex: /}{/g,
        replacement: '};\n\t{'
    }
];

let totalFixed = 0;
let totalPatterns = 0;
const report = [];

for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        continue;
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;
    let filePatterns = 0;

    for (const pattern of patterns) {
        const matches = content.match(pattern.regex);
        if (matches) {
            filePatterns += matches.length;
            content = content.replace(pattern.regex, pattern.replacement);
        }
    }

    if (content !== original) {
        totalFixed++;
        totalPatterns += filePatterns;
        report.push({ file: filePath, patterns: filePatterns });

        if (!dryRun) {
            fs.writeFileSync(filePath, content);
            console.log(`Fixed ${filePath} (${filePatterns} patterns)`);
        } else {
            console.log(`[DRY-RUN] Would fix ${filePath} (${filePatterns} patterns)`);
        }
    }
}

console.log(`\n📊 Summary:`);
console.log(`   Files ${dryRun ? 'would be ' : ''}fixed: ${totalFixed}`);
console.log(`   Total pattern fixes: ${totalPatterns}`);
console.log(`   Mode: ${dryRun ? 'DRY-RUN (no changes made)' : 'APPLIED'}`);

if (dryRun) {
    console.log(`\n💡 Run without --dry-run to apply fixes`);
}

// Save report
fs.writeFileSync('logs/ts-corruption-fixes.json', JSON.stringify(report, null, 2));

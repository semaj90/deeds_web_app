import fs from 'fs';
import { globSync } from 'glob';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limit = args.find(a => a.startsWith('--limit='));
const fileLimit = limit ? parseInt(limit.split('=')[1]) : Infinity;

const files = globSync('src/**/*.svelte');

let fixedCount = 0;
let totalFixes = 0;
const results = [];

for (const filePath of files.slice(0, fileLimit)) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;
    let filePatternFixes = 0;

    // Find all $state<any>(undefined) declarations
    const statePattern = /\tlet\s+(\w+)\s*=\s*\$state<any>\(undefined\);\r?\n/g;
    let match;
    const toRemove = [];

    while ((match = statePattern.exec(content)) !== null) {
        const varName = match[1];
        const fullMatch = match[0];

        // Check if this variable appears in a $props() destructure later in the file
        const afterMatch = content.slice(match.index + fullMatch.length);
        const propsPattern = new RegExp(`\\$props\\(\\)[^}]*${varName}\\s*[=,}:]`);

        if (propsPattern.test(afterMatch)) {
            toRemove.push(fullMatch);
            filePatternFixes++;
        }
    }

    // Remove all matched lines
    for (const line of toRemove) {
        content = content.replace(line, '');
    }

    // Clean up multiple blank lines
    content = content.replace(/\n{3,}/g, '\n\n');
    content = content.replace(/\r\n{3,}/g, '\r\n\r\n');

    if (content !== original) {
        fixedCount++;
        totalFixes += filePatternFixes;
        results.push({ file: filePath, fixes: filePatternFixes });

        if (!dryRun) {
            fs.writeFileSync(filePath, content);
            console.log(`Fixed ${filePath} (${filePatternFixes} duplicate $state removals)`);
        } else {
            console.log(`[DRY-RUN] Would fix ${filePath} (${filePatternFixes} duplicate $state removals)`);
        }
    }
}

console.log(`\n📊 Summary:`);
console.log(`   Files ${dryRun ? 'would be ' : ''}fixed: ${fixedCount}`);
console.log(`   Total $state duplicates removed: ${totalFixes}`);
console.log(`   Mode: ${dryRun ? 'DRY-RUN (no changes made)' : 'APPLIED'}`);

if (dryRun) {
    console.log(`\n💡 Run without --dry-run to apply fixes`);
}

// Write report
fs.writeFileSync('logs/svelte5-state-fixes.json', JSON.stringify(results, null, 2));

import fs from 'fs';
import { globSync } from 'glob';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limit = args.find(a => a.startsWith('--limit='));
const fileLimit = limit ? parseInt(limit.split('=')[1]) : Infinity;

const files = globSync('src/**/*.{svelte,ts}');

let fixedCount = 0;
let totalFixes = 0;
const results = [];

for (const filePath of files.slice(0, fileLimit)) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;
    let filePatternFixes = 0;

    // Pattern 1: Remove orphan $state<any>(undefined) lines at start of script
    // These are duplicates that get created when the same name appears in $props()
    const stateUndefinedPattern = /^\t*let\s+(\w+)\s*=\s*\$state<any>\(undefined\);\s*\r?\n/gm;
    const matches = content.match(stateUndefinedPattern);

    if (matches) {
        for (const match of matches) {
            // Extract the variable name
            const nameMatch = match.match(/let\s+(\w+)/);
            if (nameMatch) {
                const varName = nameMatch[1];
                // Check if this variable appears in a $props() destructure
                const propsPattern = new RegExp(`\\$props\\([^)]*\\).*?${varName}\\s*[=,}]`, 's');
                if (propsPattern.test(content)) {
                    // This is a duplicate - remove it
                    content = content.replace(match, '');
                    filePatternFixes++;
                }
            }
        }
    }

    // Pattern 2: Fix corrupted case statements: case: "x" → case "x":
    content = content.replace(/case:\s+"([^"]+)"/g, 'case "$1":');
    content = content.replace(/case,\s+"([^"]+)"/g, 'case "$1":');

    // Pattern 3: Fix corrupted case statements: case: 'x' → case 'x':
    content = content.replace(/case:\s+'([^']+)'/g, "case '$1':");
    content = content.replace(/case,\s+'([^']+)'/g, "case '$1':");

    // Pattern 4: Fix switch cases with : after keyword
    content = content.replace(/switch:\s*\(/g, 'switch (');

    // Pattern 5: Fix CSS :not(: → :not(:
    content = content.replace(/:not\(:\s+/g, ':not(:');

    // Count remaining fixes
    if (content !== original) {
        const changeCount = (original.length - content.length) / 40; // rough estimate
        filePatternFixes = Math.max(1, Math.round(changeCount));
    }

    // Clean up multiple blank lines
    content = content.replace(/\n{3,}/g, '\n\n');

    if (content !== original) {
        fixedCount++;
        totalFixes += filePatternFixes;
        results.push({ file: filePath, fixes: filePatternFixes });

        if (!dryRun) {
            fs.writeFileSync(filePath, content);
            console.log(`Fixed ${filePath} (${filePatternFixes} patterns)`);
        } else {
            console.log(`[DRY-RUN] Would fix ${filePath} (${filePatternFixes} patterns)`);
        }
    }
}

console.log(`\n📊 Summary:`);
console.log(`   Files ${dryRun ? 'would be ' : ''}fixed: ${fixedCount}`);
console.log(`   Total pattern fixes: ${totalFixes}`);
console.log(`   Mode: ${dryRun ? 'DRY-RUN (no changes made)' : 'APPLIED'}`);

if (dryRun) {
    console.log(`\n💡 Run without --dry-run to apply fixes`);
}

// Write report
fs.writeFileSync('logs/svelte5-corruption-fixes.json', JSON.stringify(results, null, 2));

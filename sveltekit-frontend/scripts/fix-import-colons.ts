/**
 * Fix corrupted TypeScript/Svelte syntax patterns
 * Also handles .svelte files
 *
 * Usage:
 *   npx tsx scripts/fix-import-colons.ts           # Dry run (preview only)
 *   npx tsx scripts/fix-import-colons.ts --apply   # Actually apply changes
 */

import * as fs from 'fs';
import { glob } from 'glob';

const DRY_RUN = !process.argv.includes('--apply');

// Multiple patterns to fix
const patterns = [
    // Pattern 1: import type with colon instead of comma (simple 2-item case)
    {
        name: 'import-type-colon-2',
        regex: /import\s+type\s*\{\s*(\w+)\s*:\s*(\w+)\s*\}/g,
        replace: 'import type { $1, $2 }'
    },
    // Pattern 2: import type with multiple items and colons
    {
        name: 'import-type-colon-3',
        regex: /import\s+type\s*\{\s*(\w+)\s*:\s*(\w+)\s*,\s*(\w+)\s*\}/g,
        replace: 'import type { $1, $2, $3 }'
    },
    // Pattern 3: Map<string: Type> -> Map<string, Type>
    {
        name: 'map-colon-generic',
        regex: /Map<(\w+):\s*(\w+)>/g,
        replace: 'Map<$1, $2>'
    },
    // Pattern 4: interface property with colon-comma pattern
    {
        name: 'property-map-colon',
        regex: /patterns:\s*Map<(\w+):\s*(\w+)>/g,
        replace: 'patterns: Map<$1, $2>'
    }
];

interface Match {
    pattern: string;
    line: number;
    original: string;
    fixed: string;
}

function findMatches(filePath: string): Match[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const matches: Match[] = [];

    for (const pattern of patterns) {
        pattern.regex.lastIndex = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            pattern.regex.lastIndex = 0;

            if (pattern.regex.test(line)) {
                pattern.regex.lastIndex = 0;
                const fixed = line.replace(pattern.regex, pattern.replace);
                if (fixed !== line) {
                    matches.push({
                        pattern: pattern.name,
                        line: i + 1,
                        original: line.trim().substring(0, 100),
                        fixed: fixed.trim().substring(0, 100)
                    });
                }
            }
        }
    }

    return matches;
}

function applyFixes(filePath: string): boolean {
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    for (const pattern of patterns) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(content)) {
            pattern.regex.lastIndex = 0;
            const newContent = content.replace(pattern.regex, pattern.replace);
            if (newContent !== content) {
                content = newContent;
                modified = true;
            }
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
    }

    return false;
}

async function main() {
    console.log(DRY_RUN ? '🔍 DRY RUN MODE (use --apply to make changes)\n' : '🔧 APPLYING CHANGES\n');

    // Include both .ts and .svelte files
    const files = await glob('src/**/*.{ts,svelte}', { ignore: ['**/node_modules/**', '**/_archive/**'] });

    let totalMatches = 0;
    let filesWithMatches = 0;

    for (const file of files) {
        try {
            const matches = findMatches(file);

            if (matches.length > 0) {
                filesWithMatches++;
                totalMatches += matches.length;

                console.log(`📄 ${file}`);
                for (const match of matches) {
                    console.log(`   Line ${match.line} [${match.pattern}]:`);
                    console.log(`   - ${match.original}...`);
                    console.log(`   + ${match.fixed}...`);
                }
                console.log();

                if (!DRY_RUN) {
                    applyFixes(file);
                    console.log(`   ✅ Fixed!`);
                }
            }
        } catch (err) {
            console.error(`Error processing ${file}:`, err);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Files with matches: ${filesWithMatches}`);
    console.log(`   Total matches: ${totalMatches}`);

    if (DRY_RUN && totalMatches > 0) {
        console.log(`\n💡 Run with --apply to make changes`);
    }
}

main().catch(console.error);

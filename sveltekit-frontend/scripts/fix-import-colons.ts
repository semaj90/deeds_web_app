/**
 * Fix corrupted TypeScript syntax patterns
 * Patterns fixed:
 * 1. `import type { Actions: PageServerLoad }` -> `import type { Actions, PageServerLoad }`
 * 2. `ErrorCluster: GPUAnalysisResult, GPUErrorPattern` -> `ErrorCluster, GPUAnalysisResult, GPUErrorPattern`
 * 3. `Map<string: Type>` -> `Map<string, Type>`
 */

import * as fs from 'fs';
import { glob } from 'glob';

// Multiple patterns to fix
const patterns = [
    // Pattern 1: import type with colon instead of comma (simple 2-item case)
    {
        regex: /import\s+type\s*\{\s*(\w+)\s*:\s*(\w+)\s*\}/g,
        replace: 'import type { $1, $2 }'
    },
    // Pattern 2: import type with multiple items and colons
    {
        regex: /import\s+type\s*\{\s*(\w+)\s*:\s*(\w+)\s*,\s*(\w+)\s*\}/g,
        replace: 'import type { $1, $2, $3 }'
    },
    // Pattern 3: Map<string: Type> -> Map<string, Type>
    {
        regex: /Map<(\w+):\s*(\w+)>/g,
        replace: 'Map<$1, $2>'
    },
    // Pattern 4: interface property with colon-comma pattern
    {
        regex: /patterns:\s*Map<(\w+):\s*(\w+)>/g,
        replace: 'patterns: Map<$1, $2>'
    }
];

async function fixFile(filePath: string): Promise<boolean> {
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
        console.log(`Fixed: ${filePath}`);
        return true;
    }

    return false;
}

async function main() {
    const files = await glob('src/**/*.ts', { ignore: ['**/node_modules/**', '**/_archive/**'] });

    let fixedCount = 0;

    for (const file of files) {
        try {
            if (await fixFile(file)) {
                fixedCount++;
            }
        } catch (err) {
            console.error(`Error processing ${file}:`, err);
        }
    }

    console.log(`\nFixed ${fixedCount} files`);
}

main().catch(console.error);

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Regex patterns to fix
const REPLACEMENTS = [
    {
        // Fix broken IIFE/Closure syntax caused by mash-fixer
        // pattern: `});();` usually inside $effect or onMount
        // target: `})();`
        regex: /\}\);\(\);/g,
        replacement: '})();'
    },
    {
        // Fix Qdrant integration error
        // pattern: `points, wait, true }` -> `points, wait: true }`
        regex: /points,\s*wait,\s*true\s*\}/g,
        replacement: 'points, wait: true }'
    },
    {
        // Fix weird double semicolon at start of lines
        regex: /^\s*;\s*;/gm,
        replacement: ';'
    },
    {
        // Fix broken Prettier artifacts like `let { data } = $props<{ data: any }>();` being okay, but
        // `});` followed by `();` on next line
         regex: /\}\);\s*\(\);/g,
         replacement: '})();'
    }
];

function scanAndFix(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.svelte-kit') {
                scanAndFix(fullPath);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.svelte') || file.endsWith('.js')) {
            processFile(fullPath);
        }
    }
}

function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    let newContent = content;
    let modified = false;

    // Apply strict replacements
    REPLACEMENTS.forEach(({ regex, replacement }) => {
        if (regex.test(newContent)) {
            newContent = newContent.replace(regex, replacement);
            modified = true;
        }
    });

    // Special case for qdrant-integration.ts
    if (filePath.endsWith('qdrant-integration.ts')) {
       // Fix lines broken by type import splitting?
       // Check for `import type {` ending with `}` on next line
       // This seems handled by Prettier if syntax is valid.
    }

    if (modified) {
        console.log(`Fixing syntax in: ${path.relative(ROOT_DIR, filePath)}`);
        fs.writeFileSync(filePath, newContent);
    }
}

console.log('Starting Phase 13: Syntax Cleanup...');
scanAndFix(path.join(ROOT_DIR, 'src'));
console.log('Phase 13 Complete.');

import fs from 'fs';
import { globSync } from 'glob';

const files = globSync('src/**/*.svelte');

const patterns = [
    {
        // Fix ": :-webkit" -> "::-webkit"
        regex: /:\s+:-webkit/g,
        replacement: '::-webkit'
    },
    {
        // Fix ": :-moz" -> "::-moz"
        regex: /:\s+:-moz/g,
        replacement: '::-moz'
    },
    {
        // Fix ": :after" -> "::after"
        regex: /:\s+:after/g,
        replacement: '::after'
    },
    {
        // Fix ": :before" -> "::before"
        regex: /:\s+:before/g,
        replacement: '::before'
    },
    {
        // Fix ": hover" -> ":hover"
        regex: /:\s+hover/g,
        replacement: ':hover'
    },
    {
        // Fix ": focus" -> ":focus"
        regex: /:\s+focus/g,
        replacement: ':focus'
    },
    {
        // Fix ": active" -> ":active"
        regex: /:\s+active/g,
        replacement: ':active'
    },
    {
        // Fix ": last-child" -> ":last-child"
        regex: /:\s+last-child/g,
        replacement: ':last-child'
    },
    {
        // Fix ": first-child" -> ":first-child"
        regex: /:\s+first-child/g,
        replacement: ':first-child'
    },
    {
        // Fix "inset: 0: 0" -> "inset: 0 0"
        regex: /inset:\s*0:\s*0/g,
        replacement: 'inset: 0 0'
    },
    {
        // Fix "rgba(X: Y, Z, A)" -> "rgba(X, Y, Z, A)"
        regex: /rgba\((\d+):\s*(\d+)/g,
        replacement: 'rgba($1, $2'
    },
    {
        // Fix "z-index: 50:global" -> "z-index: 50; :global"
        regex: /z-index:\s*(\d+):global/g,
        replacement: 'z-index: $1; :global'
    },
    {
        // Fix "display: flex," -> "display: flex;"
        regex: /display:\s*flex,/g,
        replacement: 'display: flex;'
    },
    {
        // Fix "opacity: 0," inside style blocks (simplified)
        regex: /opacity:\s*0,/g,
        replacement: 'opacity: 0;'
    }
];

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let original = content;

    // Only apply fixes inside <style> tags if possible, but global is okay for these specific patterns
    for (const pattern of patterns) {
        content = content.replace(pattern.regex, pattern.replacement);
    }

    if (content !== original) {
        console.log('Fixed ' + filePath);
        fs.writeFileSync(filePath, content);
    }
}

console.log('Cleaning up PostCSS corruptions...');
files.forEach(fixFile);
console.log('✅ Done.');

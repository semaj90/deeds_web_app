import fs from 'fs';
import { globSync } from 'glob';

const files = globSync('src/**/*.svelte');

// All CSS pseudo-selector corruptions: ": selector" → ":selector"
const patterns = [
    // Pseudo-class corruptions
    { regex: /:\s+disabled/g, replacement: ':disabled' },
    { regex: /:\s+hover/g, replacement: ':hover' },
    { regex: /:\s+focus/g, replacement: ':focus' },
    { regex: /:\s+active/g, replacement: ':active' },
    { regex: /:\s+visited/g, replacement: ':visited' },
    { regex: /:\s+checked/g, replacement: ':checked' },
    { regex: /:\s+enabled/g, replacement: ':enabled' },
    { regex: /:\s+last-child/g, replacement: ':last-child' },
    { regex: /:\s+first-child/g, replacement: ':first-child' },
    { regex: /:\s+nth-child/g, replacement: ':nth-child' },
    { regex: /:\s+not/g, replacement: ':not' },

    // Pseudo-element corruptions
    { regex: /:\s+:-webkit/g, replacement: '::-webkit' },
    { regex: /:\s+:-moz/g, replacement: '::-moz' },
    { regex: /:\s+:before/g, replacement: '::before' },
    { regex: /:\s+:after/g, replacement: '::after' },

    // Single pseudo-element with space
    { regex: /:\s+before(?!\()/g, replacement: '::before' },
    { regex: /:\s+after(?!\()/g, replacement: '::after' },

    // Property value corruptions
    { regex: /inset:\s*0:\s*0/g, replacement: 'inset: 0 0' },
    { regex: /rgba\((\d+):\s*(\d+)/g, replacement: 'rgba($1, $2' },
    { regex: /z-index:\s*(\d+):global/g, replacement: 'z-index: $1; :global' },
    { regex: /display:\s*flex,/g, replacement: 'display: flex;' },
    { regex: /opacity:\s*0,/g, replacement: 'opacity: 0;' },

    // Fix common property-value smashing
    { regex: /background:\s*([#\w]+);(border)/g, replacement: 'background: $1; $2' },
    { regex: /color:\s*([#\w]+);(font)/g, replacement: 'color: $1; $2' },
    { regex: /padding:\s*([^;]+);(margin)/g, replacement: 'padding: $1; $2' },

    // Fix animation property corruption
    { regex: /animation:\s*([^;]+)\n\s*:global/g, replacement: 'animation: $1;\n  :global' },
];

let fixedCount = 0;

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let original = content;

    for (const pattern of patterns) {
        content = content.replace(pattern.regex, pattern.replacement);
    }

    if (content !== original) {
        console.log(`Fixed ${filePath}`);
        fs.writeFileSync(filePath, content);
        fixedCount++;
    }
}

console.log('Cleaning up all CSS pseudo-selector corruptions...');
files.forEach(fixFile);
console.log(`\n✅ Done. Fixed ${fixedCount} files.`);

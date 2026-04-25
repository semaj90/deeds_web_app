/**
 * Fix Comma Corruption Script
 * Fixes common comma-related syntax corruption patterns
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '..', 'src');
let totalFixed = 0;
let filesFixed = 0;

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    let fixes = 0;

    // Fix 1: Multiple commas in a row (,,,,) -> single comma
    const multiCommaMatches = content.match(/,{2,}/g);
    if (multiCommaMatches) {
        content = content.replace(/,{2,}/g, ',');
        fixes += multiCommaMatches.length;
    }

    // Fix 2: Semicolon followed by commas (;,,,) -> semicolon
    const semiCommaMatches = content.match(/;,+/g);
    if (semiCommaMatches) {
        content = content.replace(/;,+/g, ';');
        fixes += semiCommaMatches.length;
    }

    // Fix 3: Colon followed by commas (:,,,) -> colon
    const colonCommaMatches = content.match(/:,+/g);
    if (colonCommaMatches) {
        content = content.replace(/:,+/g, ':');
        fixes += colonCommaMatches.length;
    }

    // Fix 4: Opening paren followed by commas ((,,,) -> (
    const parenCommaMatches = content.match(/\(,+/g);
    if (parenCommaMatches) {
        content = content.replace(/\(,+/g, '(');
        fixes += parenCommaMatches.length;
    }

    // Fix 5: Comma before closing paren (,)) -> )
    const commaParenMatches = content.match(/,+\)/g);
    if (commaParenMatches) {
        content = content.replace(/,+\)/g, ')');
        fixes += commaParenMatches.length;
    }

    // Fix 6: Comma before closing brace (,}) -> }
    const commaBraceMatches = content.match(/,+\}/g);
    if (commaBraceMatches) {
        content = content.replace(/,+\}/g, '}');
        fixes += commaBraceMatches.length;
    }

    // Fix 7: Comma before closing bracket (,]) -> ]
    const commaBracketMatches = content.match(/,+\]/g);
    if (commaBracketMatches) {
        content = content.replace(/,+\]/g, ']');
        fixes += commaBracketMatches.length;
    }

    // Fix 8: Space comma space (, ,) -> ,
    const spaceCommaMatches = content.match(/,\s+,/g);
    if (spaceCommaMatches) {
        content = content.replace(/,\s+,/g, ',');
        fixes += spaceCommaMatches.length;
    }

    // Fix 9: Comma at start of line after newline
    const newlineCommaMatches = content.match(/\n\s*,/g);
    if (newlineCommaMatches) {
        content = content.replace(/\n\s*,/g, '\n');
        fixes += newlineCommaMatches.length;
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        filesFixed++;
        totalFixed += fixes;
        console.log(`Fixed ${fixes} issues in: ${filePath}`);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
            walkDir(filePath);
        } else if (file.endsWith('.ts') || file.endsWith('.svelte')) {
            try {
                fixFile(filePath);
            } catch (e) {
                console.error(`Error processing: ${filePath}`, e.message);
            }
        }
    }
}

console.log('Starting comma corruption fix...');
console.log(`Source directory: ${srcDir}`);
walkDir(srcDir);
console.log('\n=== Summary ===');
console.log(`Files fixed: ${filesFixed}`);
console.log(`Total fixes: ${totalFixed}`);

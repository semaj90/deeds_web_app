#!/usr/bin/env node
/**
 * CSS Selector & Syntax Fixer - Phase 66
 * Targets CSS corruption patterns identified in svelte-check output
 *
 * Patterns Fixed (CSS/Style blocks only):
 * 1. Split global selectors: ": global(" → ":global("
 * 2. Malformed @keyframes
 * 3. Invalid selector syntax
 *
 * Usage:
 *   node fix-css-selectors.mjs --dry-run           # Preview changes
 *   node fix-css-selectors.mjs --limit 2           # Fix only 2 files
 *   node fix-css-selectors.mjs --file path.svelte  # Fix specific file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : Infinity;
const targetFile = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;

console.log('🎨 CSS Selector & Syntax Fixer (Phase 66)');
console.log('==========================================');
console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (preview only)' : '🔧 LIVE FIX'}`);
if (limit < Infinity) console.log(`Limit: ${limit} files`);
console.log('');

const stats = {
    filesScanned: 0,
    filesFixed: 0,
    splitGlobalSelectors: 0,
    malformedKeyframes: 0,
    invalidSelectors: 0
};

/**
 * Extract <style> blocks from Svelte files
 */
function extractStyleBlocks(content) {
    const blocks = [];
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;
    let match;

    while ((match = styleRegex.exec(content)) !== null) {
        blocks.push({
            start: match.index,
            end: match.index + match[0].length,
            content: match[1]
        });
    }

    return blocks;
}

/**
 * Fix CSS patterns within style blocks
 */
function fixStyleBlock(styleContent) {
    let modified = false;
    let fixed = styleContent;
    const patterns = [];

    // Pattern 1: Split global selectors ": global(" → ":global("
    const splitGlobalRegex = /:\s+global\(/g;
    if (splitGlobalRegex.test(fixed)) {
        const before = fixed;
        fixed = fixed.replace(splitGlobalRegex, ':global(');
        if (before !== fixed) {
            modified = true;
            patterns.push('Split Global Selectors');
            const matches = before.match(splitGlobalRegex);
            stats.splitGlobalSelectors += matches ? matches.length : 0;
        }
    }

    // Pattern 2: Malformed keyframes with quotes/slashes
    // "from" / "transform: scale(0.95)", to → from { transform: scale(0.95); } to
    const keyframeRegex = /"(from|to)"\s*\/\s*"([^"]+)"\s*,?\s*(from|to)?/g;
    if (keyframeRegex.test(fixed)) {
        const before = fixed;
        fixed = fixed.replace(keyframeRegex, (match, kw1, props, kw2) => {
            // Parse property: value pairs
            const propsFixed = props.split(',').map(p => {
                const [prop, val] = p.split(':').map(s => s.trim());
                return `${prop}: ${val};`;
            }).join(' ');

            if (kw2) {
                return `${kw1} {\n    ${propsFixed}\n  }\n  ${kw2}`;
            }
            return `${kw1} {\n    ${propsFixed}\n  }`;
        });

        if (before !== fixed) {
            modified = true;
            patterns.push('Malformed Keyframes');
            stats.malformedKeyframes++;
        }
    }

    // Pattern 3: Invalid selectors with newlines (": "0% → 0% {)
    const invalidSelectorRegex = /:\s*"(\d+%)\s*"/g;
    if (invalidSelectorRegex.test(fixed)) {
        const before = fixed;
        fixed = fixed.replace(invalidSelectorRegex, '$1 {');
        if (before !== fixed) {
            modified = true;
            patterns.push('Invalid Selectors');
            const matches = before.match(invalidSelectorRegex);
            stats.invalidSelectors += matches ? matches.length : 0;
        }
    }

    return { modified, fixed, patterns };
}

/**
 * Process a single file
 */
function processFile(filePath) {
    stats.filesScanned++;

    const content = fs.readFileSync(filePath, 'utf-8');
    const isCss = filePath.endsWith('.css');

    let modified = false;
    let newContent = content;
    let allPatterns = [];

    if (isCss) {
        // Process entire file as CSS
        const result = fixStyleBlock(content);
        modified = result.modified;
        newContent = result.fixed;
        allPatterns = result.patterns;
    } else {
        // Extract and fix style blocks in Svelte files
        const styleBlocks = extractStyleBlocks(content);

        if (styleBlocks.length > 0) {
            let offset = 0;

            for (const block of styleBlocks) {
                const result = fixStyleBlock(block.content);

                if (result.modified) {
                    modified = true;
                    allPatterns.push(...result.patterns);

                    // Replace style block content
                    const blockStart = block.start + offset;
                    const blockEnd = block.end + offset;
                    const before = newContent.substring(0, blockStart);
                    const after = newContent.substring(blockEnd);
                    const styleTag = newContent.substring(blockStart, blockEnd).replace(block.content, result.fixed);

                    newContent = before + styleTag + after;
                    offset += (result.fixed.length - block.content.length);
                }
            }
        }
    }

    if (modified) {
        const relativePath = path.relative(process.cwd(), filePath);

        if (isDryRun) {
            console.log(`\n📄 ${relativePath}`);
            console.log(`   Patterns: ${[...new Set(allPatterns)].join(', ')}`);

            // Show diff excerpt
            const lines = content.split('\n');
            const newLines = newContent.split('\n');
            let diffShown = false;

            for (let i = 0; i < Math.min(lines.length, newLines.length, 100); i++) {
                if (lines[i] !== newLines[i] && !diffShown) {
                    console.log(`   Line ${i + 1}:`);
                    console.log(`   - ${lines[i].trim().substring(0, 80)}`);
                    console.log(`   + ${newLines[i].trim().substring(0, 80)}`);
                    diffShown = true;
                }
            }
        } else {
            console.log(`✓ ${relativePath} (${[...new Set(allPatterns)].join(', ')})`);
            fs.writeFileSync(filePath, newContent, 'utf-8');
        }

        stats.filesFixed++;
        return true;
    }

    return false;
}

/**
 * Recursive file scanner
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!['node_modules', '.svelte-kit', '.git', 'build', 'dist'].includes(file)) {
                arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
            }
        } else if (file.endsWith('.svelte') || file.endsWith('.css')) {
            arrayOfFiles.push(fullPath);
        }
    });

    return arrayOfFiles;
}

/**
 * Main execution
 */
async function main() {
    const srcDir = path.resolve(__dirname, '../src');

    let files;
    if (targetFile) {
        files = [path.resolve(process.cwd(), targetFile)];
        console.log(`🎯 Target: ${targetFile}\n`);
    } else {
        files = getAllFiles(srcDir);
        console.log(`📂 Scanning ${files.length} files in src/...\n`);
    }

    let processedCount = 0;
    for (const file of files) {
        if (processedCount >= limit) {
            console.log(`\n⚠️  Reached limit of ${limit} files`);
            break;
        }

        if (processFile(file)) {
            processedCount++;
        }
    }

    // Summary
    console.log('\n==========================================');
    console.log('📊 Summary:');
    console.log(`   Files scanned: ${stats.filesScanned}`);
    console.log(`   Files ${isDryRun ? 'would be' : ''} modified: ${stats.filesFixed}`);
    console.log('\n🔧 Patterns fixed:');
    if (stats.splitGlobalSelectors > 0) console.log(`   ✓ Split global selectors: ${stats.splitGlobalSelectors}`);
    if (stats.malformedKeyframes > 0) console.log(`   ✓ Malformed keyframes: ${stats.malformedKeyframes}`);
    if (stats.invalidSelectors > 0) console.log(`   ✓ Invalid selectors: ${stats.invalidSelectors}`);

    if (isDryRun) {
        console.log('\n💡 Run without --dry-run to apply fixes');
        console.log('💡 Use --limit N to fix only N files');
    } else {
        console.log('\n✅ Fixes applied! Run svelte-check to verify.');
    }
}

main().catch(console.error);

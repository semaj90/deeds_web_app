#!/usr/bin/env node
/**
 * Phase 43 — CSS Syntax Fixer
 * Fixes common CSS syntax errors in Svelte <style> blocks
 * Target: ~20,000 CSS-related errors
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "src");
const APPLY = process.argv.includes("--apply");

function* walk(dir) {
  for (const e of fs.readdirSync(dir)) {
    const full = path.join(dir, e);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (!/backup|archive|node_modules|\.svelte-kit/i.test(full)) {
        yield* walk(full);
      }
    } else if (full.endsWith(".svelte")) {
      yield full;
    }
  }
}

function fixCssSyntax(src) {
  let modified = false;
  let fixes = [];
  
  // Extract style blocks
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;
  const matches = [...src.matchAll(styleRegex)];
  
  if (matches.length === 0) return { modified: false, fixes: [], src };
  
  let result = src;
  
  for (const match of matches) {
    const [fullMatch, styleContent] = match;
    let fixedStyle = styleContent;
    let blockFixes = [];
    
    // Fix 1: Color syntax - colon instead of comma in RGB/shadow values
    // Example: "0 0 30px #00ff41: 0, 0 40px" → "0 0 30px #00ff41, 0 0 40px"
    const colorColonRegex = /#([0-9a-fA-F]{3,6}):\s*(\d)/g;
    if (colorColonRegex.test(fixedStyle)) {
      fixedStyle = fixedStyle.replace(colorColonRegex, '#$1, $2');
      blockFixes.push('color-colon');
      modified = true;
    }
    
    // Fix 2: Missing semicolons after property values
    // Example: "color: white\n  background" → "color: white;\n  background"
    const missingSemiRegex = /:\s*([^;:{}]+?)\s*\n\s*([a-z-]+\s*:)/g;
    if (missingSemiRegex.test(fixedStyle)) {
      fixedStyle = fixedStyle.replace(missingSemiRegex, ': $1;\n  $2');
      blockFixes.push('missing-semicolon');
      modified = true;
    }
    
    // Fix 3: Trailing comma in last property of rule
    // Example: "margin: 0,\n  }" → "margin: 0;\n  }"
    const trailingCommaRegex = /:\s*([^;:{}]+?),\s*\n\s*}/g;
    if (trailingCommaRegex.test(fixedStyle)) {
      fixedStyle = fixedStyle.replace(trailingCommaRegex, ': $1;\n  }');
      blockFixes.push('trailing-comma');
      modified = true;
    }
    
    // Fix 4: Multiple colons in property value (common copy-paste error)
    // Example: "text-shadow: 0 0 10px: red" → "text-shadow: 0 0 10px red"
    const doubleColonRegex = /:\s*([^;:{}]+?):\s*([^;:{}]+?);/g;
    if (doubleColonRegex.test(fixedStyle)) {
      fixedStyle = fixedStyle.replace(doubleColonRegex, ': $1 $2;');
      blockFixes.push('double-colon');
      modified = true;
    }
    
    // Fix 5: Missing closing brace
    // Simple heuristic: if { count > } count, add }
    const openBraces = (fixedStyle.match(/{/g) || []).length;
    const closeBraces = (fixedStyle.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
      const missing = openBraces - closeBraces;
      fixedStyle = fixedStyle + '\n' + '}'.repeat(missing);
      blockFixes.push(`missing-${missing}-braces`);
      modified = true;
    }
    
    // Fix 6: Invalid property syntax (double periods, etc.)
    const doublePeriodRegex = /\.\./g;
    if (doublePeriodRegex.test(fixedStyle)) {
      fixedStyle = fixedStyle.replace(doublePeriodRegex, '.');
      blockFixes.push('double-period');
      modified = true;
    }
    
    if (blockFixes.length > 0) {
      result = result.replace(fullMatch, `<style>${fixedStyle}</style>`);
      fixes.push(...blockFixes);
    }
  }
  
  return { modified, fixes, src: result };
}

let totalFiles = 0;
let modifiedFiles = 0;
let totalFixes = 0;
const fixCategories = new Map();

console.log(`🔍 Scanning Svelte files for CSS errors in ${ROOT}...`);

for (const file of walk(ROOT)) {
  totalFiles++;
  const src = fs.readFileSync(file, "utf8");
  const result = fixCssSyntax(src);
  
  if (result.modified) {
    modifiedFiles++;
    totalFixes += result.fixes.length;
    
    result.fixes.forEach(fix => {
      fixCategories.set(fix, (fixCategories.get(fix) || 0) + 1);
    });
    
    if (APPLY) {
      fs.copyFileSync(file, file + '.css-backup');
      fs.writeFileSync(file, result.src, "utf8");
      console.log(`✅ ${path.relative(ROOT, file)} — ${result.fixes.length} fixes: ${result.fixes.join(', ')}`);
    } else {
      console.log(`📝 ${path.relative(ROOT, file)} — ${result.fixes.length} fixes (dry run)`);
    }
  }
  
  if (totalFiles % 100 === 0) {
    process.stdout.write(`\r⏳ Processed ${totalFiles} files...`);
  }
}

console.log(`\n\n📊 Summary:`);
console.log(`   Total files scanned: ${totalFiles}`);
console.log(`   Files with CSS errors: ${modifiedFiles}`);
console.log(`   Total fixes applied: ${totalFixes}`);
console.log(`   Estimated error reduction: ~${Math.floor(totalFixes * 3)} errors`);
console.log(`   Mode: ${APPLY ? '✅ APPLIED' : '🔍 DRY RUN'}`);

if (fixCategories.size > 0) {
  console.log(`\n🔧 Fix Categories:`);
  const sorted = Array.from(fixCategories.entries()).sort((a, b) => b[1] - a[1]);
  for (const [category, count] of sorted) {
    console.log(`   ${category.padEnd(25)} ${count.toLocaleString()} occurrences`);
  }
}

if (!APPLY) {
  console.log(`\n💡 Run with --apply to make changes`);
} else {
  console.log(`\n✅ Next steps:`);
  console.log(`   1. npx prettier --write "src/**/*.svelte"`);
  console.log(`   2. npx svelte-check > after-css-fixes.log 2>&1`);
  console.log(`   3. Compare error counts`);
}

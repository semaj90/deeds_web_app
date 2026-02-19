#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../src/routes");

console.log("🔧 Starting Svelte file repair process...\n");

let totalFiles = 0;
let fixedFiles = 0;

// Recursively find all .svelte files
function findSvelteFiles(dir) {
  const files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findSvelteFiles(fullPath));
      } else if (entry.name.endsWith(".svelte")) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    console.error(`Error reading directory ${dir}:`, e.message);
  }
  return files;
}

const files = findSvelteFiles(ROOT);
console.log(`📁 Found ${files.length} .svelte files\n`);

for (const file of files) {
  totalFiles++;
  let txt = fs.readFileSync(file, "utf8");
  let originalTxt = txt;
  let fixCount = 0;

  try {
    // Pattern 1: Fix collapsed markup (<script>...</script> <div>)
    // Split </script> from directly adjacent HTML/Svelte tags
    const collapsedPattern = /(<\/script>)(\s*)(<(?:svelte:|div|main|section|form|article|aside|header|footer|nav))/g;
    if (collapsedPattern.test(txt)) {
      txt = txt.replace(collapsedPattern, "$1\n\n$3");
      fixCount++;
      console.log(`  ✓ Pattern 1: Fixed collapsed markup in ${path.relative(ROOT, file)}`);
    }

    // Pattern 2: Fix stray semicolons before markup tags
    const straySemiPattern = /;\s*(?=<(?:svelte:|div|main|section|form|label|input|button))/g;
    if (straySemiPattern.test(txt)) {
      txt = txt.replace(straySemiPattern, "\n");
      fixCount++;
      console.log(`  ✓ Pattern 2: Removed stray semicolons in ${path.relative(ROOT, file)}`);
    }

    // Pattern 3: Fix missing commas between object properties
    // mimeType: file.type detectedType: $form.evidence_type
    // → mimeType: file.type, detectedType: $form.evidence_type
    const missingCommaPattern = /(\w+:\s*[^,}\n]+?)(\s+)(\w+\s*:)/g;
    const beforeFix = txt;
    txt = txt.replace(missingCommaPattern, (match, prop1, space, prop2) => {
      // Only add comma if this looks like consecutive properties (not a false positive)
      if (/^\w+:\s*[^,}\n]*$/.test(prop1.trim()) && /^\w+\s*:/.test(prop2)) {
        return `${prop1},\n            ${prop2}`;
      }
      return match;
    });
    if (beforeFix !== txt) {
      fixCount++;
      console.log(`  ✓ Pattern 3: Fixed missing commas in ${path.relative(ROOT, file)}`);
    }

    // Pattern 4: Fix single quotes in event handlers being on same line as markup
    // Ensure import statements come before script block
    const importBlockPattern = /(import\s+[^;]+;)(\s*let\s+|\s*function\s+|\s*const\s+)/;
    if (!importBlockPattern.test(txt) && txt.includes("import")) {
      // Already has proper imports
    }

    // Pattern 5: Clean up malformed template strings (remove stray backticks)
    txt = txt.replace(/`([^`]*)`([^`]|$)/g, (match, content, after) => {
      if (content.includes("${")) {
        return match; // Valid template literal, keep it
      }
      return `'${content}'${after}`; // Convert to regular string
    });

    // Pattern 6: Remove duplicate closing tags/content
    // Look for patterns like </div>...content...</div>
    const duplicateClosingPattern = /(<\/\w+>)([\s\S]*?)\1/;
    if (duplicateClosingPattern.test(txt)) {
      txt = txt.replace(duplicateClosingPattern, "$1");
      fixCount++;
      console.log(`  ✓ Pattern 6: Removed duplicate closing tags in ${path.relative(ROOT, file)}`);
    }

    // Only write if changes were made
    if (txt !== originalTxt) {
      fs.writeFileSync(file, txt, "utf8");
      fixedFiles++;
      console.log(`  📝 Wrote fixes (${fixCount} pattern${fixCount !== 1 ? "s" : ""}) to ${path.relative(ROOT, file)}\n`);
    }
  } catch (e) {
    console.error(`  ❌ Error processing ${file}:`, e.message);
  }
}

console.log(`\n✅ Batch repair complete!`);
console.log(`   Total files scanned: ${totalFiles}`);
console.log(`   Files fixed: ${fixedFiles}`);
console.log(`\n📋 Next steps:`);
console.log(`   1. Run: npm run build`);
console.log(`   2. Check for remaining syntax errors`);
console.log(`   3. Fix any accessibility warnings as needed\n`);

#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../src/routes");

console.log("🔧 Fixing erroneous commas added by previous batch fix...\n");

let totalFiles = 0;
let fixedFiles = 0;

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
    // Silent fail on permission errors
  }
  return files;
}

const files = findSvelteFiles(ROOT);

for (const file of files) {
  totalFiles++;
  let txt = fs.readFileSync(file, "utf8");
  const originalTxt = txt;

  try {
    // Remove erroneous commas before closing braces/brackets
    // e.g., "status: number;," → "status: number;"
    txt = txt.replace(/;\s*,\s*$/gm, ";");
    txt = txt.replace(/:\s+\w+;,\s*/g, (match) => {
      // Keep if it's inside an object (before next property), remove if before }
      return match.replace(/;,/, ";");
    });

    // Remove trailing commas in type definitions before closing }/>
    txt = txt.replace(/,\s*}>/g, " }>");
    txt = txt.replace(/,\s*}\s*$/gm, "\n}");
    txt = txt.replace(/,\s*}\s*;/g, " };");
    txt = txt.replace(/,\s*\);/g, ");");

    if (txt !== originalTxt) {
      fs.writeFileSync(file, txt, "utf8");
      fixedFiles++;
      console.log(`  ✓ Fixed erroneous commas in ${path.relative(ROOT, file)}`);
    }
  } catch (e) {
    console.error(`  ❌ Error processing ${file}:`, e.message);
  }
}

console.log(`\n✅ Erroneous comma cleanup complete!`);
console.log(`   Total files scanned: ${totalFiles}`);
console.log(`   Files fixed: ${fixedFiles}\n`);

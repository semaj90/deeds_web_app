#!/usr/bin/env node
/**
 * Phase 9 – AST normalization and import cleanup.
 *  - Uses ts-morph incremental project to rewrite imports safely
 *  - Auto-formats code and removes unused identifiers
 *  - Designed to handle 10k+ files under 8 GB heap
 */

import { Project } from "ts-morph";
import { glob } from "glob";
import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Users/james/Videos/deeds-web-app/sveltekit-frontend";
const OUTLOG = path.join(ROOT, `ast-normalize-${Date.now()}.log`);
const project = new Project({
  skipAddingFilesFromTsConfig: true,
  manipulationSettings: {
    indentSize: 2,
    useTabs: false,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true
  }
});

function log(msg) {
  fs.appendFileSync(OUTLOG, msg + "\n");
}

console.log("🔍 Collecting TypeScript and Svelte files...");
const files = await glob(`${ROOT}/src/**/*.{ts,svelte}`, {
  ignore: ["**/node_modules/**", "**/build/**", "**/.svelte-kit/**", "**/dist/**", "**/.backup/**"]
});
log(`Files found: ${files.length}`);
console.log(`Found ${files.length} files to process`);

let count = 0;
let modified = 0;
let errors = 0;

for (const f of files) {
  try {
    const sf = project.addSourceFileAtPath(f);
    
    // Track if file was modified
    const originalText = sf.getFullText();
    
    // Apply transformations
    sf.fixUnusedIdentifiers();
    sf.organizeImports();
    sf.formatText({ indentSize: 2 });
    
    // Save if modified
    const newText = sf.getFullText();
    if (originalText !== newText) {
      await sf.save();
      modified++;
      log(`✔ [modified] ${f}`);
    } else {
      log(`○ [unchanged] ${f}`);
    }
    
    if (++count % 100 === 0) {
      console.log(`Progress: ${count}/${files.length} (modified: ${modified}, errors: ${errors})`);
    }
  } catch (err) {
    errors++;
    log(`⚠️ [skip] ${f} :: ${err.message}`);
    console.error(`Error processing ${f}: ${err.message}`);
  }
}

console.log(`\n✅ AST normalization complete`);
console.log(`   Files processed: ${count}`);
console.log(`   Files modified: ${modified}`);
console.log(`   Errors: ${errors}`);
console.log(`   Log: ${OUTLOG}`);

// Write summary JSON
const summary = {
  timestamp: new Date().toISOString(),
  filesProcessed: count,
  filesModified: modified,
  errors: errors,
  logFile: OUTLOG
};

fs.writeFileSync(
  path.join(ROOT, `ast-normalize-summary-${Date.now()}.json`),
  JSON.stringify(summary, null, 2)
);

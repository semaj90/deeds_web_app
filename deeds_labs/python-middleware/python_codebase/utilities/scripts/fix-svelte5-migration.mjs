#!/usr/bin/env node

/**
 * Automated Svelte 4 → 5 Migration Script
 * Fixes common migration issues programmatically
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const FIXES_APPLIED = {
  exportLetToProps: 0,
  slotToSnippet: 0,
  onMountSyntax: 0,
  duplicateImports: 0,
  typeIssues: 0,
  cssIssues: 0,
  nullableTypes: 0
};

// Patterns for different fixes
const PATTERNS = {
  // Svelte 5 Migration
  exportLet: /export\s+let\s+(\w+)(?:\s*:\s*([^=;]+?))?\s*(?:=\s*([^;]+?))?;/g,
  slotDefault: /<slot\s*(?:name="default")?\s*\/?>[\s\S]*?<\/slot>/g,
  slotNamed: /<slot\s+name="(\w+)"\s*\/?>[\s\S]*?<\/slot>/g,

  // Syntax fixes
  malformedOnMount: /onMount\(\([^)]*\)\s*>\([^{]*\{/g,
  malformedArrow: /\)\s*>\([^{]*\{/g,
  missingParenCSS: /minmax\([^)]+;/g,

  // Type issues
  neverArray: /:\s*never\[\]/g,
  implicitAny: /\((\w+)\)\s*=>/g,

  // Duplicate imports
  duplicateImport:
    /import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];\s*import\s*\{[^}]*\}\s*from\s*['"]svelte['"];/g,
};

function findSvelteFiles(dir, files = []) {
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules, .git, dist, etc.
      if (
        !["node_modules", ".git", "dist", "build", ".svelte-kit"].includes(item)
      ) {
        findSvelteFiles(fullPath, files);
      }
    } else if (
      item.endsWith(".svelte") ||
      item.endsWith(".ts") ||
      item.endsWith(".js")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

function fixExportLetToProps(content) {
  let hasExportLet = false;
  const propDeclarations = [];

  // Extract export let statements
  content = content.replace(
    PATTERNS.exportLet,
    (match, name, type, defaultValue) => {
      hasExportLet = true;
      let propDef = name;
      if (type) propDef += `: ${type.trim()}`;
      if (defaultValue) propDef += ` = ${defaultValue.trim()}`;
      propDeclarations.push(propDef);
      return ""; // Remove the export let
    }
  );

  if (hasExportLet) {
    // Add $props() destructuring at the top of script
    const scriptMatch = content.match(/<script[^>]*>/);
    if (scriptMatch) {
      const insertPos = scriptMatch.index + scriptMatch[0].length;
      const propsCode = `\n  const { ${propDeclarations.join(
        ", "
      )} } = $props();\n`;
      content =
        content.slice(0, insertPos) + propsCode + content.slice(insertPos);
    }
    FIXES_APPLIED.exportLetToProps++;
  }

  return content;
}

function fixSlotToSnippet(content) {
  // Fix default slots
  content = content.replace(PATTERNS.slotDefault, () => {
    FIXES_APPLIED.slotToSnippet++;
    return "{@render children?.()}";
  });

  // Fix named slots
  content = content.replace(PATTERNS.slotNamed, (match, slotName) => {
    FIXES_APPLIED.slotToSnippet++;
    return `{@render ${slotName}?.()}`;
  });

  return content;
}

function fixSyntaxIssues(content) {
  // Fix malformed onMount syntax
  content = content.replace(PATTERNS.malformedOnMount, () => {
    FIXES_APPLIED.onMountSyntax++;
    return "onMount(() => {";
  });

  // Fix malformed arrow functions
  content = content.replace(PATTERNS.malformedArrow, () => {
    return ") => {";
  });

  // Fix CSS minmax missing parentheses
  content = content.replace(PATTERNS.missingParenCSS, (match) => {
    FIXES_APPLIED.cssIssues++;
    return match.replace(";", ")");
  });

  return content;
}

function fixTypeIssues(content) {
  // Fix never[] arrays - replace with proper array types
  content = content.replace(PATTERNS.neverArray, () => {
    FIXES_APPLIED.typeIssues++;
    return ": string[]"; // Most commonly these should be string arrays
  });

  // Add type annotations to implicit any parameters
  content = content.replace(/\((\w+)\)\s*=>\s*\w+\.length/g, (match, param) => {
    FIXES_APPLIED.typeIssues++;
    return match.replace(`(${param})`, `(${param}: string)`);
  });

  return content;
}

function fixDuplicateImports(content) {
  const importLines =
    content.match(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];/g) || [];
  const svelteImports = importLines.filter(
    (line) => line.includes("from 'svelte'") || line.includes('from "svelte"')
  );

  if (svelteImports.length > 1) {
    // Combine all svelte imports
    const allImports = new Set();
    svelteImports.forEach((line) => {
      const match = line.match(/import\s*\{([^}]*)\}/);
      if (match) {
        match[1].split(",").forEach((imp) => {
          allImports.add(imp.trim());
        });
      }
    });

    // Remove all individual svelte imports
    svelteImports.forEach((line) => {
      content = content.replace(line, "");
    });

    // Add single combined import
    const combinedImport = `import { ${Array.from(allImports).join(
      ", "
    )} } from 'svelte';`;
    const scriptMatch = content.match(/<script[^>]*>/);
    if (scriptMatch) {
      const insertPos = scriptMatch.index + scriptMatch[0].length;
      content =
        content.slice(0, insertPos) +
        "\n  " +
        combinedImport +
        "\n" +
        content.slice(insertPos);
    }

    FIXES_APPLIED.duplicateImports++;
  }

  return content;
}

function fixNullableTypes(content) {
  // Fix common null pointer issues by adding optional chaining
  content = content.replace(/currentFeedbackTrigger\.(\w+)/g, (match, prop) => {
    FIXES_APPLIED.nullableTypes++;
    return `currentFeedbackTrigger?.${prop}`;
  });

  return content;
}

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, "utf8");
    const originalContent = content;

    // Apply all fixes
    content = fixExportLetToProps(content);
    content = fixSlotToSnippet(content);
    content = fixSyntaxIssues(content);
    content = fixTypeIssues(content);
    content = fixDuplicateImports(content);
    content = fixNullableTypes(content);

    // Only write if content changed
    if (content !== originalContent) {
      writeFileSync(filePath, content);
      console.log(`✓ Fixed: ${filePath}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  const rootDir = process.cwd();
  console.log("🔧 Starting Svelte 4 → 5 Migration Fixes...\n");

  // Find all relevant files
  const files = findSvelteFiles(rootDir);
  console.log(`📁 Found ${files.length} files to process\n`);

  let processedCount = 0;
  let fixedCount = 0;

  // Process each file
  for (const file of files) {
    // Skip backup and archive files
    if (
      file.includes("backup") ||
      file.includes("archive") ||
      file.includes(".stories.")
    ) {
      continue;
    }

    processedCount++;
    if (processFile(file)) {
      fixedCount++;
    }
  }

  // Report results
  console.log("\n📊 Migration Summary:");
  console.log(`Files processed: ${processedCount}`);
  console.log(`Files fixed: ${fixedCount}`);
  console.log("\n🔧 Fixes applied:");
  Object.entries(FIXES_APPLIED).forEach(([fix, count]) => {
    if (count > 0) {
      console.log(`  ${fix}: ${count}`);
    }
  });

  console.log("\n✅ Migration fixes complete!");
}

main();
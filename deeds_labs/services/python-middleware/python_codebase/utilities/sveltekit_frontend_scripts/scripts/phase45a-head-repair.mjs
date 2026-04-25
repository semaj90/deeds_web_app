#!/usr/bin/env node
/**
 * Phase 45A - Head Repair Utility
 *
 * Restores truncated <svelte:head> sections and fixes collapsed markup
 * across the AI route directory. Helps clean up after automated fixes
 * that removed metadata blocks during Phase 44.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROUTES_ROOT = path.resolve(__dirname, "../src/routes/(ai)");

function listSvelteFiles(root) {
  const results = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...listSvelteFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".svelte")) {
      results.push(fullPath);
    }
  }
  return results;
}

function ensureHeadBlock(source, filePath) {
  // If there's already a populated <svelte:head>, leave it alone.
  if (/<svelte:head>[\s\S]*<\/svelte:head>/.test(source)) {
    return { updated: false, content: source };
  }

  const hasHeadTag = source.includes("<svelte:head>");

  let insertion = `<svelte:head>\n  <title>${deriveTitle(filePath)}</title>\n</svelte:head>\n\n`;
  let updated = false;

  if (hasHeadTag) {
    // Empty head detected: replace it with the generated block.
    const replaced = source.replace("<svelte:head>", insertion).replace("</svelte:head>", "");
    if (replaced !== source) {
      updated = true;
      source = replaced;
    }
  } else {
    // Insert after the first </script> block if possible.
    if (source.includes("</script>")) {
      const replaced = source.replace("</script>", `</script>\n\n${insertion}`);
      if (replaced !== source) {
        updated = true;
        source = replaced;
      }
    } else {
      // No script block? Prepend at the top of the file.
      source = `${insertion}${source}`;
      updated = true;
    }
  }

  return { updated, content: source };
}

function normalizeClosings(source) {
  let updated = false;
  const replacements = [
    { pattern: /<\/div><\/div>/g, value: "</div>\n</div>" },
    { pattern: /<\/section><\/section>/g, value: "</section>\n</section>" }
  ];

  for (const { pattern, value } of replacements) {
    if (pattern.test(source)) {
      source = source.replace(pattern, value);
      updated = true;
    }
  }

  return { updated, content: source };
}

function deriveTitle(filePath) {
  const filename = path.basename(filePath, ".svelte");
  const cleaned = filename.replace(/\+page$/, "").replace(/\+/g, " ");
  return cleaned
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "AI Page";
}

function ensureNewlineEOF(source) {
  return source.endsWith("\n") ? source : `${source}\n`;
}

function main() {
  if (!fs.existsSync(ROUTES_ROOT)) {
    console.error("AI routes directory not found:", ROUTES_ROOT);
    process.exit(1);
  }

  const files = listSvelteFiles(ROUTES_ROOT);
  let touched = 0;

  for (const file of files) {
    const original = fs.readFileSync(file, "utf8");
    let updatedContent = original;
    let modified = false;

    const headResult = ensureHeadBlock(updatedContent, file);
    if (headResult.updated) {
      updatedContent = headResult.content;
      modified = true;
    }

    const closingResult = normalizeClosings(updatedContent);
    if (closingResult.updated) {
      updatedContent = closingResult.content;
      modified = true;
    }

    const finalContent = ensureNewlineEOF(updatedContent);
    if (modified || finalContent !== original) {
      fs.writeFileSync(file, finalContent, "utf8");
      touched++;
      console.log("🔧 Repaired head/markup:", path.relative(ROUTES_ROOT, file));
    }
  }

  console.log(
    touched > 0
      ? `✅ Phase 45A Head Repair complete. Updated ${touched} file${touched === 1 ? "" : "s"}.`
      : "✅ Phase 45A Head Repair complete. No changes required."
  );
}

main();

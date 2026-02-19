#!/usr/bin/env npx tsx
/**
 * Phase49 - CSS Sanitizer for Svelte styles
 * ----------------------------------------
 * Scans Svelte components for malformed selector syntax that causes PostCSS
 * to abort (e.g. `.btn: hover`, `.slider: :-webkit-thumb`).
 * The script normalises common pseudo selector spacing issues so that
 * `svelte-check --output json` can complete and emit diagnostics.
 *
 * Run with:
 *   npx tsx scripts/phase49-sanitize-css.ts
 */

import { glob } from "glob";
import { promises as fs } from "node:fs";
import path from "node:path";

const WORKSPACE_ROOT = process.cwd();
const TARGET_DIR = path.join(WORKSPACE_ROOT, "sveltekit-frontend", "src");
const STYLE_BLOCK_REGEX = /<style(\s[^>]*)?>([\s\S]*?)<\/style>/gi;

const pseudoTokens = [
  "hover",
  "focus",
  "active",
  "visited",
  "link",
  "checked",
  "disabled",
  "enabled",
  "focus-visible",
  "focus-within",
  "focus-ring",
  "not",
  "is",
  "where",
  "has",
  "nth-child",
  "nth-of-type",
  "nth-last-child",
  "nth-last-of-type",
  "first-child",
  "last-child",
  "first-of-type",
  "last-of-type",
  "only-child",
  "only-of-type",
  "before",
  "after",
  "backdrop",
  "marker",
  "selection",
  "placeholder",
  "file-selector-button",
  "slotted",
  "host",
  "host-context",
  "target",
  "target-within",
  "valid",
  "invalid",
  "required",
  "optional",
  "read-only",
  "read-write",
  "root",
  "global",
  "deep",
  "lang",
  "any-link",
  "scope",
  "state",
  "part",
];

const escapedTokens = pseudoTokens
  .map((token) => token.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
  .join("|");
const pseudoSpacingRegex = new RegExp(`:\\s+(?=(?:${escapedTokens})(?:\\b|\\())`, "gi");

interface SanitizeResult {
  css: string;
  changeCount: number;
  changeSummary: string[];
}

function sanitiseCss(css: string): SanitizeResult {
  let updated = css;
  let totalChanges = 0;
  const summaries: string[] = [];

  const applyPattern = (
    pattern: RegExp,
    replacer: string | ((...args: unknown[]) => string),
    summary: string,
  ) => {
    let localCount = 0;
    if (typeof replacer === "function") {
      updated = updated.replace(pattern, (...args: unknown[]) => {
        localCount += 1;
        return replacer(...args);
      });
    } else {
      updated = updated.replace(pattern, () => {
        localCount += 1;
        return replacer;
      });
    }

    if (localCount > 0) {
      totalChanges += localCount;
      summaries.push(`${summary} ×${localCount}`);
    }
  };

  applyPattern(pseudoSpacingRegex, ":", "trimmed pseudo selector spacing");
  applyPattern(/:\s+:(?=[\w-])/g, "::", "collapsed vendor pseudo prefix spacing");
  applyPattern(/::\s+(?=[\w-])/g, "::", "trimmed pseudo-element spacing");
  applyPattern(
    /:(not|is|where|has|global|deep|slotted|host)\s+\(\s*/gi,
    (_, token: string) => `:${token}(`,
    "normalised function-like pseudo spacing",
  );

  return { css: updated, changeCount: totalChanges, changeSummary: summaries };
}

async function processFile(filePath: string): Promise<number> {
  const original = await fs.readFile(filePath, "utf8");
  let totalChanges = 0;
  const changeDescriptions: string[] = [];

  const rewritten = original.replace(STYLE_BLOCK_REGEX, (fullMatch, attrs = "", block = "") => {
    const { css, changeCount, changeSummary } = sanitiseCss(String(block));
    if (changeCount === 0) {
      return fullMatch;
    }

    totalChanges += changeCount;
    changeDescriptions.push(...changeSummary);
    return `<style${attrs ?? ""}>${css}</style>`;
  });

  if (totalChanges > 0) {
    await fs.writeFile(filePath, rewritten, "utf8");
    const relativePath = path.relative(WORKSPACE_ROOT, filePath);
    const uniqueSummaries = Array.from(new Set(changeDescriptions));
    console.log(
      `[phase49] sanitised ${relativePath} (${uniqueSummaries.join("; ")}, total fixes ${totalChanges})`,
    );
  }

  return totalChanges;
}

async function main() {
  const pattern = path.join(TARGET_DIR, "**", "*.svelte").replace(/\\/g, "/");
  const files = await glob(pattern, { nodir: true });

  if (files.length === 0) {
    console.log("[phase49] No Svelte components found. Nothing to do.");
    return;
  }

  let filesUpdated = 0;
  let transformations = 0;

  for (const file of files) {
    const fileChanges = await processFile(file);
    if (fileChanges > 0) {
      filesUpdated += 1;
      transformations += fileChanges;
    }
  }

  if (filesUpdated === 0) {
    console.log("[phase49] No malformed selectors detected. 🎉");
  } else {
    console.log(
      `[phase49] Complete. Updated ${filesUpdated} file(s) with ${transformations} transformation(s).`,
    );
  }
}

main().catch((error) => {
  console.error("[phase49] Fatal error:", error);
  process.exit(1);
});

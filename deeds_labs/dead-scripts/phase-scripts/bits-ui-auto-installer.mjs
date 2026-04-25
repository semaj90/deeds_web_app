/**
 * Phase52 — Bits-UI Auto-Installer & Stripper
 * --------------------------------------------
 * Advanced mode for automatic dependency management and component stripping
 *
 * Usage:
 *   node scripts/bits-ui-auto-installer.mjs --install-missing
 *   node scripts/bits-ui-auto-installer.mjs --strip-advanced
 *   node scripts/bits-ui-auto-installer.mjs --full-cleanup
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import glob from "fast-glob";
import { analyze, fixDeps, stripAdvanced } from './check-bits-ui-integrity.mjs';

const PROJECT_ROOT = process.cwd();

// ------------------------------------------------------------
// AUTO-INSTALLER: Smart dependency management
// ------------------------------------------------------------
function autoInstallMissingDeps() {
  console.log("🔧 Auto-Installer Mode: Scanning and fixing dependencies...");

  const analysis = analyze();

  if (analysis.missingDeps.length > 0) {
    console.log(`📦 Installing ${analysis.missingDeps.length} missing dependencies...`);
    fixDeps(analysis.missingDeps);
  } else {
    console.log("✅ All dependencies are already installed");
  }

  // Also check for optional dependencies that might be needed
  const optionalMissing = ['@swc/helpers'].filter(dep => {
    try {
      require.resolve(dep, { paths: [PROJECT_ROOT] });
      return false;
    } catch {
      return true;
    }
  });

  if (optionalMissing.length > 0) {
    console.log(`📦 Installing optional dependencies: ${optionalMissing.join(', ')}`);
    installDeps(optionalMissing);
  }
}

// ------------------------------------------------------------
// AUTO-STRIPPER: Remove advanced components and their deps
// ------------------------------------------------------------
function autoStripAdvanced() {
  console.log("🗑️  Auto-Stripper Mode: Removing advanced components...");

  const analysis = analyze();

  if (analysis.advancedUsage.length > 0) {
    console.log(`🗑️  Stripping ${analysis.advancedUsage.length} advanced components...`);
    stripAdvanced(analysis.advancedUsage);

    // Check if @internationalized/date is still needed
    const stillNeedsIntlDate = analysis.bitsImports.some(({ component }) =>
      !['calendar', 'range-calendar', 'time-field', 'date-field', 'date-picker'].includes(component)
    );

    if (!stillNeedsIntlDate) {
      console.log("🗑️  @internationalized/date no longer needed, removing...");
      uninstallDeps(['@internationalized/date']);
    }
  } else {
    console.log("✅ No advanced components found to strip");
  }
}

// ------------------------------------------------------------
// FULL CLEANUP: Comprehensive Bits-UI optimization
// ------------------------------------------------------------
function fullCleanup() {
  console.log("🧹 Full Cleanup Mode: Optimizing Bits-UI usage...");

  // First strip advanced components
  autoStripAdvanced();

  // Then check for unused basic components
  const analysis = analyze();
  const usedComponents = new Set(analysis.bitsImports.map(({ component }) => component));

  const allBasicComponents = [
    'button', 'checkbox', 'input', 'label', 'select', 'slider',
    'switch', 'textarea', 'tooltip', 'badge', 'progress'
  ];

  const unusedComponents = allBasicComponents.filter(comp => !usedComponents.has(comp));

  if (unusedComponents.length > 0) {
    console.log(`🗑️  Found ${unusedComponents.length} unused basic components: ${unusedComponents.join(', ')}`);
    console.log("💡 Consider removing these from your Bits-UI imports to reduce bundle size");
  }

  // Check for inefficient import patterns
  const files = glob.sync("src/**/*.{svelte,ts,js}", { cwd: PROJECT_ROOT });
  let inefficientImports = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    // Look for individual component imports instead of barrel imports
    if (content.includes("from 'bits-ui/") && !content.includes("from 'bits-ui'")) {
      inefficientImports++;
    }
  }

  if (inefficientImports > 0) {
    console.log(`💡 Found ${inefficientImports} files with individual component imports`);
    console.log("💡 Consider using: import { Button, Input } from 'bits-ui';");
  }

  console.log("✅ Full cleanup complete!");
}

// ------------------------------------------------------------
// UTIL: Uninstall dependencies
// ------------------------------------------------------------
function uninstallDeps(pkgs) {
  console.log(`🗑️  Uninstalling: ${pkgs.join(", ")}`);
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  spawnSync(cmd, ["uninstall", ...pkgs], { stdio: "inherit" });
}

// ------------------------------------------------------------
// UTIL: Install dependencies (helper)
// ------------------------------------------------------------
function installDeps(pkgs) {
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  spawnSync(cmd, ["install", ...pkgs], { stdio: "inherit" });
}

// ------------------------------------------------------------
// MAIN: Parse advanced args
// ------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--install-missing')) {
    autoInstallMissingDeps();
  } else if (args.includes('--strip-advanced')) {
    autoStripAdvanced();
  } else if (args.includes('--full-cleanup')) {
    fullCleanup();
  } else {
    console.log("🔧 Bits-UI Auto-Installer & Stripper");
    console.log("====================================");
    console.log("");
    console.log("Usage:");
    console.log("  --install-missing    Auto-install missing @internationalized/* deps");
    console.log("  --strip-advanced     Remove calendar/time components and their deps");
    console.log("  --full-cleanup       Comprehensive optimization (strip + analyze)");
    console.log("");
    console.log("Examples:");
    console.log("  node scripts/bits-ui-auto-installer.mjs --install-missing");
    console.log("  node scripts/bits-ui-auto-installer.mjs --strip-advanced");
    console.log("  node scripts/bits-ui-auto-installer.mjs --full-cleanup");
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { autoInstallMissingDeps, autoStripAdvanced, fullCleanup };
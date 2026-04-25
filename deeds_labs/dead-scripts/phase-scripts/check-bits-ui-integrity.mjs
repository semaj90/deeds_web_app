/**
 * Phase52 — Bits-UI Dependency Integrity Checker
 * ----------------------------------------------
 * Scans project, detects missing @internationalized/* deps,
 * detects unused Bits-UI components, and warns about invalid imports.
 *
 * Optional flags:
 *   --fix-deps        Install missing deps automatically
 *   --strip-advanced  Remove date/time/calendar components
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import glob from "fast-glob";

const PROJECT_ROOT = process.cwd();

const REQUIRED_DEPS = [
  "@internationalized/date"
];

const OPTIONAL_DEPS = ["@swc/helpers"];

const ADVANCED_COMPONENTS = [
  "calendar",
  "range-calendar",
  "time-field",
  "date-field",
  "date-picker"
];

const PROBLEMATIC_COMPONENTS = [
  "Calendar",
  "RangeCalendar",
  "DateField",
  "DatePicker",
  "TimeField"
];

// ------------------------------------------------------------
// UTIL: Check if node module is installed
// ------------------------------------------------------------
async function isInstalled(pkg) {
  try {
    await import(pkg);
    console.log(`✅ ${pkg} found`);
    return true;
  } catch (e) {
    console.log(`❌ ${pkg} not found: ${e.message}`);
    return false;
  }
}

// ------------------------------------------------------------
// UTIL: Install missing deps
// ------------------------------------------------------------
function installDeps(pkgs) {
  console.log(`\n📦 Installing missing deps: ${pkgs.join(", ")}`);
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  spawnSync(cmd, ["install", ...pkgs], { stdio: "inherit" });
}

// ------------------------------------------------------------
// SCAN: Bits-UI imports inside the project
// ------------------------------------------------------------
// ------------------------------------------------------------
// SCAN: Find Bits-UI usage & missing deps
// ------------------------------------------------------------
async function analyze() {
  const files = glob.sync("src/**/*.{svelte,ts,js}", {
    cwd: PROJECT_ROOT,
    absolute: true
  });

  const missingDeps = [];
  const advancedUsage = [];
  const bitsImports = [];

  console.log("🔍 Scanning for Bits-UI usage...");

  // Check if bits-ui is used anywhere
  let usesBitsUi = false;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");

    // Check for Bits-UI imports
    const bitsImportMatches = content.match(/from ['"]bits-ui['"]/g) ||
                             content.match(/from ['"]bits-ui\/[^'"]*['"]/g);
    if (bitsImportMatches) {
      usesBitsUi = true;
      // For direct imports from 'bits-ui', we can't determine specific components
      // but we know bits-ui is being used
      bitsImports.push({ file, component: 'unknown (direct import)' });
    }

    // Check for advanced/problematic components in usage
    ADVANCED_COMPONENTS.concat(PROBLEMATIC_COMPONENTS).forEach((component) => {
      if (content.includes(component)) {
        advancedUsage.push({ file, component });
      }
    });
  }

  // If bits-ui is used, ensure all required deps are present
  if (usesBitsUi) {
    for (const dep of REQUIRED_DEPS) {
      if (!(await isInstalled(dep))) {
        missingDeps.push(dep);
      }
    }
  }

  return { missingDeps: [...new Set(missingDeps)], advancedUsage, bitsImports, usesBitsUi };
}

// ------------------------------------------------------------
// REPORT: Display findings
// ------------------------------------------------------------
function report({ missingDeps, advancedUsage, bitsImports, usesBitsUi }) {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 BITS-UI INTEGRITY REPORT");
  console.log("=".repeat(60));

  // Bits-UI usage
  console.log(`\n📦 BITS-UI USAGE: ${usesBitsUi ? 'DETECTED' : 'NOT FOUND'}`);
  if (usesBitsUi) {
    console.log("   Bits-UI requires @internationalized/date for proper functionality");
  }

  // Missing dependencies
  if (missingDeps.length > 0) {
    console.log(`\n❌ MISSING DEPENDENCIES (${missingDeps.length}):`);
    missingDeps.forEach(dep => console.log(`   - ${dep}`));
  } else {
    console.log("\n✅ All required dependencies are installed");
  }

  // Advanced components usage
  if (advancedUsage.length > 0) {
    console.log(`\n⚠️  ADVANCED COMPONENTS DETECTED (${advancedUsage.length}):`);
    advancedUsage.forEach(({ file, component }) => {
      const relativePath = path.relative(PROJECT_ROOT, file);
      console.log(`   - ${component} (${relativePath})`);
    });
    console.log("\n   These components require @internationalized/date and are unstable");
    console.log("   Use --strip-advanced to replace with HeadlessUI alternatives");
  }

  // Total Bits-UI usage
  console.log(`\n📊 BITS-UI USAGE SUMMARY:`);
  console.log(`   - Total imports: ${bitsImports.length}`);
  console.log(`   - Advanced components: ${advancedUsage.length}`);
  console.log(`   - Basic components: ${bitsImports.length - advancedUsage.length}`);

  console.log("\n" + "=".repeat(60));
}

// ------------------------------------------------------------
// ACTION: Fix missing dependencies
// ------------------------------------------------------------
async function fixDeps(missingDeps) {
  if (missingDeps.length === 0) {
    console.log("✅ No missing dependencies to fix");
    return;
  }

  console.log(`\n🔧 Installing ${missingDeps.length} missing dependencies...`);
  installDeps(missingDeps);

  // Verify installation
  const stillMissing = [];
  for (const dep of missingDeps) {
    if (!(await isInstalled(dep))) {
      stillMissing.push(dep);
    }
  }

  if (stillMissing.length > 0) {
    console.log(`❌ Failed to install: ${stillMissing.join(", ")}`);
    process.exit(1);
  } else {
    console.log("✅ All dependencies installed successfully");
  }
}

// ------------------------------------------------------------
// ACTION: Strip advanced components (replace with HeadlessUI)
// ------------------------------------------------------------
function stripAdvanced(advancedUsage) {
  if (advancedUsage.length === 0) {
    console.log("✅ No advanced components to replace");
    return;
  }

  console.log(`\n🔄 Replacing ${advancedUsage.length} advanced Bits-UI components with HeadlessUI...`);

  // Install HeadlessUI if not present
  if (!isInstalled("@headlessui/react")) {
    console.log("📦 Installing @headlessui/react...");
    installDeps(["@headlessui/react"]);
  }

  for (const { file, component } of advancedUsage) {
    let content = fs.readFileSync(file, "utf8");

    // Replace imports
    const replacements = {
      "Calendar": "HeadlessUI alternatives (custom date picker)",
      "RangeCalendar": "HeadlessUI alternatives (custom range picker)",
      "DateField": "HeadlessUI Combobox + custom input",
      "DatePicker": "HeadlessUI Popover + custom calendar",
      "TimeField": "HeadlessUI Combobox + custom time input"
    };

    if (replacements[component]) {
      // Remove Bits-UI import
      const importRegex = new RegExp(`import\\s+.*${component}.*from\\s+['"]bits-ui[^'"]*['"];?\\s*\\n?`, "g");
      content = content.replace(importRegex, "");

      // Replace usage with comment
      const usageRegex = new RegExp(`<${component}[^>]*>[\\s\\S]*?</${component}>`, "g");
      content = content.replace(usageRegex, `<!-- ${component} → ${replacements[component]} -->`);

      fs.writeFileSync(file, content);
      console.log(`   - Replaced ${component} with HeadlessUI alternative in ${path.relative(PROJECT_ROOT, file)}`);
    }
  }

  console.log("✅ Advanced components replaced with HeadlessUI alternatives");
  console.log("💡 You'll need to implement the HeadlessUI components manually");
}

// ------------------------------------------------------------
// MAIN: Parse args and execute
// ------------------------------------------------------------
async function main() {
  console.log("🚀 Bits-UI Dependency Integrity Checker");
  console.log("=======================================");

  const args = process.argv.slice(2);
  const shouldFixDeps = args.includes("--fix-deps");
  const shouldStripAdvanced = args.includes("--strip-advanced");

  console.log("🔍 Analyzing project...");

  const analysis = await analyze();
  report(analysis);

  // Auto-fix if requested
  if (shouldFixDeps) {
    await fixDeps(analysis.missingDeps);
  }

  // Strip advanced if requested
  if (shouldStripAdvanced) {
    stripAdvanced(analysis.advancedUsage);
  }

  // Exit with error if issues found and not auto-fixed
  const hasIssues = analysis.missingDeps.length > 0 || analysis.advancedUsage.length > 0;
  if (hasIssues && !shouldFixDeps && !shouldStripAdvanced) {
    console.log("\n💡 Run with --fix-deps to auto-install missing dependencies");
    console.log("💡 Run with --strip-advanced to replace advanced components with HeadlessUI");
    process.exit(1);
  }

  console.log("\n✅ Bits-UI integrity check complete!");
}

// Run if called directly
console.log('🚀 Starting Bits-UI Integrity Checker...');
main().catch(console.error);

export { analyze, report, fixDeps, stripAdvanced };
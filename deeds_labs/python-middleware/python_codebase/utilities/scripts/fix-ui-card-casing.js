"use strict";
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const uiDir = path.join(
  repoRoot,
  "sveltekit-frontend",
  "src",
  "lib",
  "components",
  "ui"
);

function walkSync(dir) {
  // Safely handle missing directories
  if (!fs.existsSync(dir)) return [];
  let results = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkSync(full));
    } else {
      results.push(full);
    }
  });
  return results;
}

function updateImportsInFile(file, fromRegex, replacement) {
  const content = fs.readFileSync(file, "utf8");
  const updated = content.replace(fromRegex, replacement);
  if (updated !== content) {
    fs.writeFileSync(file, updated, "utf8");
    console.log("Updated imports in", path.relative(repoRoot, file));
  }
}

async function main() {
  try {
    // gather files to search (safe if src missing)
    const srcRoot = path.join(repoRoot, "sveltekit-frontend", "src");
    const allFiles = walkSync(srcRoot);
    const filesToSearch = allFiles.filter((f) =>
      /\.(svelte|ts|js|jsx|tsx)$/.test(f)
    );

    const lower = path.join(uiDir, "card.js");
    const upper = path.join(uiDir, "Card.js");
    const canonical = path.join(uiDir, "CardComponent.js");

    const lowerExists = fs.existsSync(lower);
    const upperExists = fs.existsSync(upper);
    const canonicalExists = fs.existsSync(canonical);

    if (upperExists && !canonicalExists) {
      fs.renameSync(upper, canonical);
      console.log(
        "Renamed:",
        path.relative(repoRoot, upper),
        "->",
        path.relative(repoRoot, canonical)
      );
    } else if (!upperExists && canonicalExists) {
      console.log(
        "Canonical already present:",
        path.relative(repoRoot, canonical)
      );
    } else {
      console.log(
        "No case-only Card.js / card.js conflict detected or canonical exists already."
      );
    }

    // Replace imports that reference either case to the canonical name
    const importRegex = /(\$lib\/components\/ui\/)(?:card|Card)(['"])/g;
    const replacement = "$1CardComponent$2";

    filesToSearch.forEach((f) =>
      updateImportsInFile(f, importRegex, replacement)
    );

    console.log("Done. Please run your build to verify (e.g. npm run dev).");
  } catch (err) {
    console.error("Error running script:", err);
    process.exit(1);
  }
}

main();

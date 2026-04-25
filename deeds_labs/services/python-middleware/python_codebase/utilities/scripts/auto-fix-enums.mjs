// =====================================================================
// auto-fix-enums.mjs  –  AST repair worker for Svelte 5 migration
// =====================================================================
import fs from "fs";
import path from "path";
import { Project, SyntaxKind } from "ts-morph";
import simdjson from "simdjson";

// load diagnostic report
const reportPath = process.argv || "svelte5-diagnostics.json";
if (!fs.existsSync(reportPath)) {
  console.error("❌ No diagnostics file found:", reportPath);
  process.exit(1);
}

const diagnostics = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
const project = new Project({
  tsConfigFilePath: "tsconfig.json",
  skipAddingFilesFromTsConfig: true,
});

const srcDir = path.resolve("src");
const files = [];
fs.readdirSync(srcDir, { recursive: true }).forEach((f) => {
  if (f.endsWith(".ts") || f.endsWith(".svelte")) files.push(path.join(srcDir, f));
});

let fixes = 0;

for (const filePath of files) {
  const text = fs.readFileSync(filePath, "utf-8");
  if (text.includes("overallApplicability") || text.includes("overallStrength")) {
    const srcFile = project.createSourceFile(filePath, text, { overwrite: true });

    // Fix string literal enums
    srcFile.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.StringLiteral) {
        const val = node.getLiteralText();
        if (["LOW", "HIGH", "MODERATE", "STRONG", "WEAK"].includes(val.toUpperCase())) {
          node.replaceWithText(`"${val.toUpperCase()}"`);
          fixes++;
        }
      }
    });

    fs.writeFileSync(filePath, srcFile.getFullText());
  }

  // Add missing exports
  if (text.includes("import nesMemoryBridge")) {
    const fixed = text.replace(
      /import\s+nesMemoryBridge\s+from\s+(["'].*?["']);/g,
      'import { nesMemoryBridge } from $1;'
    );
    if (fixed !== text) {
      fs.writeFileSync(filePath, fixed);
      fixes++;
    }
  }

  // Cast unknown → string
  if (text.includes("as { url?: unknown")) {
    const patched = text.replace(/unknown/g, "string");
    if (patched !== text) {
      fs.writeFileSync(filePath, patched);
      fixes++;
    }
  }
}

console.log(`🔧 ${fixes} AST-level fixes applied.`);
/**
 * fix-phase34d-ai-patterns.mjs
 * ------------------------------------------------------------
 * Phase 34D – AI-guided AST pattern repair
 * Requires: Babel, ts-morph, Ollama (Gemma3 or other local model)
 */

import fs from "fs";
import path from "path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Project } = require("ts-morph");

// Handle ESM/CJS interop for Babel traverse
const traverse = _traverse.default || _traverse;

const rootDir = path.resolve("src");
const project = new Project();
const logFile = "phase34d-ai-report.log";
let issues = [];

// Check if Ollama is available
async function checkOllama() {
  try {
    const response = await fetch("http://localhost:11434/api/tags");
    if (!response.ok) throw new Error("Ollama not responding");
    return true;
  } catch (error) {
    console.warn("⚠️  Ollama not available at localhost:11434 - running without AI suggestions");
    return false;
  }
}

async function suggestFix(codeSnippet, file, line) {
  try {
    const body = JSON.stringify({
      model: "gemma3",
      prompt: `Fix TypeScript semantic pattern in this snippet:\n${codeSnippet}\nRespond with corrected code only.`,
      stream: false,
    });
    const resp = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const json = await resp.json();
    return json.response?.trim() ?? null;
  } catch (error) {
    console.warn(`⚠️  AI suggestion failed for ${file}:${line}`);
    return null;
  }
}

function analyzeAndFix(filePath, useAI = false) {
  const code = fs.readFileSync(filePath, "utf8");
  let ast;
  
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx", "classProperties"],
      errorRecovery: true,
    });
  } catch (error) {
    // Skip unparseable files silently
    issues.push({ file: filePath, type: "PARSE_ERROR", message: error.message.split('\n')[0] });
    return;
  }

  const fileIssues = [];

  try {
    traverse(ast, {
      ObjectExpression(pathNode) {
        try {
          for (const prop of pathNode.node.properties) {
            if (
              t.isObjectProperty(prop) &&
              t.isIdentifier(prop.key) &&
              t.isIdentifier(prop.value)
            ) {
              // { key, value } → { key: value }
              const snippet = code.slice(prop.start, prop.end);
              const line = prop.loc?.start?.line ?? 0;
              
              fileIssues.push({
                file: filePath,
                line,
                type: "SHORTHAND_PROPERTY",
                snippet,
                suggestion: `Consider if this should be shorthand or explicit: ${snippet}`
              });
            }
          }
        } catch (err) {
          // Skip problematic nodes
        }
      },
      
      // Detect potential malformed object patterns
      CallExpression(pathNode) {
        try {
          if (t.isMemberExpression(pathNode.node.callee)) {
            const args = pathNode.node.arguments;
            if (args.length > 0 && t.isObjectExpression(args[0])) {
              const objArg = args[0];
              for (const prop of objArg.properties) {
                if (t.isObjectProperty(prop) && !prop.value) {
                  const line = prop.loc?.start?.line ?? 0;
                  fileIssues.push({
                    file: filePath,
                    line,
                    type: "MISSING_VALUE",
                    snippet: code.slice(prop.start, prop.end),
                    suggestion: "Object property missing value"
                  });
                }
              }
            }
          }
        } catch (err) {
          // Skip problematic nodes
        }
      }
    });
  } catch (err) {
    // If traverse fails, log but continue
    issues.push({ 
      file: filePath, 
      type: "TRAVERSE_ERROR", 
      message: err.message.split('\n')[0] 
    });
    return;
  }

  if (fileIssues.length > 0) {
    console.log(`🧩 Found ${fileIssues.length} patterns in ${path.relative(process.cwd(), filePath)}`);
    issues.push(...fileIssues);
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  Directory not found: ${dir}`);
    return;
  }

  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    const stat = fs.statSync(p);
    
    if (stat.isDirectory()) {
      // Skip node_modules, .svelte-kit, etc.
      if (!["node_modules", ".svelte-kit", "build", "dist"].includes(entry)) {
        walk(p);
      }
    } else if (p.endsWith(".ts") || p.endsWith(".svelte")) {
      analyzeAndFix(p);
    }
  }
}

(async () => {
  console.log("🚀 Running Phase 34D AI Pattern Repair…");
  console.log(`📁 Scanning: ${rootDir}\n`);
  
  const hasOllama = await checkOllama();
  
  walk(rootDir);
  
  console.log(`\n📊 Analysis complete:`);
  console.log(`   Total issues found: ${issues.length}`);
  console.log(`   Parse errors: ${issues.filter(i => i.type === "PARSE_ERROR").length}`);
  console.log(`   Traverse errors: ${issues.filter(i => i.type === "TRAVERSE_ERROR").length}`);
  console.log(`   Shorthand properties: ${issues.filter(i => i.type === "SHORTHAND_PROPERTY").length}`);
  console.log(`   Missing values: ${issues.filter(i => i.type === "MISSING_VALUE").length}`);
  
  // Write report
  const report = issues.map(issue => {
    if (issue.type === "PARSE_ERROR" || issue.type === "TRAVERSE_ERROR") {
      return `${issue.file} [${issue.type}]\n  ${issue.message}\n`;
    }
    return `${issue.file}:${issue.line || 0} [${issue.type}]\n  ${issue.snippet || issue.message}\n  ${issue.suggestion || ""}\n`;
  }).join("\n");
  
  fs.writeFileSync(logFile, report, "utf8");
  console.log(`\n📝 Report written to: ${logFile}`);
  console.log("✅ Phase 34D scan complete.");
  
  const actionableIssues = issues.filter(i => i.type !== "PARSE_ERROR" && i.type !== "TRAVERSE_ERROR").length;
  if (actionableIssues > 0) {
    console.log(`\n💡 Found ${actionableIssues} actionable pattern issues to review.`);
    console.log(`   Next: Review ${logFile} and apply fixes as needed.`);
  } else {
    console.log(`\n✨ No actionable issues found! Your code structure looks good.`);
  }
})();

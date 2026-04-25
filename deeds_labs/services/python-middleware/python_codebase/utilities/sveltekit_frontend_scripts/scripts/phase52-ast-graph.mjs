#!/usr/bin/env node

/**
 * Phase 52 – AST Graph Builder
 * Builds import/export relationships for agentic reasoning
 * Stores graph in Redis JSON for Gemma3-Legal context
 */

import { Project } from "ts-morph";
import Redis from "ioredis";

const project = new Project({ tsConfigFilePath: "tsconfig.json" });

// Add all source files explicitly for complete AST context
project.addSourceFilesAtPaths([
  "src/**/*.ts",
  "src/**/*.svelte",
  "src/**/*.mjs",
  "src/**/*.js"
]);

const redis = new Redis(process.env.REDIS_URL || "redis://default:redis@localhost:6379", {
  lazyConnect: true,
});

await redis.connect().catch((e) => {
  console.error("❌ Redis connect failed:", e.message);
  process.exit(1);
});

async function buildASTGraph() {
  console.log("🕸  Building AST graph from project...");

  const files = project.getSourceFiles();
  let nodeCount = 0;

  for (const f of files) {
    try {
      const imports = f.getImportDeclarations().map(i => {
        try {
          return i.getModuleSpecifierValue();
        } catch {
          return null;
        }
      }).filter(Boolean);

      const exports = f.getExportSymbols().map(s => {
        try {
          return s.getName();
        } catch {
          return null;
        }
      }).filter(Boolean);

      const graphNode = {
        path: f.getFilePath(),
        imports,
        exports,
        lastModified: f.getFilePath() ? new Date().toISOString() : null
      };

      if (redis.json && typeof redis.json.set === "function") {
        await redis.json.set(`phase52:graph:${f.getBaseName()}`, "$", graphNode);
      } else {
        console.warn("⚠️  redis.json not available – installing redis-stack expected");
        // Fallback to regular Redis SET
        await redis.set(`phase52:graph:${f.getBaseName()}`, JSON.stringify(graphNode));
      }
      nodeCount++;

      if (nodeCount % 10 === 0) {
        console.log(`📊 Processed ${nodeCount} files...`);
      }
    } catch (error) {
      console.warn(`⚠️  Skipping ${f.getBaseName()}: ${error.message}`);
    }
  }

  console.log(`✅ AST Graph stored in Redis (${nodeCount} files)`);

  // Store graph metadata
  await redis.hset('phase52:graph:metadata', {
    total_files: nodeCount,
    built_at: new Date().toISOString(),
    project_root: process.cwd()
  });

  redis.quit();
}

buildASTGraph().catch(console.error);
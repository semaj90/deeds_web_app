#!/usr/bin/env node
/**
 * Kick off the full Phase46 ingestion pipeline:
 *   1. Ensure the adapter microservice is healthy
 *   2. Run the phase46 indexer to push data into pgvector + Neo4j
 *   3. Trigger the agentic doc retriever for a sample error code (optional)
 */

import { spawn } from "child_process";
import fetch from "node-fetch";
import path from "path";
import url from "url";

const workspaceRoot = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const adapterUrl = (process.env.PHASE46_ADAPTER_URL || "http://localhost:8092").replace(/\/$/, "");
const sampleError = process.env.PHASE46_PIPELINE_ERROR || "TS2322";

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: workspaceRoot,
      shell: false,
      ...options,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function ensureAdapterHealthy() {
  const target = `${adapterUrl}/health`;
  process.stdout.write(`[phase46-full-pipeline] Checking adapter health at ${target} ... `);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  let res;
  try {
    res = await fetch(target, { signal: controller.signal });
  } catch (err) {
    throw new Error(`Adapter health check failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`Adapter health endpoint returned ${res.status}`);
  }
  const json = await res.json().catch(() => ({}));
  console.log(`OK (model=${json.model || "unknown"})`);
}

async function main() {
  await ensureAdapterHealthy();

  console.log("[phase46-full-pipeline] Running phase46-indexer...");
  await runCommand("node", ["scripts/phase46-indexer.mjs"]);

  if (process.env.PHASE46_PIPELINE_AGENTIC === "0") {
    console.log("[phase46-full-pipeline] Skipping agentic doc retriever per env override.");
    return;
  }

  console.log(`[phase46-full-pipeline] Launching agentic doc retriever for ${sampleError}...`);
  await runCommand("node", ["scripts/agentic_search.mjs", sampleError]);
}

main().catch((err) => {
  console.error("[phase46-full-pipeline] Failed:", err);
  process.exit(1);
});

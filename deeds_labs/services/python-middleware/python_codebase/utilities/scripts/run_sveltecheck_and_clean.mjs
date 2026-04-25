#!/usr/bin/env node
/**
 * Phase 48.1 — Chunked Svelte-Check JSON Streamer with Progress Bars
 * ------------------------------------------------------------------
 * ✅ Streams svelte-check output incrementally (no 1 GB dump)
 * ✅ Adds live progress bar with diagnostics count and elapsed time
 * ✅ Hooks for LangExtract & Redis integration
 * ✅ Foundation for AST / Gemma3-Legal semantic analysis
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import stripAnsi from "strip-ansi";
import fetch from "node-fetch";
import Redis from "ioredis";
import cliProgress from "cli-progress";
import colors from "ansi-colors";

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------
const CWD = "sveltekit-frontend";
const CACHE_DIR = ".cache";
const OUT_PREFIX = path.join(CACHE_DIR, "sveltecheck.chunk");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const CHUNK_SIZE = 400;
const TIMEOUT_MS = 5 * 60 * 1000;
const LEXTRACT_URL = process.env.LANGEXTRACT_URL ?? "http://127.0.0.1:9001/extract";
const REDIS_URL = process.env.REDIS_URL ?? "redis://:redis@localhost:6379";
const REDIS_STREAM = process.env.REDIS_STREAM ?? "phase48:sveltecheck:diagnostics";
const redis = new Redis(REDIS_URL);

// ------------------------------------------------------------
// PROGRESS BAR SETUP
// ------------------------------------------------------------
const progress = new cliProgress.SingleBar(
  {
    format: `${colors.cyan("🧠 Phase 48.1")} {bar} | {value}/{total} diagnostics | Chunks: {chunks} | {elapsed}s`,
    barCompleteChar: colors.green("█"),
    barIncompleteChar: colors.gray("░"),
    hideCursor: true
  },
  cliProgress.Presets.shades_classic
);
let totalDiagnostics = 0;
let chunksWritten = 0;
let startTime = 0;

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------
async function callLangExtract(batch) {
  try {
    const res = await fetch(LEXTRACT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch)
    });
    const txt = await res.text();

    // Some LangExtract servers return HTML when misconfigured; avoid JSON parse failures.
    if (txt.trim().startsWith("<")) {
      console.warn("⚠️ LangExtract returned HTML (check endpoint URL)");
      return batch;
    }

    return JSON.parse(txt);
  } catch (err) {
    console.error("⚠️ LangExtract failed:", err.message);
    return batch;
  }
}

async function pushToRedis(batch) {
  try {
    for (const item of batch) {
      await redis.xadd(
        REDIS_STREAM,
        "*",
        "file",
        item.file ?? "",
        "message",
        item.message ?? "",
        "severity",
        item.severity ?? "",
        "language",
        item.language ?? "unknown"
      );
    }
  } catch (err) {
    console.error("⚠️ Redis push error:", err.message);
  }
}

// ------------------------------------------------------------
// MAIN RUNNER
// ------------------------------------------------------------
async function runCheck() {
  console.log(colors.yellow("🚀 Starting svelte-check JSON streamer with progress bars..."));

  const child = spawn("npx", ["svelte-check", "--fail-on-warnings=false", "--output", "json"], {
    cwd: CWD,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      TERM: "dumb",
      NODE_OPTIONS: "--max-old-space-size=8192"
    }
  });

  let buffer = "";
  let started = false;
  let chunkIndex = 0;
  let jsonBuffer = [];

  startTime = Date.now();
  progress.start(100, 0, { chunks: 0, elapsed: 0 });

  const timeout = setTimeout(() => {
    console.error(colors.red("⏱️ svelte-check timeout — aborting run."));
    child.kill("SIGTERM");
  }, TIMEOUT_MS);

  const timer = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    progress.update(totalDiagnostics, { chunks: chunksWritten, elapsed });
  }, 1000);

  child.stdout.on("data", async (chunk) => {
    let text = stripAnsi(chunk.toString("utf8"));
    if (!started) {
      const idx = text.search(/[\[\{]/);
      if (idx === -1) return;
      started = true;
      text = text.slice(idx);
    }
    buffer += text;

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        jsonBuffer.push(obj);
        totalDiagnostics++;
      } catch {
        // ignore partial JSON fragments
      }
    }

    if (jsonBuffer.length >= CHUNK_SIZE) {
      const batch = jsonBuffer.splice(0, CHUNK_SIZE);
      const enriched = await callLangExtract(batch);
      await pushToRedis(enriched);

      const fname = `${OUT_PREFIX}.${chunkIndex++}.json`;
      fs.writeFileSync(fname, JSON.stringify(enriched, null, 2));
      chunksWritten++;
      progress.update(totalDiagnostics, {
        chunks: chunksWritten,
        elapsed: ((Date.now() - startTime) / 1000).toFixed(1)
      });

      console.log(
        colors.green(`\n📦 Wrote ${fname} (${enriched.length} diagnostics, total ${chunksWritten})`)
      );
    }
  });

  child.stderr.on("data", (d) => {
    const msg = stripAnsi(d.toString("utf8"));
    if (/error|warn/i.test(msg)) console.error(msg.trim());
  });

  child.on("exit", async (code) => {
    clearTimeout(timeout);
    clearInterval(timer);
    progress.stop();

    if (jsonBuffer.length > 0) {
      const enriched = await callLangExtract(jsonBuffer);
      await pushToRedis(enriched);
      const fname = `${OUT_PREFIX}.${chunkIndex++}.json`;
      fs.writeFileSync(fname, JSON.stringify(enriched, null, 2));
      chunksWritten++;
      console.log(colors.green(`\n✅ Final chunk written (${enriched.length} diagnostics)`));
    }

    await redis.quit();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      colors.green(
        `\n🏁 svelte-check finished with exit ${code} in ${elapsed}s — ${chunksWritten} chunks, ${totalDiagnostics} diagnostics total.`
      )
    );
  });
}

runCheck();

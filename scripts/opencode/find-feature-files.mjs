#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts
  });
  return {
    ok: r.status === 0,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    status: r.status
  };
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function readJsonIfExists(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function unique(xs) {
  return [...new Set(xs.filter(Boolean))];
}

const feature = arg("feature") || arg("goal");
const jsonOnly = process.argv.includes("--json");

if (!feature) {
  console.error("Usage: node scripts/opencode/find-feature-files.mjs --feature \"env module\" --json");
  process.exit(1);
}

const featureSlug = slug(feature);
const registryPaths = [
  "sveltekit-frontend/docs/atlas-index/feature-gap-registry.json",
  "docs/atlas-index/feature-gap-registry.json",
  "docs/atlas/feature-registry.json",
  "docs/atlas-index/feature-gap-registry.seed.json"
];

let registry = [];
for (const p of registryPaths) {
  const rows = await readJsonIfExists(path.join(root, p), null);
  if (Array.isArray(rows)) registry.push(...rows);
}

const featureWords = feature
  .toLowerCase()
  .split(/[^a-z0-9_:-]+/)
  .filter(Boolean);

const registryHits = registry.filter((row) => {
  const text = JSON.stringify(row).toLowerCase();
  return featureWords.some((w) => text.includes(w)) ||
    text.includes(featureSlug);
});

const filePattern = featureWords.join("|") || feature;
const files = run("rg", ["--files", "-uu"]);
const fileHits = files.stdout
  .split(/\r?\n/)
  .filter((f) => featureWords.some((w) => f.toLowerCase().includes(w)))
  .slice(0, 80);

const contentQuery = [
  ...featureWords,
  feature,
  featureSlug
].filter(Boolean).join("|");

const content = run("rg", [
  "-n",
  "-uu",
  contentQuery,
  "sveltekit-frontend/src",
  "sveltekit-frontend/scripts",
  "sveltekit-frontend/docs",
  "scripts",
  "docs",
  ".opencode",
  "opencode.json",
  "package.json"
]);

const contentHits = content.stdout
  .split(/\r?\n/)
  .filter(Boolean)
  .slice(0, 120)
  .map((line) => {
    const [file, lineNo, ...rest] = line.split(":");
    return {
      file,
      line: Number(lineNo),
      text: rest.join(":").trim().slice(0, 300)
    };
  });

const ownerFiles = unique([
  ...registryHits.flatMap((r) => r.ownerFiles || []),
  ...fileHits,
  ...contentHits.map((h) => h.file)
]).slice(0, 50);

const sourceRefs = unique([
  ...registryHits.flatMap((r) => r.sourceRefs || []),
  ...contentHits.map((h) => `${h.file}:${h.line}`)
]).slice(0, 80);

const packageScripts = contentHits
  .filter((h) => h.file.endsWith("package.json") && h.text.includes(":"))
  .map((h) => h.text)
  .slice(0, 25);

const result = {
  featureId: featureSlug,
  query: feature,
  cacheKey: `ace:feature:${crypto.createHash("sha1").update(feature).digest("hex").slice(0, 12)}`,
  registryHits: registryHits.slice(0, 20),
  ownerFiles,
  sourceRefs,
  packageScripts,
  qdrantQueryNeeded: true,
  turboVecRerankNeeded: ownerFiles.length > 20,
  nextSteps: [
    "Inspect ownerFiles only",
    "Patch confirmed files only",
    "Do not read whole markdown docs",
    "After patch, write an agent_memory_observation"
  ],
  retrievalTrace: {
    registryHits: registryHits.length,
    fileHits: fileHits.length,
    contentHits: contentHits.length,
    qdrantHits: 0,
    redisHits: 0,
    turbovecReranked: false
  }
};

const outPath = path.join(root, ".opencode", "feature-files.json");
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(result, null, 2));

if (jsonOnly) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(result, null, 2));
}

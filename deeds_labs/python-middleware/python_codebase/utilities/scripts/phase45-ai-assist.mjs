#!/usr/bin/env node
/**
 * Phase 45-AI-Assist — semantic reconstruction of collapsed .svelte files.
 * Uses nearby intact components as style/structure examples.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const root = path.resolve("sveltekit-frontend/src");
const templateDir = path.join(root, "lib", "components");
const repaired = [];

// --- helper: collect template samples for the model prompt ---
function collectTemplates() {
  const samples = [];
  function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (full.endsWith(".svelte")) {
        const body = fs.readFileSync(full, "utf8");
        // keep a short cleaned snippet for prompt context
        samples.push(
          body
            .replace(/<script[\s\S]*?<\/script>/g, "")
            .replace(/<style[\s\S]*?<\/style>/g, "")
            .slice(0, 500)
        );
      }
    }
  }
  if (fs.existsSync(templateDir)) walk(templateDir);
  return samples.join("\n---\n");
}

// --- core repair loop ---
function walk(dir, templates) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, templates);
    else if (full.endsWith(".svelte")) attemptRebuild(full, templates);
  }
}

function attemptRebuild(file, templates) {
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes("page-repair")) return;

  console.log("🤖 Rebuilding:", file);
  const script = (content.match(/<script[^>]*>([\s\S]*?)<\/script>/) || [])[1] || "";

  const prompt = `
YouYou are an assistant repairing a collapsed Svelte page.
Recreate the <main> markup using patterns from valid components below.
Preserve script logic but design minimal semantic HTML for the UI.

<templates>
${templates}
</templates>

<original-script>
${script}
</original-script>
`;

  // Call your local model (Gemma 3 legal, Ollama, etc.)
  const result = spawnSync("ollama", ["run", "gemma3-legal:latest"], {
    input: prompt,
    encoding: "utf8"
  });

  const aiMarkup = result.stdout
    ?.replace(/^[\s\S]*?<main/i, "<main")
    ?.replace(/<\/main>[\s\S]*$/, "</main>")
    ?.trim();

  if (!aiMarkup) {
    console.warn("⚠️ No AI output for", file);
    return;
  }

  const rebuilt = content.replace(
    /<main[\s\S]*<\/main>/,
    aiMarkup + "\n\n<!-- Phase 45-AI-Assist rebuild -->"
  );
  fs.writeFileSync(file, rebuilt, "utf8");
  repaired.push(file);
}

// --- run ---
const templates = collectTemplates();
walk(root, templates);
console.log(`✅ Phase 45-AI-Assist: rebuilt ${repaired.length} files.`);

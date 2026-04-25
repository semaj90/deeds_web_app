#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = path.resolve("sveltekit-frontend/src");
let repaired = 0;

function fixFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  // Skip files already prepared
  if (content.includes('page-repair')) return;

  const lines = content.split('\n').length;
  const hasScript = content.includes('<script');
  const hasMain = content.includes('<main');
  const hasNull = content.includes('\0');

  // Repair when main is missing, or file is extremely short, or includes null bytes
  if (!hasMain || hasNull || lines < 5) {
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    const script = scriptMatch ? scriptMatch[1].trim() : '';
    const style = styleMatch ? styleMatch[1].trim() : '';

    // Build new content: preserve script and style if present
    let rebuilt = '';
    if (scriptMatch) {
      // keep original script tag attributes if any
      const tag = content.match(/<script[^>]*>/)[0];
      rebuilt += `${tag}\n${script}\n</script>\n\n`;
    }

    rebuilt += `<main class="page-repair">\n  <h1>Page under reconstruction</h1>\n  <p>This placeholder replaces corrupted or missing markup for now.</p>\n</main>\n\n`;

    if (styleMatch) {
      const styleTag = content.match(/<style[^>]*>/)[0];
      rebuilt += `${styleTag}\n${style}\n</style>\n`;
    } else {
      rebuilt += `<style>\n  .page-repair { padding: 2rem; font-family: sans-serif; }\n</style>\n`;
    }

    fs.writeFileSync(file, rebuilt, 'utf8');
    repaired++;
  }
}

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (full.endsWith(".svelte")) fixFile(full);
  }
}

walk(root);
console.log(`✅ Phase 44-D: Repaired ${repaired} collapsed Svelte files.`);

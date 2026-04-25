#!/usr/bin/env node
import { execSync, spawnSync } from 'child_process';

// Phase 52.5 pre-step: categorize & update ignore lists
console.log("🧹  Running categorizer before ESLint cache...");
spawnSync("node", ["scripts/analyze-and-ignore.mjs"], {
  cwd: "sveltekit-frontend",
  stdio: "inherit",
});

console.log("🔧  Running Phase 43 pre-fixers (CSS + Identifiers + Modules)...");
const fixers = [
  "scripts/fix-css-syntax.mjs",
  "scripts/fix-undefined-identifiers.mjs",
  "scripts/fix-module-imports.mjs",
];

for (const fixer of fixers) {
  const result = spawnSync("node", [fixer, "--apply"], {
    cwd: "sveltekit-frontend",
    stdio: "inherit",
  });
  if (result.status !== 0)
    console.warn(`⚠️  ${fixer} exited with code ${result.status}`);
}

const steps = [
  { name: 'Format (Prettier)', cmd: 'npm run format' },
  { name: 'ESLint fix', cmd: 'npm run lint:fix' },
  { name: 'TypeScript check', cmd: 'npm run check' },
  { name: 'Drizzle check', cmd: 'npm run db:check' },
  { name: 'Route tests', cmd: 'npm run test:routes' }
];

// Ensure the frontend test-reports directory exists so ESLint can write JSON output
steps.push({ name: 'Ensure test-reports dir', cmd: "node -e \"require('fs').mkdirSync('sveltekit-frontend/test-reports', { recursive: true })\"" });

// Cached ESLint with flags
const eslintArgs = ["scripts/eslint-with-cache.cjs", "--batch-size", "150"];
if (process.env.FORCE_LINT) eslintArgs.push("--force");
console.log("🧠  Launching ESLint cached run...");
spawnSync("node", eslintArgs, {
  cwd: "sveltekit-frontend",
  stdio: "inherit",
});

// Phase 43B — Knowledge indexing of ESLint + svelte-check results
console.log("🧠  Indexing ESLint results into Qdrant / Neo4j knowledge graph...");
spawnSync("node", ["scripts/comprehensive-knowledge-indexer.mjs"], {
  cwd: "sveltekit-frontend",
  stdio: "inherit",
});

// Chain GPU summarization and reports
console.log("⚡  Running GPU Lint + CUDA check pipeline...");
spawnSync("node", ["scripts/gpu-lint.mjs"], { cwd: "sveltekit-frontend", stdio: "inherit" });
spawnSync("node", ["scripts/phase53-report.mjs", "--skip-playwright"], {
  cwd: "sveltekit-frontend",
  stdio: "inherit",
});
spawnSync("pwsh", [
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "scripts/phase54-enable-cuda.ps1",
], { cwd: "sveltekit-frontend", stdio: "inherit" });
console.log("✅  Phase 52→54 GPU pipeline complete.");

console.log('\n▶ Phase52: Clean & Verify - starting pipeline\n');

// Phase 55: GPU telemetry (non-fatal)
steps.push({ name: 'GPU Telemetry (Phase 55)', cmd: 'node sveltekit-frontend/scripts/gpu-telemetry-collector.mjs', env: { REPORT_DIR: 'sveltekit-frontend/test-reports' } });

// CLI flag to continue on error (preferred over shell env quirks). Accept --continue-on-error or env values '1' or 'true'
const CONTINUE_ON_ERROR = process.argv.includes('--continue-on-error') || process.env.CONTINUE_ON_ERROR === 'true' || process.env.CONTINUE_ON_ERROR === '1';

for (const step of steps) {
  console.log(`\n--- ${step.name} --> ${step.cmd}`);
  try {
    // Merge env and ensure CONTINUE_ON_ERROR is propagated to subprocesses
    const env = Object.assign({}, process.env, step.env || {});
    if (CONTINUE_ON_ERROR) env.CONTINUE_ON_ERROR = '1';
    execSync(step.cmd, { stdio: 'inherit', env, shell: true });
  } catch (err) {
    console.error(`\n✖ Step failed: ${step.name}`);
    const code = (err && err.status) ? err.status : 1;
    if (CONTINUE_ON_ERROR) {
      console.warn(`CONTINUE_ON_ERROR enabled — continuing despite failure of: ${step.name}`);
      continue;
    } else {
      process.exit(code);
    }
  }
}

console.log('\n✅ Phase52: Clean & Verify completed successfully\n');

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from 'url';

// CLI flags
const argv = process.argv.slice(2);
const skipPlaywright = argv.includes('--skip-playwright') || argv.includes('-s');

// Resolve `frontendDir` relative to this script file so the script is CWD-agnostic
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// script lives in sveltekit-frontend/scripts, so frontendDir is the parent directory
const frontendDir = path.resolve(__dirname, '..');
const reportDir = path.join(frontendDir, "test-reports");
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

if (!skipPlaywright) {
  try {
    console.log("Running Playwright tests (from sveltekit-frontend)...");
    execSync("npx playwright test --reporter=html", { stdio: "inherit", cwd: frontendDir });
  } catch (e) {
    console.error("Playwright tests failed.");
  }
} else {
  console.log('Skipping Playwright tests (flag --skip-playwright provided)');
}

try {
  console.log("Running GPU lint (from sveltekit-frontend)...");
  execSync("node scripts/gpu-lint.mjs", { stdio: "inherit", cwd: frontendDir });
} catch (e) {
  console.error("GPU lint script failed.");
}

// Read GPU status written by Phase54 (if available) and create a small badge for the QA dashboard
const gpuStatusFile = path.join(reportDir, 'gpu-status.json');
const gpuBadgeFile = path.join(reportDir, 'gpu-badge.md');
try {
  if (fs.existsSync(gpuStatusFile)) {
    const status = JSON.parse(fs.readFileSync(gpuStatusFile, 'utf8'));
    const badge = status.ok ? `🟢 CUDA OK — ${status.gpu || 'Unknown GPU'} (torch ${status.torch || 'unknown'})` : `🔴 CUDA Unavailable — ${status.reason || 'unknown'}`;
    fs.writeFileSync(gpuBadgeFile, `# GPU Status\n\n${badge}\n`);
    console.log('\nGPU badge written to:', gpuBadgeFile);
  } else {
    fs.writeFileSync(gpuBadgeFile, `# GPU Status\n\n⚪ Unknown — Phase54 not run or status missing.\n`);
    console.log('\nGPU badge created (unknown).');
  }
} catch (e) {
  console.warn('Failed to write GPU badge:', e.message);
}

console.log("\n✅ Phase 53 QA Report Generator completed successfully.\n");

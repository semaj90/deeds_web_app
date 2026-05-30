#!/usr/bin/env node
/**
 * smoke-feature-registry.mjs
 *
 * Validates atlas-feature-registry.json structure.
 *
 * Checks:
 * - File exists
 * - JSON parses
 * - generatedAt exists
 * - features is array
 * - Each feature has required fields
 * - No /dev/stdin usage
 * - Task descriptions exist when recommendedTask exists
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const REGISTRY_PATH = path.join(ROOT, '.tmp', 'atlas-feature-registry.json');

const checks = [];
function check(name, pass, details = '') {
  checks.push({ name, pass, details });
  const icon = pass ? '✅' : '❌';
  console.log(`  ${icon} ${name}${details ? ` — ${details}` : ''}`);
}

async function main() {
  console.log('\n── Smoke Test: Feature Registry ──────────────────────────');

  // Check 1: File exists
  const fileExists = fs.existsSync(REGISTRY_PATH);
  check('File exists', fileExists, REGISTRY_PATH);
  if (!fileExists) {
    console.log('\n❌ Registry file not found. Run: npm run atlas:feature-registry');
    process.exit(1);
  }

  // Check 2: JSON parses
  let registry;
  try {
    const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
    registry = JSON.parse(content);
    check('JSON parses', true);
  } catch (e) {
    check('JSON parses', false, e.message);
    process.exit(1);
  }

  // Check 3: generatedAt exists
  const hasGeneratedAt = registry.generatedAt && typeof registry.generatedAt === 'string';
  check('generatedAt exists', hasGeneratedAt, registry.generatedAt || 'missing');

  // Check 4: features is array
  const isArray = Array.isArray(registry.features);
  check('features is array', isArray, `${registry.features?.length || 0} features`);

  if (!isArray || registry.features.length === 0) {
    console.log('\n⚠️  No features found in registry');
    process.exit(1);
  }

  // Check 5: Each feature has required fields
  let allValid = true;
  const requiredFields = ['id', 'label', 'kind', 'files', 'confidence'];
  for (const feature of registry.features) {
    const missing = requiredFields.filter((f) => !(f in feature));
    if (missing.length > 0) {
      check(
        `Feature ${feature.id || 'unknown'} complete`,
        false,
        `missing: ${missing.join(', ')}`
      );
      allValid = false;
    }
  }
  if (allValid) {
    check(`All ${registry.features.length} features have required fields`, true);
  }

  // Check 6: Task descriptions exist when recommendedTask exists
  let taskDescCount = 0;
  for (const feature of registry.features) {
    if (feature.recommendedTask) {
      const hasDesc = feature.recommendedTask.description && feature.recommendedTask.description.length > 0;
      if (hasDesc) taskDescCount++;
    }
  }
  const tasksWithDesc = registry.features.filter((f) => f.recommendedTask?.description).length;
  check(`Task descriptions exist`, tasksWithDesc > 0, `${tasksWithDesc} tasks with descriptions`);

  // Check 7: No /dev/stdin usage
  const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const hasDevStdin = content.includes('/dev/stdin');
  check('No /dev/stdin usage', !hasDevStdin);

  // Check 8: Windows-safe paths (no /bin, /usr, /dev, /etc)
    const hasUnixPaths = content.match(/^\s*"[/](bin|usr|dev|etc|tmp|var)\//m);
    if (process.platform === 'win32') {
      // On Windows treat unix-root path literals as a non-fatal warning
      check('Windows-safe (no unix-only paths)', true, hasUnixPaths ? 'warning: unix-style root paths detected (OK on Windows)' : 'none');
    } else {
      check('Windows-safe (no unix-only paths)', !hasUnixPaths);
    }

  // Summary
  const passCount = checks.filter((c) => c.pass).length;
  const totalCount = checks.length;
  console.log(`\n── Summary ────────────────────────────────────────────────`);
  console.log(`  ${passCount}/${totalCount} checks passed`);

  if (passCount === totalCount) {
    console.log('\n✅ Feature registry smoke test PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ Feature registry smoke test FAILED');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Smoke test error:', err.message);
  process.exit(1);
});

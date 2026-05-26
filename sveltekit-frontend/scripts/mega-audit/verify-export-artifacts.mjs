#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

function normalizeRoot() {
  const cwd = process.cwd();
  if (cwd.endsWith('sveltekit-frontend')) {
    return {
      appRoot: cwd,
    };
  }
  return {
    appRoot: join(cwd, 'sveltekit-frontend'),
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function checkRequiredFiles(inputDir) {
  const required = [
    'chunk2-report.json',
    'route-schema-test-map.json',
  ];

  const missing = required
    .map((name) => ({ name, fullPath: join(inputDir, name) }))
    .filter((entry) => !existsSync(entry.fullPath));

  return {
    required,
    missing,
  };
}

function validateShape(inputDir) {
  const chunk2Path = join(inputDir, 'chunk2-report.json');
  const routeMapPath = join(inputDir, 'route-schema-test-map.json');

  const errors = [];

  try {
    const chunk2 = readJson(chunk2Path);
    if (!chunk2?.questions || typeof chunk2.questions !== 'object') {
      errors.push('chunk2-report.json missing top-level "questions" object');
    }
  } catch (error) {
    errors.push(`chunk2-report.json parse error: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const routeMap = readJson(routeMapPath);
    if (typeof routeMap?.totalRoutes !== 'number') {
      errors.push('route-schema-test-map.json missing numeric "totalRoutes"');
    }
    if (!Array.isArray(routeMap?.routes)) {
      errors.push('route-schema-test-map.json missing "routes" array');
    }
  } catch (error) {
    errors.push(`route-schema-test-map.json parse error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return errors;
}

function main() {
  const customInputDir = arg('input-dir');
  const { appRoot } = normalizeRoot();
  const inputDir = customInputDir ? resolve(customInputDir) : join(appRoot, '.tmp', 'mega-audit');

  const fileCheck = checkRequiredFiles(inputDir);
  const missing = fileCheck.missing;

  if (missing.length > 0) {
    console.error(JSON.stringify({
      ok: false,
      reason: 'missing-artifacts',
      inputDir,
      missing: missing.map((m) => m.name),
      fix: [
        'npm run audit:route-schema-tests',
        'npm run audit:chunk2-report',
      ],
    }, null, 2));
    process.exit(1);
  }

  const shapeErrors = validateShape(inputDir);
  if (shapeErrors.length > 0) {
    console.error(JSON.stringify({
      ok: false,
      reason: 'invalid-artifact-shape',
      inputDir,
      errors: shapeErrors,
      fix: [
        'npm run audit:route-schema-tests',
        'npm run audit:chunk2-report',
      ],
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    inputDir,
    checked: fileCheck.required,
  }, null, 2));
}

main();
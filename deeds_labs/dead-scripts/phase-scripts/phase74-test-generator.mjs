#!/usr/bin/env node
/**
 * 🧪 Phase 74.2: Route & API Test Generator
 *
 * Creates comprehensive test suites for:
 * - Route rendering (Playwright)
 * - API endpoint validation (Vitest)
 * - Component hydration checks
 * - Error handler coverage
 */

import chalk from 'chalk';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

class TestGenerator {
  constructor(routeInventory) {
    this.routes = routeInventory.active || [];
    this.apis = routeInventory.apis || [];
    this.tests = [];
  }

  generateRouteTests() {
    const testCode = `
import { expect, test } from '@playwright/test';

/**
 * Auto-generated route rendering tests
 * Generated: ${new Date().toISOString()}
 */

${this.routes.map(route => `
test('Route ${route.path} renders without errors', async ({ page }) => {
  await page.goto('${route.path}');

  // Check for hydration errors
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  // Wait for page load
  await page.waitForLoadState('networkidle');

  // Assert no errors
  expect(errors).toHaveLength(0);

  // Check critical elements exist
  const body = await page.locator('body');
  await expect(body).toBeVisible();
});
`).join('\n')}

test.describe('Missing imports check', () => {
  const routesWithMissingImports = ${JSON.stringify(
    this.routes.filter(r => r.missingImports && r.missingImports.length > 0),
    null,
    2
  )};

  for (const route of routesWithMissingImports) {
    test(\`Route \${route.path} has no runtime import errors\`, async ({ page }) => {
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(route.path);
      await page.waitForLoadState('networkidle');

      // Check for import/module errors
      const importErrors = consoleErrors.filter(err =>
        err.includes('Cannot find') || err.includes('undefined')
      );

      expect(importErrors).toHaveLength(0);
    });
  }
});
`;

    return {
      path: 'tests/routes.spec.ts',
      content: testCode
    };
  }

  generateAPITests() {
    const testCode = `
import { describe, it, expect } from 'vitest';
import { RequestEvent } from '@sveltejs/kit';

/**
 * Auto-generated API endpoint tests
 * Generated: ${new Date().toISOString()}
 */

${this.apis.map(api => `
describe('API ${api.path}', () => {
  ${api.methods.map(method => `
  it('${method} responds successfully', async () => {
    const response = await fetch(\`http://localhost:5173\${api.path}\`, {
      method: '${method}',
      headers: { 'Content-Type': 'application/json' }
    });

    expect(response.ok).toBe(true);
    expect(response.status).toBeLessThan(500);
  });
  `).join('\n')}

  ${!api.hasErrorHandler ? `
  it('has error handling', async () => {
    // This API lacks try/catch error handling
    // TODO: Add error handler to ${api.file}
    expect(true).toBe(false); // Intentional fail to flag missing error handling
  });
  ` : ''}
});
`).join('\n')}
`;

    return {
      path: 'tests/api.spec.ts',
      content: testCode
    };
  }

  generateComponentTests() {
    const testCode = `
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';

/**
 * Auto-generated component hydration tests
 * Generated: ${new Date().toISOString()}
 */

describe('Component imports and hydration', () => {
  it('all route components can be imported', async () => {
    const routeComponents = ${JSON.stringify(this.routes.map(r => r.file))};

    for (const component of routeComponents) {
      try {
        const mod = await import(\`../\${component}\`);
        expect(mod.default).toBeDefined();
      } catch (err) {
        throw new Error(\`Failed to import \${component}: \${err.message}\`);
      }
    }
  });

  it('no routes have missing component dependencies', () => {
    const routesWithMissingImports = ${JSON.stringify(
      this.routes.filter(r => r.missingImports && r.missingImports.length > 0)
    )};

    expect(routesWithMissingImports).toHaveLength(0);
  });
});
`;

    return {
      path: 'tests/components.spec.ts',
      content: testCode
    };
  }

  async writeTests() {
    const tests = [
      this.generateRouteTests(),
      this.generateAPITests(),
      this.generateComponentTests()
    ];

    for (const test of tests) {
      await fs.mkdir(path.dirname(test.path), { recursive: true });
      await fs.writeFile(test.path, test.content);
      console.log(chalk.green(`✓ Generated ${test.path}`));
    }

    return tests;
  }
}

// Export for use in other scripts
export { TestGenerator };

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const inventoryPath = 'reports/phase74/route-inventory.json';

  if (!existsSync(inventoryPath)) {
    console.error(chalk.red('❌ Route inventory not found. Run: npm run phase74:inventory'));
    process.exit(1);
  }

  const inventory = JSON.parse(await fs.readFile(inventoryPath, 'utf-8'));
  const generator = new TestGenerator(inventory);

  console.log(chalk.cyan('\n🧪 Generating test suites...\n'));
  await generator.writeTests();
  console.log(chalk.green('\n✅ Test generation complete'));
}

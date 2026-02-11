import { test, expect } from '@playwright/test';
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROUTES_DIR = path.join(__dirname, "../src/routes");

function discoverRoutes(dir: string, base = ""): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let routes: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      routes = routes.concat(discoverRoutes(path.join(dir, entry.name), base + "/" + entry.name));
    } else if (entry.name === "+page.svelte" || entry.name === "+page.ts") {
      routes.push(base || "/");
    }
  }
  return routes;
}

const routes = [...new Set(discoverRoutes(ROUTES_DIR))];

test.describe("SvelteKit route MCP health", () => {
  for (const route of routes) {
    test(`Route health: ${route}`, async ({ page }) => {
      const url = `http://localhost:5173${route}`;
      await page.goto(url);
      await expect(page).toHaveTitle(/.+/); // basic sanity
    });
  }
});

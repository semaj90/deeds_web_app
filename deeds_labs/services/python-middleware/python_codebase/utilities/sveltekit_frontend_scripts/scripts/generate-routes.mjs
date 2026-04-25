#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..'); // sveltekit-frontend
const routesDir = path.join(projectRoot, 'src', 'routes');
const configRoutesDir = path.join(projectRoot, 'config', 'routes');
const outDir = path.join(projectRoot, 'dist');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function normalizeRouteFromPath(rel) {
  if (rel === '' || rel === 'index' || rel === '/index') return '/';
  // convert file path parts to route path, remove +page.* files
  let route = rel.replace(/\\+/g, '/'); // windows safety
  route = route.replace(/\/\+page(\.[^/]*)?$/i, '/');
  route = route.replace(/\/index(\.[^/]*)?$/i, '/');
  route = route.replace(/\/$/, '');
  return route === '' ? '/' : `/${route}`;
}

async function readTitleFromFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    // try <svelte:head><title>...</title>
    const titleMatch =
      content.match(/<svelte:head>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/svelte:head>/i) ||
      content.match(/export\s+const\s+title\s*=\s*['"`]([^'"`]+)['"`]/i) ||
      content.match(/@title:\s*(.+)/i); // loose comment marker
    if (titleMatch) return titleMatch[1].trim();
  } catch {
    // ignore
  }
  return null;
}

async function walkRoutes(dir, base = '') {
  const entries = [];
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return entries;
  }

  // detect directly file-based route markers in this directory
  const names = dirents.map(d => d.name);
  const hasPage = names.some(n => /^\+page(\.(svelte|ts|js))?$/i.test(n));
  const hasServer = names.some(n => /^\+page\.server\./i.test(n));
  const hasLayout = names.some(n => /^\+layout(\.|$)/i.test(n));
  if (hasPage || hasServer || hasLayout) {
    const normalized = normalizeRouteFromPath(base || path.basename(dir));
    const titleCandidates = [];
    // attempt to read +page.svelte then +page.ts
    const tryFiles = ['+page.svelte', '+page.ts', '+page.js', '+page.server.ts', '+page.server.js'];
    for (const f of tryFiles) {
      const p = path.join(dir, f);
      if (await exists(p)) {
        const title = await readTitleFromFile(p);
        if (title) {
          titleCandidates.push(title);
          break;
        }
      }
    }
    entries.push({
      route: normalized,
      path: path.relative(projectRoot, dir),
      type: 'file',
      title: titleCandidates[0] || path.basename(base || dir) || normalized,
    });
  }

  // recurse into subdirectories
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      const childBase = base ? `${base}/${dirent.name}` : dirent.name;
      const childDir = path.join(dir, dirent.name);
      const childEntries = await walkRoutes(childDir, childBase);
      entries.push(...childEntries);
    } else {
      // skip files here
    }
  }

  return entries;
}

async function collectConfigRoutes() {
  if (!(await exists(configRoutesDir))) return [];
  const files = await fs.readdir(configRoutesDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  const routes = [];
  for (const f of jsonFiles) {
    try {
      const raw = await fs.readFile(path.join(configRoutesDir, f), 'utf8');
      const parsed = JSON.parse(raw);
      routes.push({
        route: parsed.route || `/${path.basename(f, '.json')}`,
        path: path.relative(projectRoot, path.join(configRoutesDir, f)),
        type: 'config',
        title: parsed.title || parsed.name || path.basename(f, '.json'),
      });
    } catch {
      // ignore invalid json
    }
  }
  return routes;
}

function buildInventory(fileRoutes, configRoutes) {
  return {
    counts: {
      config: configRoutes.length,
      fileBased: fileRoutes.length,
    },
    fileRoutesSample: fileRoutes.slice(0, 10).map(r => ({ route: r.route, title: r.title })),
  };
}

async function main() {
  const fileRoutes = await walkRoutes(routesDir).catch(() => []);
  const configRoutes = await collectConfigRoutes();

  const result = {
    generatedAt: new Date().toISOString(),
    availableRoutes: [...fileRoutes, ...configRoutes],
    routeInventory: buildInventory(fileRoutes, configRoutes),
    systemHealth: {
      // lightweight health info other tools can augment
      routeDiscovery: 'ok',
      scannedPath: path.relative(projectRoot, routesDir),
    },
  };

  // ensure outDir
  try {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'routes.json'), JSON.stringify(result, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write output file:', err.message);
  }

  // print summary to stdout
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  (process.argv[1] && process.argv[1].endsWith('generate-routes.mjs'))
) {
  main()
    .then(code => process.exit(code))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

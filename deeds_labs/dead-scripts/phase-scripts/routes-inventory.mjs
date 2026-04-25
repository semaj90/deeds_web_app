import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, "src", "routes");
const OUT_DIR = path.join(ROOT, "reports");
fs.mkdirSync(OUT_DIR, { recursive: true });

const isRouteFile = (name) =>
  /^\+(page|layout|server)\.(svelte|ts|js)$/.test(name);

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && isRouteFile(ent.name)) out.push(p);
  }
  return out;
}

function routePathFromFile(file) {
  const rel = file.replace(ROUTES_DIR, "").split(path.sep).join("/");
  // remove +page.svelte etc.
  return rel.replace(/\/\+(page|layout|server)\.(svelte|ts|js)$/i, "") || "/";
}

const files = walk(ROUTES_DIR);
const routes = files.map(routePathFromFile).sort();

// Heuristic core route tags (edit anytime)
const CORE_MATCH = [
  /^\/\(app\)\b/,
  /^\/cases\b/,
  /^\/evidence\b/,
  /^\/evidence-workspace\b/,
  /^\/poi\b/,
  /^\/poi-manager\b/,
  /^\/legal\b/,
  /^\/intelligence\b/,
  /^\/legal-ai-suite\b/,
];
const DEV_MATCH = [/^\/dev\b/, /^\/ast_graph_error_analysis\b/, /^\/route-explorer\b/];

const core = routes.filter((r) => CORE_MATCH.some((re) => re.test(r)));
const dev = routes.filter((r) => DEV_MATCH.some((re) => re.test(r)));
const other = routes.filter((r) => !core.includes(r) && !dev.includes(r));

const payload = {
  created_at: new Date().toISOString(),
  counts: { total: routes.length, core: core.length, dev: dev.length, other: other.length },
  core,
  dev,
  other,
};

const outPath = path.join(OUT_DIR, `route-manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
console.log(`✅ Route manifest written: ${outPath}`);
console.log(`Core: ${core.length} | Dev: ${dev.length} | Other: ${other.length} | Total: ${routes.length}`);

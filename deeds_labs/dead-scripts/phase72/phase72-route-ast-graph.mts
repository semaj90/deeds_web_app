#!/usr/bin/env node
/**
 * Phase 72 – Route AST Graph Builder
 *
 * Builds a "forest" graph of SvelteKit routes:
 *  - nodes: route files (+page.svelte, +layout.svelte, +server.ts, etc.)
 *  - edges: parent → child, and route file → imported modules
 *  - aiImports: whether a route touches $lib/ai/*
 *  - integrates Phase 90 state-machine shield report (if present)
 *
 * Output:
 *   static/phase72/route-ast-graph.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';
import { Project } from 'ts-morph';

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, 'src', 'routes');
const OUT_JSON = path.join(ROOT, 'static', 'phase72', 'route-ast-graph.json');
const SHIELD_JSON = path.join(ROOT, 'static', 'phase90', 'state-machine-shield.json');

type ShieldEntry = {
  file: string;
  hasNoCheck: boolean;
  hasExpectError: boolean;
  isXStateMachine: boolean;
  lineCount: number;
};

type RouteNode = {
  id: string;
  routePath: string;
  kind: 'page' | 'layout' | 'server' | 'page_server' | 'other';
  filePath: string;
  parentId?: string;
  hasLoad?: boolean;
  hasActions?: boolean;
  imports?: string[];
  importsAi?: boolean;
  shieldStatus?: {
    hasNoCheck: boolean;
    hasExpectError: boolean;
    isXStateMachine: boolean;
  };
};

type RouteEdge = {
  from: string;
  to: string;
  kind: 'route_child' | 'import';
};

type RouteGraph = {
  nodes: RouteNode[];
  edges: RouteEdge[];
  metadata: {
    generatedAt: string;
    routeCount: number;
    edgeCount: number;
  };
};

function toPosix(p: string) {
  return p.replace(/\\/g, '/');
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function detectKind(filename: string): RouteNode['kind'] {
  if (filename === '+page.svelte') return 'page';
  if (filename === '+layout.svelte') return 'layout';
  if (filename === '+server.ts' || filename === '+server.js') return 'server';
  if (filename === '+page.server.ts' || filename === '+page.server.js') return 'page_server';
  return 'other';
}

function deriveRoutePath(fileRel: string): { routePath: string; id: string; parentId?: string } {
  const noSrc = fileRel.replace(/^src[\\/]/, '');
  const parts = toPosix(noSrc).split('/');

  if (parts[0] === 'routes') parts.shift();

  const filename = parts.pop() ?? '';
  const segments = parts
    .map((seg) => {
      if (/^\(.*\)$/.test(seg)) return '';
      return seg;
    })
    .filter(Boolean);

  const routePath = '/' + segments.join('/');
  const id = routePath + '/' + filename;
  const parentId = routePath || undefined;

  return { routePath: routePath || '/', id, parentId };
}

async function loadShield(): Promise<ShieldEntry[]> {
  try {
    const data = await fs.readFile(SHIELD_JSON, 'utf8');
    return JSON.parse(data) as ShieldEntry[];
  } catch {
    return [];
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Phase 72 – Route AST Forest (ts-morph)            ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const exists = await fs
    .access(ROUTES_DIR)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    console.error(`❌ Routes directory not found: ${ROUTES_DIR}`);
    process.exit(1);
  }

  const files = await walk(ROUTES_DIR);
  const tsFiles = files.filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
  const svelteFiles = files.filter((f) => f.endsWith('.svelte'));

  const project = new Project({
    tsConfigFilePath: path.join(ROOT, 'tsconfig.json')
  });

  tsFiles.forEach((f) => {
    project.addSourceFileAtPathIfExists(f);
  });

  const shieldEntries = await loadShield();
  const shieldByFile = new Map<string, ShieldEntry>();
  for (const s of shieldEntries) {
    shieldByFile.set(toPosix(s.file), s);
  }

  const nodes: RouteNode[] = [];
  const edges: RouteEdge[] = [];

  function addNode(node: RouteNode) {
    nodes.push(node);
    if (node.parentId) {
      edges.push({
        from: node.parentId,
        to: node.id,
        kind: 'route_child'
      });
    }
  }

  // Process Svelte files (structure only)
  console.log(`📄 Processing ${svelteFiles.length} Svelte files...`);
  for (const svFile of svelteFiles) {
    const relPath = toPosix(path.relative(ROOT, svFile));
    const fileRel = toPosix(path.relative(ROUTES_DIR, svFile));
    const filename = path.basename(svFile);
    const kind = detectKind(filename);

    const { routePath, id, parentId } = deriveRoutePath(fileRel);

    const node: RouteNode = {
      id,
      routePath,
      kind,
      filePath: relPath,
      parentId
    };

    // Check shield report
    const shieldKey = toPosix(relPath.replace(/\.svelte$/, '.ts'));
    const shield = shieldByFile.get(shieldKey);
    if (shield) {
      node.shieldStatus = {
        hasNoCheck: shield.hasNoCheck,
        hasExpectError: shield.hasExpectError,
        isXStateMachine: shield.isXStateMachine
      };
    }

    addNode(node);
  }

  // Process TS/JS files
  console.log(`⚙️ Processing ${tsFiles.length} TypeScript/JavaScript files...`);
  for (const tsFile of tsFiles) {
    const relPath = toPosix(path.relative(ROOT, tsFile));
    const fileRel = toPosix(path.relative(ROUTES_DIR, tsFile));
    const filename = path.basename(tsFile);
    const kind = detectKind(filename);

    if (kind === 'other') continue; // Skip non-route files

    const { routePath, id, parentId } = deriveRoutePath(fileRel);

    let sourceFile;
    try {
      sourceFile = project.addSourceFileAtPath(tsFile);
    } catch (e) {
      continue; // Skip files that can't be parsed
    }
    if (!sourceFile) continue;

    const node: RouteNode = {
      id,
      routePath,
      kind,
      filePath: relPath,
      parentId,
      imports: [],
      importsAi: false,
      hasLoad: false,
      hasActions: false
    };

    // Detect exports
    sourceFile.forEachChild((child) => {
      const text = child.getText();
      if (text.includes('export const load') || text.includes('export function load')) {
        node.hasLoad = true;
      }
      if (text.includes('export const actions') || text.includes('export const POST') || text.includes('export const GET')) {
        node.hasActions = true;
      }
    });

    // Detect imports
    sourceFile.getImportDeclarations().forEach((imp) => {
      const source = imp.getModuleSpecifierValue();
      if (source.includes('$lib/ai') || source.includes('$lib/llm')) {
        node.importsAi = true;
      }
      if (source.startsWith('$lib')) {
        node.imports!.push(source);
      }
    });

    // Check shield report
    const shield = shieldByFile.get(toPosix(relPath));
    if (shield) {
      node.shieldStatus = {
        hasNoCheck: shield.hasNoCheck,
        hasExpectError: shield.hasExpectError,
        isXStateMachine: shield.isXStateMachine
      };
    }

    addNode(node);
  }

  const graph: RouteGraph = {
    nodes,
    edges,
    metadata: {
      generatedAt: new Date().toISOString(),
      routeCount: nodes.length,
      edgeCount: edges.length
    }
  };

  // Ensure output directory exists
  const outDir = path.dirname(OUT_JSON);
  await fs.mkdir(outDir, { recursive: true });

  // Write JSON
  await fs.writeFile(OUT_JSON, JSON.stringify(graph, null, 2), 'utf8');

  console.log(`\n✅ Route AST Graph generated:\n   ${OUT_JSON}`);
  console.log(`\n📊 Summary:`);
  console.log(`   🟢 Route nodes: ${nodes.length}`);
  console.log(`   🔗 Edges: ${edges.length}`);
  console.log(`   🤖 AI imports: ${nodes.filter((n) => n.importsAi).length}`);
  console.log(`   ⚡ With load(): ${nodes.filter((n) => n.hasLoad).length}`);
  console.log(`   📤 With actions: ${nodes.filter((n) => n.hasActions).length}`);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

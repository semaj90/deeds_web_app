import fs from 'node:fs';
import path from 'node:path';

const TARGET_FILE = 'sveltekit-frontend/scripts/atlas/generate-graph-exports.mjs';

const fallbackBlock = `
const CANDIDATE_ROOTS = [
  process.cwd(),
  path.join(process.cwd(), 'sveltekit-frontend'),
  path.resolve(process.cwd(), '..'),
  path.resolve(process.cwd(), '..', 'sveltekit-frontend'),
  'C:\\\\Users\\\\james\\\\Videos\\\\deeds-web-app\\\\sveltekit-frontend'
];

function firstExisting(relativePath) {
  for (const candidateRoot of CANDIDATE_ROOTS) {
    const candidate = path.join(candidateRoot, relativePath);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(root, relativePath);
}
`;

let text = fs.readFileSync(TARGET_FILE, 'utf8');

if (!text.includes('const CANDIDATE_ROOTS = [')) {
  text = text.replace(
    "const root = process.cwd();",
    `const root = process.cwd();\n${fallbackBlock}`
  );
}

const replacements = new Map([
  [
    "const GRAPH_PATH = path.join(root, 'docs', 'graph', 'codebase-graph.json');",
    "const GRAPH_PATH = firstExisting('docs/graph/codebase-graph.json');"
  ],
  [
    "const DEEP_GRAPH_PATH = path.join(root, 'memory', 'graphify', 'deep', 'deep-import-graph.json');",
    "const DEEP_GRAPH_PATH = firstExisting('memory/graphify/deep/deep-import-graph.json');"
  ],
  [
    "const DEEP_EDGES_PATH = path.join(root, 'memory', 'graphify', 'deep', 'deep-import-edges.jsonl');",
    "const DEEP_EDGES_PATH = firstExisting('memory/graphify/deep/deep-import-edges.jsonl');"
  ],
  [
    "const DOCSTORE_MANIFEST_PATH = path.join(root, 'memory', 'docstore', 'manifest.json');",
    "const DOCSTORE_MANIFEST_PATH = firstExisting('memory/docstore/manifest.json');"
  ],
  [
    "const KAG_MANIFEST_PATH = path.join(root, 'memory', 'kag-notes', 'manifest.json');",
    "const KAG_MANIFEST_PATH = firstExisting('memory/kag-notes/manifest.json');"
  ]
]);

for (const [from, to] of replacements) {
  text = text.replace(from, to);
}

fs.writeFileSync(TARGET_FILE, text, 'utf8');
console.log('PATCH_OK');
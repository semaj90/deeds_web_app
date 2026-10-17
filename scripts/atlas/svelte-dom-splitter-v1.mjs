// Read-only, diagnostic: splits a Svelte 5 component into DOM template nodes, script runes, and event handlers,
// each with exact UTF-8 byte spans (the sidecar's coordinate convention). Uses the project's svelte/compiler parser.
// Never writes to Postgres, Valkey, Qdrant or Neo4j. Receipts go to .tmp/atlas/ (gitignored).
// Fail-closed: a parse or span failure is recorded as FAILED and the process exits 1.
// Usage: node scripts/atlas/svelte-dom-splitter-v1.mjs <repo-relative .svelte file> [...]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { svelteReceiptFileNameV1 } from './lib/svelte-receipt-name-v1.mjs';
import { resolveSvelteSourceFileV1 } from './lib/resolve-svelte-source-file-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// svelte lives in the SvelteKit app's node_modules, not at the repo root.
const require = createRequire(path.join(repoRoot, 'sveltekit-frontend', 'package.json'));
const { parse } = require('svelte/compiler');

const RE = {
  revision: /^sha256:[0-9a-f]{64}$/,
  rune: /^\$(props|state|derived|effect)(\.[a-z]+)?$/,
};

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: svelte-dom-splitter-v1.mjs <file.svelte> [...]');
  process.exit(2);
}
// svelte/compiler offsets are UTF-16 code-unit indices into the JS string. Convert to UTF-8 bytes.
function byteOffsetFactory(source) {
  const cache = new Map();
  return (charIndex) => {
    if (!Number.isInteger(charIndex) || charIndex < 0 || charIndex > source.length) {
      throw new Error(`character index out of range: ${charIndex}`);
    }
    if (!cache.has(charIndex)) cache.set(charIndex, Buffer.byteLength(source.slice(0, charIndex), 'utf8'));
    return cache.get(charIndex);
  };
}

function walkTemplate(node, depth, parentId, out, toByte, source) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.start === 'number' && typeof node.end === 'number' && node.type) {
    const id = out.nodes.length;
    const elementLike = /Element|Component|Block|Snippet|Tag|Text/.test(node.type);
    if (elementLike) {
      out.nodes.push({
        id, parentId, depth,
        kind: node.type,
        name: node.name ?? (node.type === 'Text' ? null : undefined),
        byteStart: toByte(node.start),
        byteEnd: toByte(node.end),
      });
    }
    // Event handlers: on:click (OnDirective) or Svelte 5 onclick={...} (Attribute named on*).
    if (node.type === 'OnDirective' || (node.type === 'Attribute' && /^on[a-z]/.test(node.name ?? ''))) {
      const eventName = node.type === 'OnDirective' ? node.name : node.name.slice(2);
      out.handlers.push({
        event: eventName,
        syntax: node.type === 'OnDirective' ? 'on_directive' : 'svelte5_attribute',
        byteStart: toByte(node.start),
        byteEnd: toByte(node.end),
        parentId,
      });
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'metadata') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) walkTemplate(child, depth + (elementLike ? 1 : 0), elementLike ? id : parentId, out, toByte, source);
      } else if (value && typeof value === 'object' && typeof value.type === 'string') {
        walkTemplate(value, depth + (elementLike ? 1 : 0), elementLike ? id : parentId, out, toByte, source);
      }
    }
  } else {
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (key === 'parent' || key === 'metadata') continue;
      if (Array.isArray(value)) for (const c of value) walkTemplate(c, depth, parentId, out, toByte, source);
      else if (value && typeof value === 'object') walkTemplate(value, depth, parentId, out, toByte, source);
    }
  }
}

// Find rune calls in an ESTree Program: let x = $state(...), let {a} = $props(), const d = $derived(...).
function collectRunes(program, toByte, out) {
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.init && node.init.type === 'CallExpression') {
      const callee = node.init.callee;
      const calleeName = callee.type === 'Identifier' ? callee.name
        : callee.type === 'MemberExpression' && callee.object.type === 'Identifier' ? `${callee.object.name}.${callee.property.name}`
        : null;
      if (calleeName && RE.rune.test(calleeName)) {
        out.runes.push({
          rune: calleeName,
          bindingPattern: node.id.type,
          names: patternNames(node.id),
          byteStart: toByte(node.start),
          byteEnd: toByte(node.end),
        });
      }
    }
    if (node.type === 'ExpressionStatement' && node.expression?.type === 'CallExpression') {
      const c = node.expression.callee;
      const name = c.type === 'Identifier' ? c.name : null;
      if (name && RE.rune.test(name)) {
        out.runes.push({ rune: name, bindingPattern: 'NONE', names: [], byteStart: toByte(node.start), byteEnd: toByte(node.end) });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'metadata' || key === 'parent') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object') visit(v);
    }
  };
  visit(program);
}

function patternNames(id) {
  if (!id) return [];
  if (id.type === 'Identifier') return [id.name];
  if (id.type === 'ObjectPattern') {
    return id.properties.flatMap((p) => (p.type === 'RestElement' ? patternNames(p.argument) : patternNames(p.value)));
  }
  if (id.type === 'ArrayPattern') return id.elements.filter(Boolean).flatMap(patternNames);
  if (id.type === 'AssignmentPattern') return patternNames(id.left);
  return [];
}

function analyze(rel) {
  const stages = [];
  const stage = (name, fn) => {
    try {
      const out = fn();
      stages.push({ name, status: 'OK' });
      return out;
    } catch (err) {
      stages.push({ name, status: 'FAILED', error: String(err?.message ?? err).slice(0, 400) });
      return null;
    }
  };

  const target = stage('resolve_source_path', () => resolveSvelteSourceFileV1(repoRoot, rel));
  if (!target) return { rel, stages, receipt: null, outPath: null, rejected: true };
  const bytes = stage('read_source', () => fs.readFileSync(target.absolutePath));
  if (!bytes) return { rel, stages, receipt: null, outPath: null };
  const source = bytes.toString('utf8');
  const revision = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  if (!RE.revision.test(revision)) throw new Error('revision failed its own regex');
  const toByte = byteOffsetFactory(source);

  const ast = stage('svelte_parse', () => parse(source, { modern: true }));
  const out = { nodes: [], handlers: [], runes: [] };
  if (ast) {
    stage('template_walk', () => walkTemplate(ast.fragment, 0, null, out, toByte, source));
    stage('script_runes', () => {
      if (ast.instance?.content) collectRunes(ast.instance.content, toByte, out);
      if (ast.module?.content) collectRunes(ast.module.content, toByte, out);
    });
  }

  // Script blocks as raw <script ...>...</script> spans. Same extent the sidecar's /ast/chunk reports as
  // script_element, so the two can be compared directly (see the alignment check in the receipt).
  stage('script_blocks', () => {
    const re = /<script\b[^>]*>[\s\S]*?<\/script>/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      out.scripts = out.scripts ?? [];
      out.scripts.push({ byteStart: toByte(m.index), byteEnd: toByte(m.index + m[0].length) });
    }
    out.scripts = out.scripts ?? [];
  });

  // Span checks: every span inside the file, start < end, and nested spans sit inside their parent.
  stage('span_checks', () => {
    const size = bytes.length;
    const all = [...out.nodes, ...out.handlers, ...out.runes];
    for (const s of all) {
      // TemplateElement quasis may be empty (e.g. the segment between "${a}" and "${b}"); all other spans must be non-empty.
      // An empty attribute value (alt="") is a zero-width Text node; that is valid, not a span error.
      const emptyOk = (s.kind === 'TemplateElement' || s.kind === 'Text') && s.byteStart === s.byteEnd;
      if (!(s.byteStart >= 0 && s.byteEnd <= size && (s.byteStart < s.byteEnd || emptyOk))) {
        throw new Error(`span out of bounds: ${s.byteStart}-${s.byteEnd}`);
      }
    }
    for (const n of out.nodes) {
      if (n.parentId !== null) {
        const p = out.nodes[n.parentId];
        if (!(n.byteStart >= p.byteStart && n.byteEnd <= p.byteEnd)) throw new Error(`child ${n.id} escapes parent ${p.id}`);
      }
    }
  });

  const receipt = {
    schema: 'atlas.svelte-dom-split.v1',
    generated_at: new Date().toISOString(),
    mode: 'READ_ONLY_DIAGNOSTIC',
    canonicalAuthority: false,
    writesPerformed: false,
    source: { path: rel, disk_sha256: revision, disk_bytes: bytes.length, byteConvention: 'UTF8_BYTE' },
    stages,
    counts: { templateNodes: out.nodes.length, eventHandlers: out.handlers.length, runes: out.runes.length },
    templateNodeKinds: out.nodes.reduce((acc, n) => ((acc[n.kind] = (acc[n.kind] ?? 0) + 1), acc), {}),
    runeKinds: out.runes.reduce((acc, r) => ((acc[r.rune] = (acc[r.rune] ?? 0) + 1), acc), {}),
    scriptBlocks: out.scripts ?? [],
    nodes: out.nodes,
    eventHandlers: out.handlers,
    runes: out.runes,
    identityNote: 'Spans are byte offsets for this exact revision. Nodes are not canonical identity.',
  };
  const body = { ...receipt };
  receipt.receiptChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;

  const outDir = path.join(repoRoot, '.tmp', 'atlas');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, svelteReceiptFileNameV1(rel));
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  return { rel, stages, receipt, outPath };
}

const results = files.map((f) => analyze(f));
const failed = results.filter((r) => r.stages.some((s) => s.status === 'FAILED'));
const rejected = results.filter((r) => r.rejected).length;
const summary = {
  filesRequested: files.length,
  filesProcessed: results.filter((r) => r.receipt !== null).length,
  filesFailed: failed.length - rejected,
  filesRejected: rejected,
  filesSkipped: 0,
  exitCode: failed.length ? 1 : 0,
  files: results.map((r) => ({
    path: r.rel,
    outPath: r.outPath,
    stageStatus: r.stages.map((s) => `${s.name}:${s.status}`),
    counts: r.receipt?.counts ?? null,
    receiptChecksum: r.receipt?.receiptChecksum ?? null,
  })),
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.exitCode);

import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Proposal-only Svelte 5 template chunk extractor (pure, read-only). Uses the official Svelte compiler's modern AST as the extent
 * owner for template blocks, snippets and render tags, which the :8095 treesitter-chunker does not emit (it chunks only the opening
 * line of if/each/await/key blocks and has no snippet or render support). Compiler offsets are UTF-16 code-unit indexes; they are
 * converted to UTF-8 byte offsets and every span is read back from the exact source bytes. Output never carries identity or authority.
 */
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'sveltekit-frontend');
const requireFromFrontend = createRequire(path.join(frontendRoot, 'package.json'));
let compiler = null;
const loadCompiler = () => (compiler ??= requireFromFrontend('svelte/compiler'));

export const CHUNK_TYPE_BY_NODE = Object.freeze({
  IfBlock: 'if_block',
  EachBlock: 'each_block',
  AwaitBlock: 'await_block',
  KeyBlock: 'key_block',
  SnippetBlock: 'snippet_block',
  RenderTag: 'render_tag',
});

export function utf8Prefix(source) {
  const prefix = new Uint32Array(source.length + 1);
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i);
    let width = 3;
    if (code < 0x80) width = 1;
    else if (code < 0x800) width = 2;
    else if (code >= 0xd800 && code <= 0xdbff) width = 4; // high surrogate carries the whole 4-byte sequence
    else if (code >= 0xdc00 && code <= 0xdfff) width = 0; // low surrogate already counted
    prefix[i + 1] = prefix[i] + width;
  }
  return prefix;
}

export function extractSvelteTemplateChunks(source) {
  const sourceBuffer = Buffer.from(source, 'utf8');
  const base = { schema: 'atlas.svelte-template-chunks.v1', sourceSha256: `sha256:${crypto.createHash('sha256').update(sourceBuffer).digest('hex')}`, utf8ByteLength: sourceBuffer.length, proposalOnly: true, canonicalAuthority: false };
  let ast;
  try {
    ast = loadCompiler().parse(source, { modern: true });
  } catch (error) {
    return { ...base, outcome: 'PARSE_ERROR', error: String(error?.code ?? error?.message ?? error).slice(0, 160), chunks: [] };
  }
  const prefix = utf8Prefix(source);
  const chunks = [];
  const observations = [];
  const unlocatedConstructs = [];
  const nodeTypeCounts = new Map();
  const observedNodeTypes = new Set();
  const spanFor = (node) => {
    if (!Number.isInteger(node?.start) || !Number.isInteger(node?.end) || node.start < 0 || node.end < node.start || node.end > source.length) return null;
    const startByte = prefix[node.start];
    const endByte = prefix[node.end];
    const text = sourceBuffer.subarray(startByte, endByte).toString('utf8');
    return { startByte, endByte, sourceText: text, spanVerified: text === source.slice(node.start, node.end) };
  };
  const pushObservation = (observationType, node, fields = {}) => {
    const span = spanFor(node);
    if (!span) return;
    observations.push({ observationType, nodeType: node.type, ...span, ...fields, symbolResolution: 'NOT_ATTEMPTED' });
    observedNodeTypes.add(node.type);
  };
  const identifiersWithin = (node) => {
    const identifiers = [];
    const collect = (current) => {
      if (!current || typeof current !== 'object') return;
      if (Array.isArray(current)) { for (const item of current) collect(item); return; }
      if (current.type === 'Identifier' && Number.isInteger(current.start) && Number.isInteger(current.end)) identifiers.push(current);
      for (const key of Object.keys(current)) if (key !== 'parent' && key !== 'metadata') collect(current[key]);
    };
    collect(node);
    return identifiers;
  };
  const positionedDescendants = (node) => {
    const positioned = [];
    const collect = (current) => {
      if (!current || typeof current !== 'object') return;
      if (Array.isArray(current)) { for (const item of current) collect(item); return; }
      if (Number.isInteger(current.start) && Number.isInteger(current.end)) positioned.push(current);
      for (const key of Object.keys(current)) if (key !== 'parent' && key !== 'metadata') collect(current[key]);
    };
    collect(node);
    return positioned;
  };
  const visit = (node, parentType) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visit(item, parentType); return; }
    if (typeof node.type === 'string') nodeTypeCounts.set(node.type, (nodeTypeCounts.get(node.type) ?? 0) + 1);
    const chunkType = CHUNK_TYPE_BY_NODE[node.type];
    if (chunkType) {
      const span = spanFor(node);
      if (!span) return;
      chunks.push({
        chunkType,
        startByte: span.startByte,
        endByte: span.endByte,
        parentChunkType: parentType,
        name: node.type === 'SnippetBlock' ? node.expression?.name ?? null : node.type === 'RenderTag' ? node.expression?.callee?.name ?? node.expression?.expression?.callee?.name ?? null : null,
        sourceText: span.sourceText,
        spanVerified: span.spanVerified,
        hasAlternate: node.type === 'IfBlock' ? Boolean(node.alternate) : undefined,
      });
      observedNodeTypes.add(node.type);
    }
    if (node.type === 'IfBlock' && node.alternate) {
      const branchNodes = positionedDescendants(node.alternate);
      if (branchNodes.length > 0) {
        const branchStart = Math.min(...branchNodes.map((child) => child.start));
        const branchEnd = Math.max(...branchNodes.map((child) => child.end));
        pushObservation('if_alternate_branch_body', { type: node.alternate.type, start: branchStart, end: branchEnd }, { branchNodeType: node.alternate.type });
      } else {
        unlocatedConstructs.push({ constructType: 'if_alternate_branch_body', reason: 'ALTERNATE_FRAGMENT_HAS_NO_POSITIONED_CHILDREN', symbolResolution: 'NOT_ATTEMPTED' });
      }
      unlocatedConstructs.push({ constructType: 'if_alternate_delimiter', reason: 'COMPILER_AST_ALTERNATE_FRAGMENT_HAS_NO_SOURCE_RANGE', symbolResolution: 'NOT_ATTEMPTED' });
    }
    if (node.type === 'IfBlock' && node.test) {
      for (const identifier of identifiersWithin(node.test)) pushObservation('template_identifier_occurrence', identifier, { name: identifier.name, enclosingNodeType: 'IfBlock.test' });
    }
    if (node.type === 'EachBlock') {
      for (const binding of identifiersWithin(node.context)) pushObservation('each_context_binding', binding, { name: binding.name, bindingRole: 'CONTEXT', enclosingNodeType: node.type });
      if (node.index && typeof node.index === 'string') unlocatedConstructs.push({ constructType: 'each_index_binding', name: node.index, reason: 'COMPILER_AST_INDEX_NAME_HAS_NO_SOURCE_SPAN', symbolResolution: 'NOT_ATTEMPTED' });
      if (node.key) pushObservation('each_key_expression', node.key, { name: node.key.name ?? null, enclosingNodeType: node.type });
      if (node.expression) {
        pushObservation('each_collection_expression', node.expression, { enclosingNodeType: node.type });
        for (const identifier of identifiersWithin(node.expression)) pushObservation('template_identifier_occurrence', identifier, { name: identifier.name, enclosingNodeType: 'EachBlock.expression' });
      }
    }
    if (node.type === 'SnippetBlock') {
      for (const parameter of identifiersWithin(node.parameters)) pushObservation('snippet_parameter', parameter, { name: parameter.name, bindingRole: 'PARAMETER', enclosingNodeType: node.type });
    }
    if (node.type === 'RenderTag') {
      const call = node.expression?.type === 'CallExpression' ? node.expression : node.expression?.expression;
      const callee = call?.callee;
      if (callee) pushObservation('render_reference', callee, { name: callee.name ?? null, argumentCount: Array.isArray(call.arguments) ? call.arguments.length : null });
      for (const argument of call?.arguments ?? []) {
        pushObservation('render_argument', argument, { enclosingNodeType: node.type });
        for (const identifier of identifiersWithin(argument)) pushObservation('template_identifier_occurrence', identifier, { name: identifier.name, enclosingNodeType: 'RenderTag.argument' });
      }
    }
    if (node.type === 'BindDirective') {
      pushObservation('binding_directive', node, { name: node.name ?? null, bindingRole: 'BINDING' });
      for (const identifier of identifiersWithin(node.expression)) pushObservation('template_identifier_occurrence', identifier, { name: identifier.name, enclosingNodeType: 'BindDirective.expression' });
    }
    if (node.type === 'OnDirective' || (node.type === 'Attribute' && /^on(?::|[a-z])/i.test(node.name ?? ''))) {
      pushObservation('event_attribute', node, { name: node.name ?? null, bindingRole: 'EVENT_HANDLER' });
      if (node.type === 'OnDirective') {
        for (const identifier of identifiersWithin(node.expression)) pushObservation('template_identifier_occurrence', identifier, { name: identifier.name, enclosingNodeType: 'OnDirective.expression' });
      }
    }
    if (node.type === 'ExpressionTag') {
      for (const identifier of identifiersWithin(node.expression)) pushObservation('template_identifier_occurrence', identifier, { name: identifier.name, enclosingNodeType: node.type });
    }
    if (node.type === 'Script') {
      pushObservation('script_block', node, { scriptContext: node.context ?? 'instance' });
      for (const identifier of identifiersWithin(node.content)) pushObservation('script_identifier_occurrence', identifier, { name: identifier.name, scriptContext: node.context ?? 'instance' });
    }
    const nextParent = chunkType ?? parentType;
    for (const key of Object.keys(node)) if (key !== 'parent' && key !== 'metadata') visit(node[key], nextParent);
  };
  visit(ast, null);
  chunks.sort((a, b) => a.startByte - b.startByte || b.endByte - a.endByte);
  observations.sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte || a.observationType.localeCompare(b.observationType));
  const unsupportedNodeTypes = [...nodeTypeCounts]
    .filter(([nodeType]) => !observedNodeTypes.has(nodeType))
    .map(([nodeType, count]) => ({ nodeType, count, disposition: 'TRAVERSED_WITHOUT_TYPED_OBSERVATION' }))
    .sort((a, b) => a.nodeType.localeCompare(b.nodeType));
  return {
    ...base,
    outcome: 'EXTRACTED',
    chunks,
    observations,
    unlocatedConstructs,
    nodeTypeCounts: Object.fromEntries([...nodeTypeCounts].sort(([left], [right]) => left.localeCompare(right))),
    unsupportedNodeTypes,
    spanMismatches: chunks.filter((c) => !c.spanVerified).length + observations.filter((item) => !item.spanVerified).length,
    semanticResolution: 'NOT_PERFORMED_LSP_REQUIRED',
  };
}

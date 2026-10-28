import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { extractSvelteTemplateChunks } from './svelte-template-chunks-v1.mjs';

const requireFrontend = createRequire(new URL('../../../sveltekit-frontend/package.json', import.meta.url));
const { parse } = requireFrontend('svelte/compiler');

const source = ['<script lang="ts">', '  let { name }: { name: string } = $props(); // héllo 🚀', '  let n = $state(0);', '</script>', '{#if n > 0}', '  <p>ünï {name}</p>', '{:else}', '  <p>none</p>', '{/if}', '{#each [1,2] as i}', '  <li>{i}</li>', '{/each}', '{#snippet row(x)}<li>{x}</li>{/snippet}', '{@render row(n)}', '<button onclick={() => n++}>go</button>', ''].join('\r\n');

function assertExactUtf8Spans(input, receipt) {
  const bytes = Buffer.from(input, 'utf8');
  for (const item of [...receipt.chunks, ...receipt.observations]) {
    assert.equal(bytes.subarray(item.startByte, item.endByte).toString('utf8'), item.sourceText);
    assert.equal(item.spanVerified, true);
    assert.ok(item.startByte >= 0 && item.endByte >= item.startByte && item.endByte <= bytes.length);
  }
}

test('block, snippet and render extents match the compiler and read back exactly under CRLF and multibyte text', () => {
  const r = extractSvelteTemplateChunks(source);
  assert.equal(r.outcome, 'EXTRACTED');
  assert.equal(r.spanMismatches, 0);
  const byType = Object.fromEntries(r.chunks.map((c) => [c.chunkType, c]));
  assert.deepEqual(Object.keys(byType).sort(), ['each_block', 'if_block', 'render_tag', 'snippet_block']);
  // offsets the :8095 chunker also reports for the block starts, extents are the compiler's
  assert.equal(byType.if_block.startByte, 114);
  assert.equal(byType.if_block.endByte, 179);
  assert.equal(byType.each_block.startByte, 181);
  assert.equal(byType.each_block.endByte, 224);
  assert.equal(byType.snippet_block.name, 'row');
  assert.equal(byType.render_tag.name, 'row');
  assert.equal(byType.if_block.hasAlternate, true);
  assertExactUtf8Spans(source, r);
  const astNodes = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (['IfBlock', 'EachBlock', 'AwaitBlock', 'KeyBlock', 'SnippetBlock', 'RenderTag'].includes(node.type)) astNodes.push([node.type, node.start, node.end]);
    for (const key of Object.keys(node)) if (key !== 'parent' && key !== 'metadata') visit(node[key]);
  };
  visit(parse(source, { modern: true }).fragment);
  const prefix = (offset) => Buffer.byteLength(source.slice(0, offset), 'utf8');
  const actualExtents = r.chunks.map((chunk) => {
    const type = ({ if_block: 'IfBlock', each_block: 'EachBlock', await_block: 'AwaitBlock', key_block: 'KeyBlock', snippet_block: 'SnippetBlock', render_tag: 'RenderTag' })[chunk.chunkType];
    return [type, chunk.startByte, chunk.endByte];
  }).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  const expectedExtents = astNodes.map(([type, start, end]) => [type, prefix(start), prefix(end)]).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  assert.deepEqual(actualExtents, expectedExtents);
});

test('spans are UTF-8 byte offsets, not UTF-16 indexes', () => {
  const s = '<p>🚀</p>\n{#if a}x{/if}\n';
  const r = extractSvelteTemplateChunks(s);
  const c = r.chunks.find((x) => x.chunkType === 'if_block');
  assert.equal(Buffer.from(s, 'utf8').subarray(c.startByte, c.endByte).toString('utf8'), '{#if a}x{/if}');
  assert.ok(c.startByte > s.indexOf('{#if'));
});

test('nested blocks record their parent chunk type and ordering is by source position', () => {
  const r = extractSvelteTemplateChunks('{#if a}{#each b as c}{c}{/each}{/if}');
  assert.deepEqual(r.chunks.map((c) => [c.chunkType, c.parentChunkType]), [['if_block', null], ['each_block', 'if_block']]);
});

test('LF and mixed-newline inputs expose branches, bindings, attributes and unresolved identifier occurrences', () => {
  const fixtures = [
    '<script>let value = $state(0);</script>\n{#if value}<b>{value}</b>{:else}<i>none</i>{/if}\n{#each [1] as item, index}<p>{item}</p>{/each}\n{#snippet row(arg)}<b>{arg}</b>{/snippet}\n{@render row(value)}\n<button onclick={() => value++} bind:value={value}></button>',
    '<script>\r\nlet value = $state(0);\n</script>\r\n{#if value}{#each [1] as item}<p>🚀 {item}</p>{/each}{:else}<p>ünï</p>{/if}\n{#snippet row(arg)}{arg}{/snippet}\r\n{@render row(value)}\n<button onclick={() => value++} bind:value={value}></button>',
  ];
  for (const input of fixtures) {
    const receipt = extractSvelteTemplateChunks(input);
    assert.equal(receipt.outcome, 'EXTRACTED');
    assertExactUtf8Spans(input, receipt);
    const types = new Set(receipt.observations.map((item) => item.observationType));
    for (const type of ['if_alternate_branch_body', 'each_context_binding', 'snippet_parameter', 'render_reference', 'render_argument', 'event_attribute', 'binding_directive', 'script_identifier_occurrence', 'template_identifier_occurrence']) assert.ok(types.has(type), type);
    assert.ok(receipt.unlocatedConstructs.some((item) => item.constructType === 'if_alternate_delimiter'));
    if (input.includes('as item, index')) assert.ok(receipt.unlocatedConstructs.some((item) => item.constructType === 'each_index_binding' && item.reason === 'COMPILER_AST_INDEX_NAME_HAS_NO_SOURCE_SPAN'));
    assert.equal(receipt.semanticResolution, 'NOT_PERFORMED_LSP_REQUIRED');
    assert.ok(receipt.unsupportedNodeTypes.every((item) => item.disposition === 'TRAVERSED_WITHOUT_TYPED_OBSERVATION'));
  }
});

test('invalid markup is a typed PARSE_ERROR with no chunks, and output is proposal-only', () => {
  const r = extractSvelteTemplateChunks('{#if a}<p>');
  assert.equal(r.outcome, 'PARSE_ERROR');
  assert.deepEqual(r.chunks, []);
  assert.equal(r.proposalOnly, true);
  assert.equal(r.canonicalAuthority, false);
});

test('replay is deterministic', () => {
  assert.equal(JSON.stringify(extractSvelteTemplateChunks(source)), JSON.stringify(extractSvelteTemplateChunks(source)));
});

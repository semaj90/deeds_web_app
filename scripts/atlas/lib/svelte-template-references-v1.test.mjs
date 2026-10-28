import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSvelteTemplateReferences } from './svelte-template-references-v1.mjs';

const source = [
  '<script lang="ts">',
  '  import Card from "./Card.svelte";',
  '  import { helper, fade } from "./h";',
  '  let { items, title }: { items: number[]; title: string } = $props();',
  '  let count = $state(0); // héllo 🚀',
  '  function inc() { count++; }',
  '  const shown = $derived(helper(count));',
  '</script>',
  '<Card {title} onclick={inc}>',
  '  {#each items as item, i (item)}',
  '    {@const sq = item * item}',
  '    <p class:on={i > 0} transition:fade>{sq} {item} {count} {missing}</p>',
  '  {/each}',
  '</Card>',
  '{#snippet row(x)}<li>{x}{shown}</li>{/snippet}',
  '{@render row(count)}',
  '{#await helper(1) then v}{v}{:catch err}{err}{/await}',
  '<button onclick={() => items.map((q) => q + count)}>{Math.max(1, 2)} {obj.title}</button>',
  '<input bind:value={title} />',
  '',
].join('\r\n');

const find = (r, name, context) => r.references.filter((x) => x.name === name && (!context || x.context === context));

test('script imports, props, runes and declarations resolve by scope; template locals shadow nothing they should not', () => {
  const r = analyzeSvelteTemplateReferences(source);
  assert.equal(r.outcome, 'ANALYZED');
  assert.equal(find(r, 'Card', 'component-tag')[0].outcome, 'SCRIPT_IMPORT_BINDING');
  assert.equal(find(r, 'inc')[0].outcome, 'SCRIPT_DECLARATION_BINDING');
  assert.equal(find(r, 'title', 'attribute')[0]?.outcome ?? find(r, 'title')[0].outcome, 'SCRIPT_DECLARATION_BINDING');
  assert.ok(find(r, 'count').every((x) => x.outcome === 'SCRIPT_DECLARATION_BINDING'));
  assert.equal(find(r, 'items', 'each')[0].outcome, 'SCRIPT_DECLARATION_BINDING');
  assert.equal(find(r, 'shown')[0].outcome, 'SCRIPT_DECLARATION_BINDING');
});

test('each context, index, key, {@const}, snippet parameters, await value/error and arrow parameters are template-local', () => {
  const r = analyzeSvelteTemplateReferences(source);
  for (const name of ['item', 'i', 'sq', 'x', 'v', 'err', 'q']) {
    const refs = find(r, name);
    assert.ok(refs.length > 0, `${name} referenced`);
    assert.ok(refs.every((x) => x.outcome === 'TEMPLATE_LOCAL_BINDING'), `${name} should be template-local, got ${refs.map((x) => x.outcome)}`);
  }
});

test('a snippet name referenced by {@render} is a template-local binding, not free', () => {
  const r = analyzeSvelteTemplateReferences(source);
  assert.equal(find(r, 'row', 'render')[0].outcome, 'TEMPLATE_LOCAL_BINDING');
});

test('unknown names are FREE_IDENTIFIER, builtins are candidates only, member properties are not references', () => {
  const r = analyzeSvelteTemplateReferences(source);
  assert.equal(find(r, 'missing')[0].outcome, 'FREE_IDENTIFIER');
  assert.equal(find(r, 'Math')[0].outcome, 'GLOBAL_OR_BUILTIN_CANDIDATE');
  assert.equal(find(r, 'obj')[0].outcome, 'FREE_IDENTIFIER');
  // `.title` on obj is a property name, not a reference; the only `title` references are the script-bound ones
  assert.ok(find(r, 'title').every((x) => x.outcome === 'SCRIPT_DECLARATION_BINDING'));
  assert.equal(find(r, 'max').length, 0);
});

test('directive names resolve through the same scopes', () => {
  const r = analyzeSvelteTemplateReferences(source);
  assert.equal(find(r, 'fade', 'directive:TransitionDirective')[0].outcome, 'SCRIPT_IMPORT_BINDING');
  assert.equal(find(r, 'title', 'directive:BindDirective')[0].outcome, 'SCRIPT_DECLARATION_BINDING');
});

test('every span is a UTF-8 byte offset that reads back to the name, including after CRLF and multibyte text', () => {
  const r = analyzeSvelteTemplateReferences(source);
  assert.ok(r.references.length > 20);
  assert.equal(r.spanMismatches, 0);
});

test('store auto-subscription candidate and svelte globals', () => {
  const r = analyzeSvelteTemplateReferences('<script>import { store } from "./s"; </script>\n{$store} {$$props.a}');
  assert.equal(find(r, '$store')[0].outcome, 'STORE_SUBSCRIPTION_CANDIDATE');
  assert.equal(find(r, '$$props')[0].outcome, 'SVELTE_GLOBAL');
});

test('invalid markup is a typed PARSE_ERROR; output is proposal-only and lexical-only; replay is deterministic', () => {
  const bad = analyzeSvelteTemplateReferences('{#if a}<p>');
  assert.equal(bad.outcome, 'PARSE_ERROR');
  assert.equal(bad.canonicalAuthority, false);
  assert.equal(bad.lexicalOnly, true);
  assert.equal(JSON.stringify(analyzeSvelteTemplateReferences(source)), JSON.stringify(analyzeSvelteTemplateReferences(source)));
});

test('loop declarations and local declarations inside handlers are bound; declaration names are not references', () => {
  const r = analyzeSvelteTemplateReferences('<script lang="ts">let STAGES = []; let enabled = {};</script>\n<button onclick={() => { for (const s of STAGES) enabled[s.id] = true; const issues: string[] = []; issues.push(1); }}>x</button>');
  const s = r.references.filter((x) => x.name === 's');
  assert.ok(s.length > 0 && s.every((x) => x.outcome === 'TEMPLATE_LOCAL_BINDING'));
  assert.equal(r.spanMismatches, 0);
  // `issues` appears once as a use (issues.push), never as the declaration identifier
  assert.equal(r.references.filter((x) => x.name === 'issues').length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { extractScriptBlocks, analyzeSvelteScripts } from './svelte-script-scope-v1.mjs';
import { verifySpans } from './ast-lexical-scope-v1.mjs';

const comp = '<script lang="ts">\n  import { helper } from "./h";\n  let { value }: { value: number } = $props();\n  let count = $state(0);\n  const doubled = helper(count) + value;\n</script>\n<p>{doubled} {missing}</p>\n';

test('script blocks are extracted with language and module flag', () => {
  const b = extractScriptBlocks('<script context="module" lang="ts">export const a = 1;</script>\n<script>let b = 2;</script>');
  assert.equal(b.length, 2);
  assert.equal(b[0].module, true);
  assert.equal(b[0].language, 'typescript');
  assert.equal(b[1].language, 'javascript');
  assert.equal(b[1].module, false);
});

test('imports, props, runes and locals resolve inside the script; template-only names are not analysed', () => {
  const r = analyzeSvelteScripts(comp);
  const find = (name) => r.occurrences.filter((o) => o.name === name);
  assert.equal(find('helper')[0].outcome, 'IMPORT_BINDING_VERIFIED');
  assert.equal(find('count')[0].outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find('value')[0].outcome, 'LOCAL_BINDING_VERIFIED');
  assert.equal(find('$props')[0].note, 'svelte-rune');
  assert.equal(find('$state')[0].note, 'svelte-rune');
  assert.equal(find('missing').length, 0);
  assert.equal(r.templateAnalyzed, false);
});

test('spans are absolute UTF-8 byte offsets in the .svelte file, including after multibyte text', () => {
  const source = '<!-- 🚀 -->\n' + comp;
  const r = analyzeSvelteScripts(source);
  const check = verifySpans(Buffer.from(source, 'utf8'), [...r.occurrences, ...r.bindings]);
  assert.ok(check.checked > 0);
  assert.equal(check.ok, check.checked);
});

test('a script with a syntax error or no script block is typed, not guessed', () => {
  assert.equal(analyzeSvelteScripts('<script>const = ;;; function (</script>').unsupported[0].reason, 'SYNTAX_ERROR');
  assert.equal(analyzeSvelteScripts('<p>no script</p>').blocks, 0);
});

test('two blocks keep separate scopes and shifted spans', () => {
  const source = '<script context="module">export const shared = 1;</script>\n<script>let local = shared;</script>';
  const r = analyzeSvelteScripts(source);
  assert.equal(r.blocks, 2);
  assert.equal(r.occurrences.find((o) => o.name === 'shared').outcome, 'FREE_IDENTIFIER');
  assert.equal(verifySpans(Buffer.from(source, 'utf8'), [...r.occurrences, ...r.bindings]).ok, r.occurrences.length + r.bindings.length);
});

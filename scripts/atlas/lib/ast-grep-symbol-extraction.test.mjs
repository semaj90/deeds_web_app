import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSymbolsViaAstGrep, isAstGrepAvailable } from './ast-grep-symbol-extraction.mjs';

const SAMPLE_TS = `
export async function handleReconnect(a: number) {
  return a;
}
export class WebsocketClient {}
const retryPolicy = () => 1;
export const handleQuick = (a) => a + 1;
interface RetryOptions { attempts: number }
type Backoff = number;
import { foo } from "./bar";
import baz from "../baz.js";
`;

test('returns null for unsupported languages (honest fallback signal)', () => {
  assert.equal(extractSymbolsViaAstGrep('def foo(): pass', 'python'), null);
  assert.equal(extractSymbolsViaAstGrep('func Foo() {}', 'go'), null);
});

test('extracts function/class/interface/type/import symbols from real TS source', { skip: !isAstGrepAvailable() }, () => {
  const result = extractSymbolsViaAstGrep(SAMPLE_TS, 'typescript');
  assert.equal(result.method, 'ast_grep');
  assert.ok(result.symbols.includes('handleReconnect'));
  assert.ok(result.symbols.includes('WebsocketClient'));
  assert.ok(result.symbols.includes('retryPolicy'));
  assert.ok(result.symbols.includes('handleQuick'));
  assert.ok(result.symbols.includes('RetryOptions'));
  assert.ok(result.symbols.includes('Backoff'));
  assert.ok(result.symbols.includes('import:./bar'));
  assert.ok(result.symbols.includes('import:../baz.js'));
});

test('is deterministic for identical input', { skip: !isAstGrepAvailable() }, () => {
  const first = extractSymbolsViaAstGrep(SAMPLE_TS, 'typescript');
  const second = extractSymbolsViaAstGrep(SAMPLE_TS, 'typescript');
  assert.deepEqual(first, second);
});

test('empty source returns empty symbols, not an error', { skip: !isAstGrepAvailable() }, () => {
  const result = extractSymbolsViaAstGrep('', 'typescript');
  assert.deepEqual(result.symbols, []);
  assert.equal(result.coverage, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMatchingBrace,
  classifyBodyParser,
  classifyZodValidation,
  analyzeRouteHandlers,
} from './route-handler-ast-analyzer-v1.mjs';

test('findMatchingBrace balances nested braces and ignores strings/comments', () => {
  const code = '{\n  const x = "{ not a brace }";\n  // comment with }\n  /* block }\n */\n  if (true) { return 1; }\n}';
  const close = findMatchingBrace(code, 0);
  assert.equal(close, code.length - 1);
});

test('classifyBodyParser detects request.json, formData, text, arrayBuffer, and helpers', () => {
  assert.equal(classifyBodyParser('const d = await request.json();'), 'request.json');
  assert.equal(classifyBodyParser('const f = await req.formData();', 'req'), 'request.formData');
  assert.equal(classifyBodyParser('const t = await event.request.text();'), 'request.text');
  assert.equal(classifyBodyParser('const b = await request.arrayBuffer();'), 'request.arrayBuffer');
  assert.equal(classifyBodyParser('const p = await parseBody(event);'), 'delegated_helper');
  assert.equal(classifyBodyParser('const x = 123; return json({ x });'), null);
});

test('classifyZodValidation detects safeParse, parse, schema_wrapper, and not_proven', () => {
  assert.equal(classifyZodValidation('const res = schema.safeParse(data);'), 'safeParse');
  assert.equal(classifyZodValidation('const res = schema.parse(data);'), 'parse');
  assert.equal(classifyZodValidation('const s = z.object({ id: z.string() });'), 'schema_wrapper');
  assert.equal(classifyZodValidation('if (!data.id) return error(400);'), 'not_proven');
});

test('analyzeRouteHandlers: standard POST with request.json() and safeParse', () => {
  const src = `
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const schema = z.object({ query: z.string() });

export const POST = async ({ request }) => {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: 'bad' }, { status: 400 });
  return json({ ok: true });
};
`;
  const result = analyzeRouteHandlers(src, { rel: 'src/routes/api/test/+server.ts' });
  assert.equal(result.parsesBody, true);
  assert.equal(result.hasZod, true);
  assert.equal(result.handlers.length, 1);
  assert.equal(result.handlers[0].method, 'POST');
  assert.equal(result.handlers[0].parsesBody, true);
  assert.equal(result.handlers[0].bodyParser, 'request.json');
  assert.equal(result.handlers[0].zodValidation, 'safeParse');
  assert.equal(result.handlers[0].analysisStatus, 'complete');
});

test('analyzeRouteHandlers: destructured handler with aliased request { request: req }', () => {
  const src = `
export async function POST({ request: req, locals }) {
  const data = await req.json();
  return json(data);
}
`;
  const result = analyzeRouteHandlers(src);
  assert.equal(result.parsesBody, true);
  assert.equal(result.handlers.length, 1);
  assert.equal(result.handlers[0].method, 'POST');
  assert.equal(result.handlers[0].parsesBody, true);
  assert.equal(result.handlers[0].bodyParser, 'request.json');
  assert.equal(result.handlers[0].zodValidation, 'not_proven');
});

test('analyzeRouteHandlers: delegated handler alias export const POST = handlePost', () => {
  const src = `
export const POST = handlePost;
`;
  const result = analyzeRouteHandlers(src);
  assert.equal(result.parsesBody, true);
  assert.equal(result.handlers.length, 1);
  assert.equal(result.handlers[0].method, 'POST');
  assert.equal(result.handlers[0].bodyParser, 'delegated_helper');
  assert.equal(result.handlers[0].analysisStatus, 'delegated_unverified');
});

test('analyzeRouteHandlers: pure GET route with no body parsing', () => {
  const src = `
export const GET = async ({ url }) => {
  const id = url.searchParams.get('id');
  return json({ id });
};
`;
  const result = analyzeRouteHandlers(src);
  assert.equal(result.parsesBody, false);
  assert.equal(result.handlers.length, 1);
  assert.equal(result.handlers[0].method, 'GET');
  assert.equal(result.handlers[0].parsesBody, false);
  assert.equal(result.handlers[0].bodyParser, null);
  assert.equal(result.handlers[0].zodValidation, 'not_proven');
});

test('analyzeRouteHandlers: multiple handlers in single file (GET + POST)', () => {
  const src = `
export const GET = async () => {
  return json({ status: 'ok' });
};

export const POST = async ({ request }) => {
  const data = await request.formData();
  const parsed = formSchema.parse(data);
  return json({ parsed });
};
`;
  const result = analyzeRouteHandlers(src);
  assert.equal(result.parsesBody, true);
  assert.equal(result.handlers.length, 2);
  assert.equal(result.handlers[0].method, 'GET');
  assert.equal(result.handlers[0].parsesBody, false);
  assert.equal(result.handlers[1].method, 'POST');
  assert.equal(result.handlers[1].parsesBody, true);
  assert.equal(result.handlers[1].bodyParser, 'request.formData');
  assert.equal(result.handlers[1].zodValidation, 'parse');
});

test('analyzeRouteHandlers: unbalanced syntax handled gracefully with partial status', () => {
  const src = `
export const POST = async ({ request }) => {
  const d = await request.json();
  // truncated file without closing brace
`;
  const result = analyzeRouteHandlers(src);
  assert.equal(result.parsesBody, true);
  assert.equal(result.handlers.length, 1);
  assert.equal(result.handlers[0].analysisStatus, 'partial');
  assert.equal(result.handlers[0].bodyParser, 'request.json');
});

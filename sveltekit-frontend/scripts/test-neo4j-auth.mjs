#!/usr/bin/env node
import 'dotenv/config';

const NEO4J_HTTP_URL = (process.env.NEO4J_HTTP_URL ?? 'http://localhost:7474').replace(/\/$/, '');
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';

const endpoint = `${NEO4J_HTTP_URL}/db/neo4j/tx/commit`;
const auth = Buffer.from(`${NEO4J_USER}:${NEO4J_PASSWORD}`).toString('base64');

try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      statements: [{ statement: 'RETURN 1 AS ok' }]
    }),
    signal: AbortSignal.timeout(8_000)
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(JSON.stringify({
      ok: false,
      endpoint,
      status: response.status,
      user: NEO4J_USER,
      body: text.slice(0, 500)
    }, null, 2));
    process.exit(1);
  }

  const body = JSON.parse(text);
  const errors = Array.isArray(body.errors) ? body.errors : [];
  if (errors.length) {
    console.error(JSON.stringify({ ok: false, endpoint, user: NEO4J_USER, errors }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    endpoint,
    user: NEO4J_USER,
    result: body.results?.[0]?.data?.[0]?.row?.[0] ?? null
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    endpoint,
    user: NEO4J_USER,
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connectLdrMcpV1, runLdrReportV1 } from './ldr-report-v1.mjs';

test('MCP uses pinned API, preserves auth, and retrieves the final report', async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ path: request.url, cookie: request.headers.cookie, csrf: request.headers['x-csrftoken'], body });
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/auth/check') response.end(JSON.stringify({ authenticated: true }));
    else if (request.url === '/api/start_research') response.end(JSON.stringify({ research_id: 'fixture-1' }));
    else if (request.url === '/api/research/fixture-1/status') response.end(JSON.stringify({ status: 'completed' }));
    else if (request.url === '/api/report/fixture-1') response.end(JSON.stringify({ content: '# Grounded fixture', sources: [{ url: 'https://example.org' }] }));
    else if (request.url.startsWith('/api/history')) response.end(JSON.stringify({ status: 'success', items: [{ id: 'fixture-1', status: 'completed', query: 'Repository decomposition' }] }));
    else { response.statusCode = 404; response.end('{}'); }
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const client = connectLdrMcpV1({ ...process.env, LDR_BASE_URL: `http://127.0.0.1:${server.address().port}`, LDR_ENABLED: 'true', LDR_SESSION_COOKIE: 'session=fixture', LDR_CSRF_TOKEN: 'fixture' });
  try {
    const tools = await client.initialize();
    assert.ok(tools.tools.some((tool) => tool.name === 'ldr.get_report'));
    await client.call('ldr.start_research', { query: 'Repository decomposition', max_iterations: 1 });
    await client.call('ldr.poll_status', { taskId: 'fixture-1' });
    const report = await client.call('ldr.get_report', { taskId: 'fixture-1' });
    assert.equal(report.content, '# Grounded fixture');
    assert.equal(report.canonicalAuthority, false);
    assert.equal((await client.call('ldr.search_history', { query: 'Repository decomposition' })).taskId, 'fixture-1');
    assert.deepEqual(JSON.parse(requests[1].body), { query: 'Repository decomposition', iterations: 1, search_engine: 'searxng', mode: 'detailed' });
    assert.ok(requests.every((request) => request.cookie === 'session=fixture' && request.csrf === 'fixture'));
    const count = requests.length;
    await assert.rejects(client.call('ldr.start_research', { query: 'Valid query', max_iterations: 100 }), /INVALID_RESEARCH_INPUT/);
    await assert.rejects(client.call('ldr.quick_summary', { query: 'Valid query' }), /UNSUPPORTED_BY_PINNED/);
    assert.equal(requests.length, count);
  } finally { client.close(); await new Promise((resolveClose) => server.close(resolveClose)); }
});

for (const status of [302, 401, 403]) {
  test(`MCP rejects HTTP ${status} without following redirects or hiding auth failure`, async () => {
    const server = createServer((request, response) => { response.writeHead(status, { Location: '/auth/login' }); response.end(); });
    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const client = connectLdrMcpV1({ ...process.env, LDR_BASE_URL: `http://127.0.0.1:${server.address().port}`, LDR_ENABLED: 'true', LDR_CREDENTIAL_LOGIN: 'false' });
    try {
      await client.initialize();
      await assert.rejects(client.call('ldr.search_history', { query: 'Repository decomposition' }), /LDR_AUTH_REQUIRED_OR_FORBIDDEN/);
      await assert.rejects(client.call('ldr.start_research', { query: 'Repository decomposition' }), /LDR_AUTH_REQUIRED_OR_FORBIDDEN/);
    } finally { client.close(); await new Promise((resolveClose) => server.close(resolveClose)); }
  });
}

test('report CLI requires explicit start authorization and rejects unknown options', async () => {
  await assert.rejects(runLdrReportV1(['--query=Research']), /requires --start/);
  await assert.rejects(runLdrReportV1(['--apply']), /Unknown argument/);
});

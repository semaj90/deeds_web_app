import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLdrSessionV1 } from '../../sveltekit-frontend/scripts/mcp/ldr-session-v1.mjs';

test('login keeps rotated cookies and CSRF in memory and retries the authorized request', async () => {
  let loggedIn = false;
  let logins = 0;
  const fetcher = createLdrSessionV1({
    baseUrl: 'http://127.0.0.1:5000', env: { LDR_USERNAME: 'fixture', LDR_PASSWORD: 'fixture-secret' },
    fetchImpl: async (url, options) => {
      const path = url.pathname;
      if (path === '/auth/csrf-token') return Response.json({ csrf_token: loggedIn ? 'new-token' : 'old-token' }, { headers: { 'Set-Cookie': `session=${loggedIn ? 'new' : 'old'}; HttpOnly; Path=/` } });
      if (path === '/auth/login') {
        logins++;
        assert.equal(options.redirect, 'manual');
        assert.equal(options.body.get('password'), 'fixture-secret');
        assert.equal(options.body.get('csrf_token'), 'old-token');
        assert.equal(options.headers.Cookie, 'session=old');
        loggedIn = true;
        return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': 'session=new; HttpOnly; Path=/' } });
      }
      if (path === '/auth/check') return Response.json({ authenticated: loggedIn });
      if (!loggedIn) return new Response(null, { status: 401 });
      assert.equal(options.headers.Cookie, 'session=new');
      assert.equal(options.headers['X-CSRFToken'], 'new-token');
      return Response.json({ ok: true });
    },
  });
  assert.equal((await fetcher('/api/history')).status, 200);
  assert.equal((await fetcher('/api/history')).status, 200);
  assert.equal(logins, 1);
});

test('failed login is not retried repeatedly and does not reveal credentials', async () => {
  let attempts = 0;
  const fetcher = createLdrSessionV1({ baseUrl: 'http://localhost:5000', env: { LDR_USERNAME: 'fixture', LDR_PASSWORD: 'secret' }, fetchImpl: async (url) => {
    if (url.pathname === '/auth/csrf-token') return Response.json({ csrf_token: 'token' });
    if (url.pathname === '/auth/login') attempts++;
    return new Response(null, { status: 401 });
  } });
  await assert.rejects(fetcher('/api/history'), /^Error: LDR_LOGIN_FAILED \(HTTP 401\)$/);
  await assert.rejects(fetcher('/api/history'), /LDR_LOGIN_FAILED/);
  assert.equal(attempts, 1);
});

test('credentials cannot be sent to a non-loopback host or cross-origin URL', async () => {
  const fetchImpl = async () => { throw new Error('must not fetch'); };
  const remote = createLdrSessionV1({ baseUrl: 'https://example.com', env: { LDR_USERNAME: 'fixture', LDR_PASSWORD: 'secret' }, fetchImpl });
  await assert.rejects(remote('/api/history'), /CREDENTIALS_REQUIRE_LOOPBACK/);
  const local = createLdrSessionV1({ baseUrl: 'http://localhost:5000', env: {}, fetchImpl });
  await assert.rejects(local('https://example.com'), /CROSS_ORIGIN_REJECTED/);
});

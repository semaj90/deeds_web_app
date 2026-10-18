export function createLdrSessionV1({ baseUrl, env = process.env, fetchImpl = fetch }) {
  const origin = new URL(baseUrl);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('INVALID_LDR_ORIGIN');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
  const cookies = new Map();
  for (const entry of (env.LDR_SESSION_COOKIE ?? '').split(';')) {
    const separator = entry.indexOf('=');
    if (separator > 0) cookies.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim());
  }
  let csrf = env.LDR_CSRF_TOKEN;
  let loginPromise;
  async function request(path, init = {}) {
    const target = new URL(path, origin);
    if (target.origin !== origin.origin) throw new Error('LDR_CROSS_ORIGIN_REJECTED');
    if (!local && (cookies.size || env.LDR_USERNAME || env.LDR_PASSWORD)) throw new Error('LDR_CREDENTIALS_REQUIRE_LOOPBACK');
    const response = await fetchImpl(target, {
      ...init, redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers,
        ...(cookies.size ? { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') } : {}),
        ...(csrf ? { 'X-CSRFToken': csrf } : {}),
      },
    });
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator < 1) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) cookies.set(name, value); else cookies.delete(name);
    }
    return response;
  }
  async function refreshCsrf() {
    const response = await request('/auth/csrf-token');
    if (!response.ok) throw new Error(`LDR_CSRF_FAILED (HTTP ${response.status})`);
    const data = await response.json();
    if (typeof data.csrf_token !== 'string' || !data.csrf_token) throw new Error('LDR_CSRF_MISSING');
    csrf = data.csrf_token;
  }
  async function login() {
    if (!local) throw new Error('LDR_CREDENTIALS_REQUIRE_LOOPBACK');
    await refreshCsrf();
    const response = await request('/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: env.LDR_USERNAME, password: env.LDR_PASSWORD, csrf_token: csrf, remember: 'false' }),
    });
    if (![200, 302, 303].includes(response.status)) throw new Error(`LDR_LOGIN_FAILED (HTTP ${response.status})`);
    const check = await request('/auth/check');
    if (!check.ok || (await check.json()).authenticated !== true) throw new Error('LDR_LOGIN_NOT_AUTHENTICATED');
    await refreshCsrf();
  }
  return async (path, init = {}) => {
    let response = await request(path, init);
    const needsLogin = response.status === 401 || ([302, 303].includes(response.status) && response.headers.get('location')?.includes('/auth/login'));
    if (needsLogin && env.LDR_CREDENTIAL_LOGIN !== 'false' && env.LDR_USERNAME && env.LDR_PASSWORD) {
      loginPromise ??= login();
      await loginPromise;
      response = await request(path, init);
    }
    if ([301, 302, 303, 307, 308, 401, 403].includes(response.status)) throw new Error(`LDR_AUTH_REQUIRED_OR_FORBIDDEN (HTTP ${response.status})`);
    return response;
  };
}

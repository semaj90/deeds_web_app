#!/usr/bin/env node

export function resolveValkeyEndpoint(env = process.env) {
  const candidate = String(env.VALKEY_URL || env.REDIS_URL || 'redis://127.0.0.1:6379').trim();
  const source = env.VALKEY_URL ? 'VALKEY_URL' : env.REDIS_URL ? 'REDIS_URL' : 'default';
  let hostname = '127.0.0.1';
  let port = '6379';

  try {
    const parsed = new URL(candidate);
    hostname = parsed.hostname || hostname;
    port = parsed.port || (parsed.protocol === 'rediss:' ? '6380' : port);
  } catch {
    if (env.VALKEY_HOST || env.REDIS_HOST) hostname = String(env.VALKEY_HOST || env.REDIS_HOST).trim();
    if (env.VALKEY_PORT || env.REDIS_PORT) port = String(env.VALKEY_PORT || env.REDIS_PORT).trim();
  }

  return {
    url: candidate,
    source,
    displayEndpoint: `${hostname}:${port}`,
    hostname,
    port: Number.parseInt(port, 10),
  };
}

export async function probeHttp(name, url, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.1' },
    });
    const body = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(`${name} returned HTTP ${response.status} ${response.statusText} url=${url} body=${body.slice(0, 300)}`);
    }
    const result = {
      name,
      url,
      status: response.status,
      bodyPreview: body.slice(0, 300),
    };
    console.log(`OK ${name} url=${url} status=${response.status}`);
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const cause = err.cause && typeof err.cause === 'object' ? err.cause : null;
    const fields = [
      'FAIL',
      `name=${name}`,
      `url=${url}`,
      `error=${err.name}`,
      `message=${JSON.stringify(err.message)}`,
      cause?.code ? `cause_code=${cause.code}` : null,
      cause?.message ? `cause_message=${JSON.stringify(cause.message)}` : null,
      cause?.address ? `address=${cause.address}` : null,
      cause?.port ? `port=${cause.port}` : null,
      cause?.syscall ? `syscall=${cause.syscall}` : null,
    ].filter(Boolean);
    console.error(fields.join(' '));
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

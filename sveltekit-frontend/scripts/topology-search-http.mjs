import http from 'node:http';

const ROUTES = Object.freeze({
  'GET /health': 'health',
  'GET /ready': 'ready',
  'POST /search': 'search',
  'POST /search/cosine': 'cosine',
  'POST /search/hybrid': 'hybrid',
});

function writeJson(res, status, body, origin) {
  if (res.writableEnded) return;
  if (status === 204) {
    res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }
  const json = JSON.stringify(body);
  if (Buffer.byteLength(json) > 512 * 1024) {
    writeJson(res, 500, { ok: false, error: 'Response exceeds the configured size limit', code: 'RESPONSE_TOO_LARGE' }, origin);
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(json);
}

function readJsonBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        if (!rejected) {
          rejected = true;
          const error = new Error(`request body exceeds ${maxBodyBytes} bytes`);
          error.status = 413;
          error.code = 'REQUEST_TOO_LARGE';
          reject(error);
        }
        return;
      }
      if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw || '{}'));
      } catch {
        const error = new Error('request body must be valid JSON');
        error.status = 400;
        error.code = 'INVALID_JSON';
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/** HTTP transport seam. Route callbacks are injectable so contract tests never touch services or port 8101. */
export function createTopologySearchHttpServer({
  handlers,
  allowedOrigin = 'http://localhost:5173',
  maxBodyBytes = 64 * 1024,
}) {
  for (const name of Object.values(ROUTES)) {
    if (typeof handlers?.[name] !== 'function') throw new TypeError(`handler ${name} is required`);
  }

  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      writeJson(res, 204, null, allowedOrigin);
      return;
    }

    const path = req.url?.split('?')[0] ?? '/';
    const routeName = ROUTES[`${req.method} ${path}`];
    if (!routeName) {
      const status = Object.keys(ROUTES).some((route) => route.endsWith(` ${path}`)) ? 405 : 404;
      writeJson(res, status, { ok: false, error: status === 405 ? 'Method not allowed' : 'Not found', code: status === 405 ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND' }, allowedOrigin);
      return;
    }

    try {
      const body = req.method === 'POST' ? await readJsonBody(req, maxBodyBytes) : undefined;
      const result = await handlers[routeName]({ request: req, body });
      if (res.writableEnded) return;
      const response = result && typeof result === 'object' && 'body' in result
        ? result
        : { status: 200, body: result ?? {} };
      writeJson(res, response.status ?? 200, response.body, allowedOrigin);
    } catch (error) {
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      const dependencyFailure = typeof error?.code === 'string' && /^(TOPOLOGY|COSINE|QDRANT|EMBEDDING|ECONN|ETIMEDOUT)/.test(error.code);
      const status = Number.isInteger(error?.status) ? error.status : timeout ? 504 : dependencyFailure ? 503 : 500;
      const code = error?.code ?? (timeout ? 'DEPENDENCY_TIMEOUT' : status === 503 ? 'DEPENDENCY_UNAVAILABLE' : status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED');
      const message = status === 500 ? 'Internal error' : status === 504 ? 'Dependency timed out' : status === 503 ? 'Dependency unavailable' : error.message;
      writeJson(res, status, { ok: false, error: message, code }, allowedOrigin);
    }
  });
}

// Minimal HTTP server to act as a router inference microservice for development
import { createServer } from 'http';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4001;

async function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function makeDecision(features = {}) {
  // Simple deterministic heuristic for demo. Prioritize GPU when tokenCount > 2000
  const tokenCount = Number(features.tokenCount || 0);
  const urgent = features.urgent === true || features.priority === 'high';

  const decision = {
    useGPU: tokenCount > 2000 || urgent,
    useQUIC: tokenCount > 4000, // large tensors -> prefer QUIC
    useCache: !!features.cacheHit, // if caller indicates cache available
    score: 0.75 + Math.min(0.25, (tokenCount || 0) / 10000),
    reason: 'heuristic-stub',
  };
  return decision;
}

const server = createServer(async (req, res) => {
  // Log incoming request for debugging
  try {
    // eslint-disable-next-line no-console
    console.log(
      `[stub] incoming ${req.method} ${req.url} from ${req.socket.remoteAddress}:${req.socket.remotePort}`
    );
  } catch (e) {
    /* ignore */
  }
  if (req.method === 'POST' && req.url === '/predict') {
    try {
      const body = await parseJSONBody(req);
      // eslint-disable-next-line no-console
      console.log('[stub] received body keys:', Object.keys(body));
      const features = body.features || body || {};
      const decision = makeDecision(features);
      // eslint-disable-next-line no-console
      console.log('[stub] decision:', decision);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, decision }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Router inference stub listening on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

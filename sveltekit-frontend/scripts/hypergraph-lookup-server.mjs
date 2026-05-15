#!/usr/bin/env node
import http from 'http';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let Redis;
try { Redis = require('ioredis'); } catch (e) { Redis = null; }

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const PREFIX = process.env.HG_PREFIX || 'hypergraph:v1';
const PORT = Number(process.env.PORT || 9234);

function parseUrl(req) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  return { pathname: u.pathname, searchParams: u.searchParams };
}

function readBody(req) {
  return new Promise((res, rej) => {
    let buf = '';
    req.on('data', d => buf += d.toString());
    req.on('end', () => { try { res(buf ? JSON.parse(buf) : null); } catch (e) { rej(e); } });
    req.on('error', rej);
  });
}

function l2sq(a,b){ let s=0; for(let i=0;i<a.length;i++){ const d=(a[i]||0)-(b[i]||0); s+=d*d; } return s; }

async function handler(req, res) {
  const { pathname, searchParams } = parseUrl(req);
  if (pathname === '/health') { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({ ok: true })); return; }
  if (!Redis) { res.writeHead(500); res.end('ioredis not installed'); return; }
  const client = new Redis(REDIS_URL);
  try {
    if (pathname.startsWith('/lookup/')) {
      const parts = pathname.split('/').filter(Boolean);
      const centroidId = parts[1];
      const k = Number(searchParams.get('k') || 8);
      if (!centroidId) { res.writeHead(400); res.end('missing centroid id'); return; }
      const neighborsRaw = await client.hget(PREFIX + ':neighbors', String(centroidId));
      if (!neighborsRaw) { res.writeHead(404); res.end('centroid not found'); return; }
      const neighbors = JSON.parse(neighborsRaw);
      // fetch vectors for neighbors (limited by k)
      const out = [];
      for (let i = 0; i < Math.min(k, neighbors.length); i++) {
        const nid = neighbors[i].id;
        const centRaw = await client.hget(PREFIX + ':centroids', String(nid));
        const centObj = centRaw ? JSON.parse(centRaw) : null;
        out.push({ id: nid, dist: neighbors[i].dist, vector: centObj ? centObj.vector : null });
      }
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ centroid: centroidId, neighbors: out }));
      await client.disconnect();
      return;
    }

    if (pathname === '/lookup' && req.method === 'POST') {
      const body = await readBody(req);
      const vec = body && body.embedding;
      const k = body && (body.k || 8);
      if (!vec || !Array.isArray(vec)) { res.writeHead(400); res.end('missing embedding'); return; }

      // Greedy Topology Search if neighbors are available, else brute force
      const neighborsKey = PREFIX + ':neighbors';
      const centroidsKey = PREFIX + ':centroids';
      
      const metaRaw = await client.hget(centroidsKey, 'meta');
      const meta = metaRaw ? JSON.parse(metaRaw) : { K: 0 };
      
      let bestId = 0;
      let bestDist = Infinity;

      if (meta.K > 0) {
        // Start from a few random entry points or just centroid 0
        const entryPoints = [0, Math.floor(meta.K / 2), meta.K - 1];
        for (const startId of entryPoints) {
          let currId = startId;
          let currRaw = await client.hget(centroidsKey, String(currId));
          if (!currRaw) continue;
          let currDist = l2sq(vec, JSON.parse(currRaw).vector);
          
          if (currDist < bestDist) { bestDist = currDist; bestId = currId; }

          // Greedy walk
          let improved = true;
          while (improved) {
            improved = false;
            const neighborsRaw = await client.hget(neighborsKey, String(currId));
            if (!neighborsRaw) break;
            const neighbors = JSON.parse(neighborsRaw);
            
            for (const nb of neighbors) {
              const nbRaw = await client.hget(centroidsKey, String(nb.id));
              if (!nbRaw) continue;
              const d = l2sq(vec, JSON.parse(nbRaw).vector);
              if (d < currDist) {
                currDist = d;
                currId = nb.id;
                improved = true;
                if (d < bestDist) { bestDist = d; bestId = currId; }
              }
            }
          }
        }
      }

      // After finding the best entry via greedy walk, we could also return its neighbors
      const finalNeighborsRaw = await client.hget(neighborsKey, String(bestId));
      const finalNeighbors = finalNeighborsRaw ? JSON.parse(finalNeighborsRaw) : [];
      
      const results = [{ id: bestId, dist: bestDist }];
      // Add a few neighbors of the best centroid to the results for exploration
      for (const nb of finalNeighbors.slice(0, k - 1)) {
        const nbRaw = await client.hget(centroidsKey, String(nb.id));
        if (!nbRaw) continue;
        results.push({ id: nb.id, dist: l2sq(vec, JSON.parse(nbRaw).vector) });
      }
      results.sort((a,b) => a.dist - b.dist);

      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ k: results.length, results, method: 'greedy-topology' }));
      await client.disconnect();
      return;
    }

    res.writeHead(404); res.end('not found');
  } catch (e) {
    try { await client.disconnect(); } catch (_) {}
    res.writeHead(500); res.end(String(e.message || e));
  }
}

const server = http.createServer(handler);
server.listen(PORT, () => console.log(`Hypergraph lookup server listening on http://127.0.0.1:${PORT}`));

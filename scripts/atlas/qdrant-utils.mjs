import fs from 'fs'

export function loadCentroids(path) {
  const raw = fs.readFileSync(path, 'utf-8')
  return JSON.parse(raw)
}

export function validateDim(centroids, dim) {
  if (!centroids || !centroids.centroids) return false
  const first = centroids.centroids[0]
  return Array.isArray(first) && first.length === dim
}

export function buildPointsFromCentroids(centroids, collectionName) {
  const points = []
  const cs = centroids.centroids || []
  const sizes = centroids.sizes || {}
  for (let i = 0; i < cs.length; i++) {
    points.push({
      id: `${collectionName}-cluster-${i}`,
      vector: cs[i],
      payload: {
        cluster: i,
        size: sizes[i] || 0,
        meta: { source: 'atlas-cluster' }
      }
    })
  }
  return points
}
import fetch from 'node-fetch';

const DEFAULT_QDRANT = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

export function validateVectorDim(vec, expected=768) {
  if (!Array.isArray(vec)) return false;
  return vec.length === expected;
}

export async function upsertPoints(collectionName, points, { qdrantUrl } = {}) {
  qdrantUrl = qdrantUrl || DEFAULT_QDRANT;
  const url = `${qdrantUrl.replace(/\/$/, '')}/collections/${collectionName}/points?wait=true`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) throw new Error(`Qdrant upsert failed: ${res.status}`);
  return res.json();
}

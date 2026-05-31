#!/usr/bin/env node
// Minimal Qdrant HTTP helper used by docker-build scripts.
export function getQdrantUrl() {
  return process.env.QDRANT_URL || 'http://localhost:6333';
}

export function getQdrantApiKey() {
  return process.env.QDRANT_API_KEY || process.env.VITE_QDRANT_API_KEY || null;
}

// qdrantScroll: by default returns an array of points (modern helper). If
// options.legacyPagination is true, return an object { points, next_page_offset }
// to emulate older scripts that expect that shape.
export async function qdrantScroll(collection, body = { limit: 25, with_payload: true }, options = {}) {
  const QDRANT_URL = getQdrantUrl();
  const API_KEY = getQdrantApiKey();
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, API_KEY ? { 'x-api-key': API_KEY } : {}),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn('[qdrant-client] scroll non-OK', res.status, res.statusText);
      return options.legacyPagination ? { points: [], next_page_offset: null } : [];
    }
    const json = await res.json();
    const points = Array.isArray(json.result?.points) ? json.result.points : [];
    if (options.legacyPagination) return { points, next_page_offset: null };
    return points;
  } catch (err) {
    console.warn('[qdrant-client] scroll failed', err?.message ?? err);
    return options.legacyPagination ? { points: [], next_page_offset: null } : [];
  }
}

export async function qdrantUpdatePayload(collection, body = {}) {
  const QDRANT_URL = getQdrantUrl();
  const API_KEY = getQdrantApiKey();
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/payload`, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, API_KEY ? { 'x-api-key': API_KEY } : {}),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn('[qdrant-client] update payload non-OK', res.status, res.statusText);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[qdrant-client] update payload failed', err?.message ?? err);
    return false;
  }
}

export async function qdrantEnsureCollection(collection, vectorSize = 768) {
  const QDRANT_URL = getQdrantUrl();
  const API_KEY = getQdrantApiKey();
  try {
    const check = await fetch(`${QDRANT_URL}/collections/${collection}`, { signal: AbortSignal.timeout(5000) });
    if (check.ok) return true;
  } catch (e) {
    // proceed to create
  }

  try {
    const res = await fetch(`${QDRANT_URL}/collections/${collection}`, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, API_KEY ? { 'x-api-key': API_KEY } : {}),
      body: JSON.stringify({ vectors: { size: vectorSize, distance: 'Cosine' } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn('[qdrant-client] ensureCollection non-OK', res.status, res.statusText);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[qdrant-client] ensureCollection failed', err?.message ?? err);
    return false;
  }
}

export async function qdrantUpsertPoints(collection, points, wait = true) {
  const QDRANT_URL = getQdrantUrl();
  const API_KEY = getQdrantApiKey();
  try {
    const url = `${QDRANT_URL}/collections/${collection}/points${wait ? '?wait=true' : ''}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, API_KEY ? { 'x-api-key': API_KEY } : {}),
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[qdrant-client] upsert non-OK', res.status, res.statusText, body.slice(0,200));
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[qdrant-client] upsert failed', err?.message ?? err);
    return false;
  }
}

export async function qdrantUpdatePayloadByFilter(collection, payload, filter = {}, wait = true) {
  const QDRANT_URL = getQdrantUrl();
  const API_KEY = getQdrantApiKey();
  try {
    const url = `${QDRANT_URL}/collections/${collection}/points/payload${wait ? '?wait=true' : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, API_KEY ? { 'x-api-key': API_KEY } : {}),
      body: JSON.stringify({ payload, filter }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[qdrant-client] updateByFilter non-OK', res.status, res.statusText, body.slice(0,200));
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[qdrant-client] updateByFilter failed', err?.message ?? err);
    return false;
  }
}

export async function qdrantSearch(collection, body = {}) {
  const QDRANT_URL = getQdrantUrl();
  const API_KEY = getQdrantApiKey();
  try {
    const url = `${QDRANT_URL}/collections/${collection}/points/search`;
    const res = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, API_KEY ? { 'x-api-key': API_KEY } : {}),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const b = await res.text().catch(() => '');
      console.warn('[qdrant-client] search non-OK', res.status, res.statusText, b.slice(0,200));
      return null;
    }
    const json = await res.json();
    return Array.isArray(json.result?.data) ? json.result.data : Array.isArray(json.result?.points) ? json.result.points : json.result ?? [];
  } catch (err) {
    console.warn('[qdrant-client] search failed', err?.message ?? err);
    return null;
  }
}

export async function qdrantGetPoints(collection, ids = []) {
  const QDRANT_URL = getQdrantUrl();
  const API_KEY = getQdrantApiKey();
  try {
    const url = `${QDRANT_URL}/collections/${collection}/points`;
    const res = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, API_KEY ? { 'x-api-key': API_KEY } : {}),
      body: JSON.stringify({ ids, with_vectors: ['content'], with_payload: false }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const b = await res.text().catch(() => '');
      console.warn('[qdrant-client] getPoints non-OK', res.status, res.statusText, b.slice(0,200));
      return null;
    }
    const json = await res.json();
    return Array.isArray(json.result?.data) ? json.result.data : json.result ?? [];
  } catch (err) {
    console.warn('[qdrant-client] getPoints failed', err?.message ?? err);
    return null;
  }
}

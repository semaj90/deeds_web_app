export function qdrantBaseUrl() {
  return (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
}

async function qdrantJson(path, body) {
  const response = await fetch(`${qdrantBaseUrl()}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Qdrant ${path} failed (${response.status})`);
  }
  return response.json();
}

export async function getCollectionInfo(collection) {
  return qdrantJson(`/collections/${collection}`);
}

export async function scrollAllPoints(collection, options = {}) {
  const points = [];
  let offset = options.offset ?? null;
  while (true) {
    const body = {
      limit: options.limit ?? 1000,
      with_payload: options.withPayload ?? true,
      with_vector: options.withVector ?? false,
    };
    if (offset !== null) body.offset = offset;
    const result = await qdrantJson(`/collections/${collection}/points/scroll`, body);
    const pagePoints = result?.result?.points ?? [];
    points.push(...pagePoints);
    offset = result?.result?.next_page_offset ?? null;
    if (offset === null) break;
  }
  return points;
}

export async function fetchPointsByIds(collection, ids, options = {}) {
  return qdrantJson(`/collections/${collection}/points`, {
    ids,
    with_payload: options.withPayload ?? true,
    with_vector: options.withVector ?? true,
  });
}

export async function queryCollection(collection, body) {
  return qdrantJson(`/collections/${collection}/points/query`, body);
}

export async function createCollection(collection, body) {
  const response = await fetch(`${qdrantBaseUrl()}/collections/${collection}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 409) {
      return getCollectionInfo(collection);
    }
    throw new Error(`Qdrant create collection ${collection} failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

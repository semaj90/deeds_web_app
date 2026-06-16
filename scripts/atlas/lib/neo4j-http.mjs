function buildNeo4jHttpUrl({
  neo4jHttpUrl = process.env.NEO4J_HTTP_URL ?? null,
  neo4jUri = process.env.NEO4J_URI ?? process.env.NEO4J_URL ?? 'bolt://localhost:7687',
} = {}) {
  if (neo4jHttpUrl) return neo4jHttpUrl;
  if (!neo4jUri) return null;
  try {
    const parsed = new URL(String(neo4jUri).replace(/^bolt(\+s)?:\/\//i, 'http://'));
    if (!parsed.port || parsed.port === '7687') parsed.port = '7474';
    if (!parsed.pathname || parsed.pathname === '/') parsed.pathname = '/db/neo4j/tx/commit';
    if (!parsed.pathname.endsWith('/tx/commit')) parsed.pathname = '/db/neo4j/tx/commit';
    return parsed.toString();
  } catch {
    return null;
  }
}

async function queryNeo4jHttp({
  neo4jHttpUrl = null,
  neo4jUri = null,
  username = process.env.NEO4J_USER ?? 'neo4j',
  password = process.env.NEO4J_PASSWORD ?? 'neo4j123',
  statement,
  parameters = {},
} = {}) {
  const httpUrl = buildNeo4jHttpUrl({ neo4jHttpUrl, neo4jUri });
  if (!httpUrl) {
    return { ok: false, error: 'missing_neo4j_http_url' };
  }

  const auth = Buffer.from(`${username ?? ''}:${password ?? ''}`).toString('base64');
  const response = await fetch(httpUrl, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      statements: [
        {
          statement,
          parameters,
        },
      ],
    }),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.errors?.[0]?.message ?? text ?? `HTTP ${response.status}`,
      status: response.status,
      httpUrl,
    };
  }

  const errors = payload?.errors ?? [];
  if (errors.length > 0) {
    return { ok: false, error: errors[0]?.message ?? 'neo4j_http_error', httpUrl };
  }

  const result = payload?.results?.[0] ?? {};
  const columns = Array.isArray(result.columns) ? result.columns : [];
  const rows = Array.isArray(result.data)
    ? result.data.map((entry) => {
        const row = {};
        const values = Array.isArray(entry?.row) ? entry.row : [];
        columns.forEach((column, index) => {
          row[column] = values[index];
        });
        return row;
      })
    : [];

  return {
    ok: true,
    httpUrl,
    columns,
    rows,
    stats: result.stats ?? {},
  };
}

async function countNeo4jRelationship({
  neo4jHttpUrl = null,
  neo4jUri = null,
  username = process.env.NEO4J_USER ?? 'neo4j',
  password = process.env.NEO4J_PASSWORD ?? 'neo4j123',
  relationshipType,
} = {}) {
  const result = await queryNeo4jHttp({
    neo4jHttpUrl,
    neo4jUri,
    username,
    password,
    statement: `MATCH ()-[r:${relationshipType}]->() RETURN count(r) AS count`,
  });
  if (!result.ok) return result;
  const count = Number(result.rows?.[0]?.count ?? 0);
  return { ...result, count };
}

export {
  buildNeo4jHttpUrl,
  countNeo4jRelationship,
  queryNeo4jHttp,
};

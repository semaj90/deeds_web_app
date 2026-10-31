const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function assertDisposableGraphSmokeDatabaseUrl(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('ATLAS_GRAPH_SNAPSHOT_SMOKE_DATABASE_URL is required.');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Graph snapshot smoke database URL is invalid.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Graph snapshot smoke requires a PostgreSQL URL.');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('Graph snapshot smoke database must be on loopback.');
  }
  if (!/(?:^|[_-])(test|scratch|disposable)(?:$|[_-])/i.test(databaseName)) {
    throw new Error('Graph snapshot smoke database name must identify a test, scratch, or disposable database.');
  }

  return parsed.toString();
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const FIXTURE_PORTS = new Set(['55440', '55441']);

export function parseG7DisposableTargetV1(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('G7_DISPOSABLE_DATABASE_URL_REQUIRED');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('G7_DISPOSABLE_DATABASE_URL_INVALID');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('G7_DISPOSABLE_DATABASE_PROTOCOL_INVALID');
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) throw new Error('G7_DISPOSABLE_DATABASE_HOST_NOT_LOOPBACK');
  if (!FIXTURE_PORTS.has(parsed.port)) throw new Error('G7_DISPOSABLE_DATABASE_PORT_NOT_APPROVED');
  if (!/^(atlas_scratch_|disposable_test_)[a-z0-9_-]+$/i.test(database)) {
    throw new Error('G7_DISPOSABLE_DATABASE_NAME_NOT_APPROVED');
  }

  return { url: parsed.toString(), host: parsed.hostname, port: parsed.port, database };
}

export function assertG7DisposableContainerV1(container, expectedPort, databaseUrl) {
  if (!container || !/^pgvector\/pgvector:pg18(?:\.\d+)?$/i.test(container.Config?.Image ?? '')) {
    throw new Error('G7_DISPOSABLE_CONTAINER_IMAGE_INVALID');
  }

  const labels = container.Config.Labels ?? {};
  if (labels['atlas.disposable'] !== 'true' || labels['atlas.fixture'] !== 'g7-registration') {
    throw new Error('G7_DISPOSABLE_CONTAINER_LABELS_INVALID');
  }

  const bindings = container.NetworkSettings?.Ports?.['5432/tcp'] ?? [];
  if (!bindings.some((binding) => binding.HostIp === '127.0.0.1' && binding.HostPort === expectedPort)) {
    throw new Error('G7_DISPOSABLE_CONTAINER_BINDING_INVALID');
  }

  const containerEnvironment = Object.fromEntries((container.Config.Env ?? []).map((entry) => {
    const separator = entry.indexOf('=');
    return separator < 0 ? [entry, ''] : [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
  const parsedUrl = new URL(databaseUrl);
  if (
    !containerEnvironment.POSTGRES_USER
    || !containerEnvironment.POSTGRES_PASSWORD
    || decodeURIComponent(parsedUrl.username) !== containerEnvironment.POSTGRES_USER
    || decodeURIComponent(parsedUrl.password) !== containerEnvironment.POSTGRES_PASSWORD
  ) {
    throw new Error('G7_DISPOSABLE_CREDENTIALS_DO_NOT_MATCH_CONTAINER');
  }

  return true;
}

const POSTGRES_UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireCanonicalWorkspaceIdV1(value) {
  if (typeof value !== 'string' || !POSTGRES_UUID_V1.test(value)) {
    throw new Error('WORKSPACE_ID_NOT_CANONICAL_UUID');
  }
  return value;
}

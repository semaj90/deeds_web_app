export interface ObjectStorageKeyCarrier {
  objectStorageKey?: string | null;
  minioKey?: string | null;
  object_storage_key?: string | null;
  minio_key?: string | null;
}

function normalizeKey(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveObjectStorageKey(value: ObjectStorageKeyCarrier): string | null {
  return (
    normalizeKey(value.objectStorageKey) ??
    normalizeKey(value.object_storage_key) ??
    normalizeKey(value.minioKey) ??
    normalizeKey(value.minio_key) ??
    null
  );
}

export function hasObjectStorageKeyConflict(value: ObjectStorageKeyCarrier): boolean {
  const objectStorageKey = normalizeKey(value.objectStorageKey) ?? normalizeKey(value.object_storage_key);
  const legacyMinioKey = normalizeKey(value.minioKey) ?? normalizeKey(value.minio_key);
  return Boolean(objectStorageKey && legacyMinioKey && objectStorageKey !== legacyMinioKey);
}

export function buildObjectStorageCompatibilityFields(
  key: string | null,
  options?: { writeLegacyMinioKey?: boolean }
): { objectStorageKey: string | null; minioKey: string | null } {
  const normalizedKey = normalizeKey(key);
  const writeLegacyMinioKey = options?.writeLegacyMinioKey ?? true;

  return {
    objectStorageKey: normalizedKey,
    minioKey: writeLegacyMinioKey ? normalizedKey : null,
  };
}

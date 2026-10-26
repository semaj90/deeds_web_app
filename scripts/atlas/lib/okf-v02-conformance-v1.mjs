const ATLAS_PROFILE_FIELDS = ['provenance', 'trust', 'lifecycle'];

export function validateOkfConceptV02(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { valid: false, missing: ['type'] };
  }

  const type = document.type;
  const valid = typeof type === 'string' && type.trim().length > 0;
  return { valid, missing: valid ? [] : ['type'] };
}

export function validateAtlasOkfProfileV1(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { valid: false, missing: [...ATLAS_PROFILE_FIELDS] };
  }

  const missing = ATLAS_PROFILE_FIELDS.filter((field) => {
    const value = document[field];
    return value === undefined || value === null || value === '';
  });
  return { valid: missing.length === 0, missing };
}

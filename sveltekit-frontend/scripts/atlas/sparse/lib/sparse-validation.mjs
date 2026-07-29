export function validateSparseVector(vector) {
  const indices = Array.isArray(vector?.indices) ? vector.indices : [];
  const values = Array.isArray(vector?.values) ? vector.values : [];
  if (indices.length !== values.length) {
    return { ok: false, reason: 'indices_values_length_mismatch' };
  }
  for (let i = 0; i < indices.length; i++) {
    if (!Number.isInteger(indices[i]) || indices[i] < 0) {
      return { ok: false, reason: 'invalid_index' };
    }
    if (!Number.isFinite(values[i])) {
      return { ok: false, reason: 'invalid_value' };
    }
    if (i > 0 && indices[i] <= indices[i - 1]) {
      return { ok: false, reason: 'indices_must_be_strictly_ascending' };
    }
  }
  return { ok: true, reason: 'ok' };
}

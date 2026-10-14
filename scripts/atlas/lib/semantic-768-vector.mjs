export const SEMANTIC_768_DIMENSION = 768;

export function requireSemantic768Vector(vector) {
  if (!Array.isArray(vector) || vector.length !== SEMANTIC_768_DIMENSION) {
    throw new TypeError(`Expected semantic_768 vector with ${SEMANTIC_768_DIMENSION} values`);
  }
  if (!vector.every((value) => Number.isFinite(value))) {
    throw new TypeError('semantic_768 vector values must be finite numbers');
  }
  return vector;
}

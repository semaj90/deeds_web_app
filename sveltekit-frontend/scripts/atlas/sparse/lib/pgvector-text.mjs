export function parseHalfvecText(text, expectedDimension = null) {
  if (text === null || text === undefined) {
    throw new Error('halfvec text is required');
  }

  const body = String(text).trim();
  if (!body.startsWith('[') || !body.endsWith(']')) {
    throw new Error(`invalid halfvec format: ${body.slice(0, 80)}`);
  }

  const values = body
    .slice(1, -1)
    .split(',')
    .map((part) => Number(part.trim()));

  if (expectedDimension !== null && values.length !== expectedDimension) {
    throw new Error(`expected ${expectedDimension} dimensions, received ${values.length}`);
  }

  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      throw new Error(`non-finite value at index ${i}`);
    }
  }

  return values;
}

export function validateDenseVector(values, expectedDimension = 768) {
  if (!Array.isArray(values)) {
    throw new Error('dense vector must be an array');
  }
  if (values.length !== expectedDimension) {
    throw new Error(`expected dense vector dimension ${expectedDimension}, received ${values.length}`);
  }
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      throw new Error(`dense vector contains non-finite value at index ${i}`);
    }
  }
  return values;
}

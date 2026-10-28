export class DuplicateJsonObjectKeyErrorV1 extends Error {
  constructor(readonly key: string) {
    super(`Duplicate object key: ${key}`);
    this.name = 'DuplicateJsonObjectKeyErrorV1';
  }
}

export function assertJsonObjectKeysUniqueV1(json: string, maxDepth = 128): void {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) throw new RangeError('INVALID_JSON_DEPTH_LIMIT');
  let offset = 0;
  const whitespace = () => {
    while (json[offset] === ' ' || json[offset] === '\t' || json[offset] === '\r' || json[offset] === '\n') offset += 1;
  };
  const parseString = (): string => {
    const start = offset++;
    while (offset < json.length) {
      if (json[offset] === '\\') offset += 2;
      else if (json[offset++] === '"') return JSON.parse(json.slice(start, offset)) as string;
    }
    throw new SyntaxError('Unterminated JSON string');
  };
  const parseValue = (depth: number): void => {
    whitespace();
    if (depth > maxDepth) throw new RangeError('JSON_NESTING_DEPTH_LIMIT_EXCEEDED');
    if (json[offset] === '{') {
      offset += 1;
      whitespace();
      const keys = new Set<string>();
      if (json[offset] === '}') { offset += 1; return; }
      while (offset < json.length) {
        whitespace();
        if (json[offset] !== '"') throw new SyntaxError('Expected object key');
        const key = parseString();
        if (keys.has(key)) throw new DuplicateJsonObjectKeyErrorV1(key);
        keys.add(key);
        whitespace();
        if (json[offset++] !== ':') throw new SyntaxError('Expected colon after object key');
        parseValue(depth + 1);
        whitespace();
        if (json[offset] === '}') { offset += 1; return; }
        if (json[offset++] !== ',') throw new SyntaxError('Expected comma between object members');
      }
      throw new SyntaxError('Unterminated JSON object');
    }
    if (json[offset] === '[') {
      offset += 1;
      whitespace();
      if (json[offset] === ']') { offset += 1; return; }
      while (offset < json.length) {
        parseValue(depth + 1);
        whitespace();
        if (json[offset] === ']') { offset += 1; return; }
        if (json[offset++] !== ',') throw new SyntaxError('Expected comma between array items');
      }
      throw new SyntaxError('Unterminated JSON array');
    }
    if (json[offset] === '"') { parseString(); return; }
    const start = offset;
    while (offset < json.length && !/[\s,}\]]/.test(json[offset]!)) offset += 1;
    if (offset === start) throw new SyntaxError('Expected JSON value');
  };

  parseValue(0);
  whitespace();
  if (offset !== json.length) throw new SyntaxError('Unexpected trailing JSON input');
}

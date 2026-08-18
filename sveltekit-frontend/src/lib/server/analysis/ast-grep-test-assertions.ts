import type { SgNode } from '@ast-grep/napi';

export type StaticAssertionObservationInput = {
  stable_test_id: string;
  source_ref: string;
  source_revision: string;
  test_byte_start: number;
  test_byte_end: number;
  extractor_revision: string;
};

export type StaticAssertionObservation = {
  schema: 'atlas.static-assertion-observation.v1';
  stable_test_id: string;
  source_ref: string;
  source_revision: string;
  assertion_kind: 'expect' | 'assert' | 'custom_assertion';
  expression_text: string;
  byte_start: number;
  byte_end: number;
  line: number;
  column: number;
  extractor_revision: string;
  canonical_authority: false;
};

function classifyAssertion(text: string): StaticAssertionObservation['assertion_kind'] | null {
  const compact = text.trim();
  if (/^expect\s*\(/.test(compact)) return 'expect';
  if (/^(?:assert\s*\(|assert\.)/.test(compact)) return 'assert';
  if (/^(?:expectTypeOf|assertType|assertTypeOf)\s*\(/.test(compact)) return 'custom_assertion';
  return null;
}

function range(node: SgNode) {
  const value = node.range();
  return {
    byte_start: value.start.index,
    byte_end: value.end.index,
    line: value.start.line + 1,
    column: value.start.column + 1,
  };
}

/**
 * Extract static assertion calls contained inside one already-resolved test
 * declaration span. Dynamic loop-generated assertions remain runtime evidence;
 * this function only observes explicit source call expressions.
 */
export async function extractStaticTestAssertions(
  code: string,
  input: StaticAssertionObservationInput,
): Promise<StaticAssertionObservation[]> {
  const { parse } = await import('@ast-grep/napi');
  let root: ReturnType<typeof parse>;
  try {
    root = parse('TypeScript', code);
  } catch {
    try { root = parse('Tsx', code); } catch { return []; }
  }

  const observations: StaticAssertionObservation[] = [];
  for (const node of root.root().findAll({ rule: { kind: 'call_expression' } })) {
    const position = range(node);
    if (position.byte_start < input.test_byte_start || position.byte_end > input.test_byte_end) continue;
    const assertionKind = classifyAssertion(node.text());
    if (!assertionKind) continue;
    observations.push({
      schema: 'atlas.static-assertion-observation.v1',
      stable_test_id: input.stable_test_id,
      source_ref: input.source_ref,
      source_revision: input.source_revision,
      assertion_kind: assertionKind,
      expression_text: node.text(),
      ...position,
      extractor_revision: input.extractor_revision,
      canonical_authority: false,
    });
  }
  return observations.sort((a,b) => a.byte_start - b.byte_start || a.byte_end - b.byte_end);
}

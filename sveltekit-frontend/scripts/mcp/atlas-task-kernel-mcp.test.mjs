import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The facade starts its child process on import, so the TOOLS and IMPLEMENTATIONS literals are evaluated
// from the source text. This is a regression test of the KERNEL-REAL-01C forwarding matrix.
const source = fs.readFileSync(new URL('./atlas-task-kernel-mcp.mjs', import.meta.url), 'utf8');
const literal = (name, closer) => {
  const start = source.indexOf(`const ${name} =`);
  const end = source.indexOf(closer, start);
  return new Function(`return ${source.slice(start, end + closer.length).replace(`const ${name} =`, '')}`)();
};
const TOOLS = literal('TOOLS', '\n];');
const IMPLEMENTATIONS = literal('IMPLEMENTATIONS', '\n};');

// Declared properties that are intentionally NOT forwarded to the internal tool. Each needs a reason.
const NOT_FORWARDED = { 'atlas_research.maxRounds': 'echoed in the research envelope with maxRoundsApplied:false; one round runs' };

test('every kernel tool has an implementation and every implementation has a declared tool', () => {
  assert.deepEqual(TOOLS.map((t) => t.name).sort(), Object.keys(IMPLEMENTATIONS).sort());
});

test('every declared property is forwarded to the internal tool unless explicitly allowlisted', () => {
  for (const tool of TOOLS) {
    const [, mapper] = IMPLEMENTATIONS[tool.name];
    const declared = Object.keys(tool.inputSchema.properties ?? {});
    const sentinel = Object.fromEntries(declared.map((p) => [p, `SENTINEL_${p}`]));
    const mapped = JSON.stringify(mapper(sentinel));
    for (const property of declared) {
      const forwarded = mapped.includes(`SENTINEL_${property}`);
      const allowed = Object.hasOwn(NOT_FORWARDED, `${tool.name}.${property}`);
      assert.ok(forwarded || allowed, `${tool.name}.${property} is declared but silently dropped`);
      if (allowed) assert.equal(forwarded, false, `${tool.name}.${property} is allowlisted but is actually forwarded; remove it from the allowlist`);
    }
  }
});

test('descriptions do not claim retrieval or a research circuit the tools do not perform', () => {
  const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t.description]));
  assert.match(byName.atlas_context, /unadmitted/i);
  assert.match(byName.atlas_context, /querySpecific:false/);
  assert.match(byName.atlas_research, /maxRounds is not applied/i);
  assert.doesNotMatch(byName.atlas_research, /bounded, read-only research circuit/i);
});

test('the research envelope never presents maxRounds as applied', () => {
  assert.match(source, /maxRoundsApplied:\s*false/);
  assert.match(source, /roundsExecuted:\s*1/);
});

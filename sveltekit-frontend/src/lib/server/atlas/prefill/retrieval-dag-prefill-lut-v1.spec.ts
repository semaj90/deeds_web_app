import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  RetrievalDagPrefillLutV1Schema,
  orderLutEntriesByDagTopology,
  readVectorSliceFromF32Bin,
  synthesizeRetrievalDagPrefillPlanV1,
} from './retrieval-dag-prefill-lut-v1.js';

const ROOT = process.cwd().endsWith('sveltekit-frontend')
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

const LUT_PATH = path.join(
  ROOT,
  'sveltekit-frontend/data/atlas-tensor-proof/retrieval_dag_prefill_lut_v1.json'
);
const F32BIN_PATH = path.join(
  ROOT,
  'sveltekit-frontend/data/atlas-tensor-proof/retrieval_dag_prefill_768.f32bin'
);

describe('RetrievalDagPrefillLutV1 — NES .f32bin OS Slice & Topological DAG Prefill Synthesis', () => {
  it('validates the compiled 50-entry LUT schema and contiguous 3,072-byte offsets', () => {
    const raw = JSON.parse(fs.readFileSync(LUT_PATH, 'utf8'));
    const lut = RetrievalDagPrefillLutV1Schema.parse(raw);
    expect(lut.entries).toHaveLength(50);
    expect(lut.f32BinTotalBytes).toBe(50 * 3072);
    expect(lut.entries[42]!.byteOffset).toBe(42 * 3072);
  });

  it('streams exact 768-D float32 slices via OS openSync/readSync and verifies SHA-256', () => {
    const lut = RetrievalDagPrefillLutV1Schema.parse(
      JSON.parse(fs.readFileSync(LUT_PATH, 'utf8'))
    );
    const vec42 = readVectorSliceFromF32Bin(F32BIN_PATH, lut.entries[42]!);
    expect(vec42).toBeInstanceOf(Float32Array);
    expect(vec42.length).toBe(768);
    // Unit-normalized check
    let normSq = 0;
    for (let i = 0; i < 768; i++) normSq += vec42[i]! * vec42[i]!;
    expect(Math.sqrt(normSq)).toBeCloseTo(1.0, 5);
  });

  it('orders selected LUT entries topologically (dependencies before dependents) for PromptPlanV1 prefill', () => {
    const lut = RetrievalDagPrefillLutV1Schema.parse(
      JSON.parse(fs.readFileSync(LUT_PATH, 'utf8'))
    );
    // Submit [0 (UI), 10 (API), 20 (RETRIEVAL), 30 (DB_SCHEMA)] in reverse dependency order
    const unordered = [lut.entries[0]!, lut.entries[10]!, lut.entries[20]!, lut.entries[30]!];
    const { ordered, cyclesBroken } = orderLutEntriesByDagTopology(unordered);
    expect(cyclesBroken).toBe(0);
    expect(ordered.map((e) => e.ordinal)).toEqual([30, 20, 10, 0]);
  });

  it('synthesizes PromptPlanV1 and ContextPrefixIdentityV1 with kvCachePersisted = false', () => {
    const lut = RetrievalDagPrefillLutV1Schema.parse(
      JSON.parse(fs.readFileSync(LUT_PATH, 'utf8'))
    );
    const plan = synthesizeRetrievalDagPrefillPlanV1({
      repoRoot: ROOT,
      lut,
      selectedOrdinals: [0, 10, 20, 30],
      requestId: 'req:test-dag-prefill-01',
      contextManifestChecksum: 'a'.repeat(64),
      userQuery: 'Explain the end-to-end retrieval and database schema flow.',
    });

    expect(plan.orderedOrdinals).toEqual([30, 20, 10, 0]);
    expect(plan.kvCachePersisted).toBe(false);
    expect(plan.promptPlan.segments).toHaveLength(8); // SYSTEM + INSTRUCTION + 4 EVIDENCE + TOOL_SCHEMA + USER_QUERY
    expect(plan.promptPlan.totalTokens).toBeLessThanOrEqual(plan.promptPlan.maxInputTokens);
    expect(plan.contextPrefixIdentity.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

#!/usr/bin/env node
/**
 * Smoke Test: Vector Lane Registry Contract Validation
 *
 * Validates that config/vector-lanes.json is valid and adheres to all schema constraints:
 * 1. JSON parses successfully
 * 2. Zod schema validates without error
 * 3. activeCanonicalLane is set to "atlas-retrieval-384-v1"
 * 4. Exactly 1 lane has status = "canonical"
 * 5. All cosine-distance lanes use L2 normalization
 * 6. No duplicate laneIds across registry
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

// ============================================================================
// Vector Lane Registry Schemas (copied from canonical source)
// ============================================================================

const VectorLaneStatusSchema = z.enum([
  'canonical',
  'native',
  'derived',
  'accelerator',
  'legacy',
  'experimental',
  'retired'
]);

const VectorLaneRoleSchema = z.enum([
  'retrieval',
  'fixer-memory',
  'reranking',
  'topology',
  'clustering',
  'som-training',
  'centroid-routing',
  'archive'
]);

const VectorDimensionSchema = z.union([
  z.literal(64),
  z.literal(128),
  z.literal(384),
  z.literal(768)
]);

const VectorLaneSchema = z
  .object({
    laneId: z.string().min(1),
    status: VectorLaneStatusSchema,
    role: VectorLaneRoleSchema,

    modelId: z.string().min(1),
    modelRevision: z.string().min(1),

    sourceDimensions: VectorDimensionSchema,
    outputDimensions: VectorDimensionSchema,

    projection: z.enum([
      'none',
      'direct-slice',
      'mrl',
      'autoencoder',
      'graph-projection'
    ]),

    normalization: z.enum([
      'none',
      'l2'
    ]),

    dtype: z.enum([
      'float32',
      'float16',
      'int8',
      'int4',
      'binary'
    ]),

    distance: z.enum([
      'cosine',
      'dot',
      'euclidean'
    ]),

    purpose: z.string().min(1),

    collection: z.string().min(1).nullable().optional(),
    artifactUri: z.string().min(1).nullable().optional(),

    quantization: z
      .object({
        method: z.enum([
          'scalar-int8',
          'scalar-int4',
          'binary',
          'product',
          'turboquant'
        ]),
        rescoring: z.boolean()
      })
      .strict()
      .nullable()
      .optional()
  })
  .strict()
  .superRefine((lane, ctx) => {
    if (
      lane.projection === 'none' &&
      lane.sourceDimensions !== lane.outputDimensions
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outputDimensions'],
        message:
          'A lane without projection must preserve dimensions'
      });
    }

    if (
      lane.projection === 'autoencoder' &&
      lane.outputDimensions >= lane.sourceDimensions
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outputDimensions'],
        message:
          'Autoencoder routing lane must reduce dimensions'
      });
    }

    if (
      lane.status === 'canonical' &&
      lane.role !== 'retrieval'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['role'],
        message:
          'Only the retrieval lane may be canonical'
      });
    }

    if (
      lane.distance === 'cosine' &&
      lane.normalization !== 'l2'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['normalization'],
        message:
          'Atlas cosine lanes must explicitly use L2 normalization'
      });
    }
  });

type VectorLane = z.infer<typeof VectorLaneSchema>;

const VectorLaneRegistrySchema = z
  .object({
    contractVersion: z.literal(
      'atlas.vector-lane-registry.v1'
    ),

    activeCanonicalLane: z.string().min(1),

    lanes: z
      .array(VectorLaneSchema)
      .min(1)
  })
  .strict()
  .superRefine((registry, ctx) => {
    const laneIds = new Set<string>();

    for (const [index, lane] of registry.lanes.entries()) {
      if (laneIds.has(lane.laneId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lanes', index, 'laneId'],
          message: `Duplicate lane ID: ${lane.laneId}`
        });
      }

      laneIds.add(lane.laneId);
    }

    const canonical = registry.lanes.filter(
      (lane) => lane.status === 'canonical'
    );

    if (canonical.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lanes'],
        message:
          'Exactly one canonical vector lane is required'
      });
    }

    if (
      canonical[0] &&
      canonical[0].laneId !==
        registry.activeCanonicalLane
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activeCanonicalLane'],
        message:
          'activeCanonicalLane must reference the canonical lane'
      });
    }
  });

type VectorLaneRegistry = z.infer<typeof VectorLaneRegistrySchema>;

// ============================================================================
// Test Harness
// ============================================================================

interface TestResult {
  gate: number;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test(gateNum: number, name: string, fn: () => void) {
  try {
    fn();
    results.push({ gate: gateNum, name, passed: true });
    console.log(`✅ Gate ${gateNum}: ${name}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ gate: gateNum, name, passed: false, error });
    console.log(`❌ Gate ${gateNum}: ${name}`);
    console.log(`   Error: ${error}`);
  }
}

// ============================================================================
// Load Registry File
// ============================================================================

const registryPath = resolve(
  process.cwd(),
  'config',
  'vector-lanes.json'
);

let registry: unknown;

try {
  const content = readFileSync(registryPath, 'utf-8');
  registry = JSON.parse(content);
} catch (err) {
  console.error(`❌ Failed to load registry: ${err}`);
  process.exit(1);
}

// ============================================================================
// Gate 1: JSON Parse Success
// ============================================================================

test(1, 'JSON parses successfully', () => {
  if (registry === undefined || registry === null) {
    throw new Error('Registry is null or undefined after parsing');
  }
});

// ============================================================================
// Gate 2: Zod Schema Validates
// ============================================================================

let validatedRegistry: VectorLaneRegistry;

test(2, 'Zod schema validates all lanes', () => {
  const result = VectorLaneRegistrySchema.safeParse(registry);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Schema validation failed: ${errors}`);
  }
  validatedRegistry = result.data;
});

// ============================================================================
// Gate 3: activeCanonicalLane is atlas-retrieval-384-v1
// ============================================================================

test(3, 'activeCanonicalLane is "atlas-retrieval-384-v1"', () => {
  if (validatedRegistry.activeCanonicalLane !== 'atlas-retrieval-384-v1') {
    throw new Error(
      `Expected "atlas-retrieval-384-v1", got "${validatedRegistry.activeCanonicalLane}"`
    );
  }
});

// ============================================================================
// Gate 4: Exactly 1 canonical lane
// ============================================================================

test(4, 'Exactly 1 lane has status = "canonical"', () => {
  const canonicalCount = validatedRegistry.lanes.filter(
    (lane) => lane.status === 'canonical'
  ).length;
  if (canonicalCount !== 1) {
    throw new Error(`Expected 1 canonical lane, found ${canonicalCount}`);
  }
});

// ============================================================================
// Gate 5: Cosine lanes use L2 normalization
// ============================================================================

test(5, 'All cosine-distance lanes use L2 normalization', () => {
  const cosineNonL2 = validatedRegistry.lanes.filter(
    (lane) => lane.distance === 'cosine' && lane.normalization !== 'l2'
  );
  if (cosineNonL2.length > 0) {
    const names = cosineNonL2.map((l) => l.laneId).join(', ');
    throw new Error(
      `Cosine lanes without L2 normalization: ${names}`
    );
  }
});

// ============================================================================
// Gate 6: No duplicate laneIds
// ============================================================================

test(6, 'No duplicate laneIds', () => {
  const ids = validatedRegistry.lanes.map((lane) => lane.laneId);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    const duplicates = ids.filter(
      (id, index) => ids.indexOf(id) !== index
    );
    throw new Error(`Duplicate lane IDs: ${[...new Set(duplicates)].join(', ')}`);
  }
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(70));
const passed = results.filter((r) => r.passed).length;
const total = results.length;

if (passed === total) {
  console.log(`✅ ALL GATES PASSED (${passed}/${total})`);
  console.log('='.repeat(70));
  process.exit(0);
} else {
  console.log(`❌ GATES FAILED (${passed}/${total} passed)`);
  console.log('='.repeat(70));
  process.exit(1);
}

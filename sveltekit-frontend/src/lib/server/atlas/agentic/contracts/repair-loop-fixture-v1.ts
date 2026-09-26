import { z } from 'zod';
import { AGENTIC_ACTION_REGISTRY_V1_SEED } from '../agentic-action-registry-v1.js';

const FixtureStepV1Schema = z.object({
  ordinal: z.number().int().nonnegative(),
  state: z.enum(['OBSERVE_ERROR', 'LOCALIZE', 'RESOLVE', 'VALIDATE', 'STOP']),
  actionId: z.string().min(1),
  actionKind: z.string().min(1),
  mutability: z.string().min(1),
}).strict();

export const RepairLoopFixtureV1Schema = z.object({
  schema: z.literal('atlas.repair-loop-fixture.v1'),
  fixtureId: z.literal('TS2345_DETERMINISTIC_FIXTURE_V1'),
  errorCode: z.literal('TS2345'),
  steps: z.array(FixtureStepV1Schema).length(4),
  maxSteps: z.literal(4),
  repairApplied: z.literal(false),
  status: z.literal('FIXTURE_ONLY'),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type RepairLoopFixtureV1 = z.infer<typeof RepairLoopFixtureV1Schema>;

/** A plan/replay fixture only; it never invokes tools or applies a patch. */
export function buildTs2345RepairLoopFixtureV1(): RepairLoopFixtureV1 {
  const sequence = [
    ['OBSERVE_ERROR', 'RG_EXACT_SEARCH'],
    ['LOCALIZE', 'OAK_RESOLVE'],
    ['RESOLVE', 'RUN_TYPECHECK'],
    ['VALIDATE', 'STOP_SUCCESS'],
  ] as const;
  const actions = new Map(AGENTIC_ACTION_REGISTRY_V1_SEED.map((action) => [action.actionId, action]));
  const steps = sequence.map(([state, actionId], ordinal) => {
    const action = actions.get(actionId);
    if (!action) throw new Error(`REPAIR_FIXTURE_ACTION_MISSING:${actionId}`);
    if (action.mutability !== 'READ_ONLY') throw new Error(`REPAIR_FIXTURE_MUTATION_NOT_ALLOWED:${actionId}`);
    return { ordinal, state, actionId, actionKind: action.kind, mutability: action.mutability };
  });
  return RepairLoopFixtureV1Schema.parse({
    schema: 'atlas.repair-loop-fixture.v1',
    fixtureId: 'TS2345_DETERMINISTIC_FIXTURE_V1',
    errorCode: 'TS2345',
    steps,
    maxSteps: 4,
    repairApplied: false,
    status: 'FIXTURE_ONLY',
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

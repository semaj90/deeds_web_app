/**
 * Agentic Error-Fixing Pipeline: Polynomial Bitset & XState v5 Machine
 *
 * Implements a compact binary bitset representation of the 6-stage agentic error-fixing lifecycle:
 * - Bit 0 (1):  ERROR_DETECTED        (0%  -> 15%)
 * - Bit 1 (2):  SCOUT_AND_ISOLATE     (15% -> 35%)
 * - Bit 2 (4):  AST_OAK_GROUNDING     (35% -> 60%)
 * - Bit 3 (8):  PROPOSAL_GENERATED    (60% -> 85%)
 * - Bit 4 (16): SANDBOX_PATCH_STAGED  (85% -> 99%)
 * - Bit 5 (32): REGRESSION_SMOKE_PASS (100% - Slayed)
 *
 * Designed for zero-overhead evaluation (WASM-like binary bitwise operations)
 * and pure CSS variable export (--progress: X%) for zero-JS CSS animations.
 */

export const ERROR_FIX_BITS = {
  DETECTED: 1 << 0,  // 0b000001 = 1
  SCOUTED: 1 << 1,   // 0b000010 = 2
  GROUNDED: 1 << 2,  // 0b000100 = 4
  PROPOSED: 1 << 3,  // 0b001000 = 8
  STAGED: 1 << 4,    // 0b010000 = 16
  VERIFIED: 1 << 5,  // 0b100000 = 32
} as const;

export type ErrorFixBitKey = keyof typeof ERROR_FIX_BITS;

export interface ErrorFixStage {
  id: string;
  name: string;
  bit: number;
  progressPercent: number;
  expAward: number;
  description: string;
}

export const ERROR_FIX_STAGES: ErrorFixStage[] = [
  {
    id: 'stage_0',
    name: 'ERROR_DETECTED',
    bit: ERROR_FIX_BITS.DETECTED,
    progressPercent: 15,
    expAward: 10,
    description: 'Intercepted runtime or compiler error; fingerprint captured',
  },
  {
    id: 'stage_1',
    name: 'SCOUT_AND_ISOLATE',
    bit: ERROR_FIX_BITS.SCOUTED,
    progressPercent: 35,
    expAward: 25,
    description: 'Ripgrep and call stack scouted; affected file spans isolated',
  },
  {
    id: 'stage_2',
    name: 'AST_OAK_GROUNDING',
    bit: ERROR_FIX_BITS.GROUNDED,
    progressPercent: 60,
    expAward: 40,
    description: 'AST CST syntax nodes and OAK legal ontology facts verified on :8095',
  },
  {
    id: 'stage_3',
    name: 'PROPOSAL_GENERATED',
    bit: ERROR_FIX_BITS.PROPOSED,
    progressPercent: 80,
    expAward: 100,
    description: 'LangGraph Boundary Shield: generated immutable PROPOSED_MUTATION receipt',
  },
  {
    id: 'stage_4',
    name: 'SANDBOX_PATCH_STAGED',
    bit: ERROR_FIX_BITS.STAGED,
    progressPercent: 95,
    expAward: 50,
    description: 'Dry-run patch staged with exact byte coordinates and checksum validation',
  },
  {
    id: 'stage_5',
    name: 'REGRESSION_SMOKE_PASS',
    bit: ERROR_FIX_BITS.VERIFIED,
    progressPercent: 100,
    expAward: 250,
    description: 'Vitest and smoke suites passed with zero regressions; bug slayed!',
  },
];

/** Check if a bitset contains a specific stage bit */
export function hasStageBit(bitset: number, bit: number): boolean {
  return (bitset & bit) === bit;
}

/** Set a stage bit in the bitset (immutable) */
export function addStageBit(bitset: number, bit: number): number {
  return bitset | bit;
}

/**
 * Calculate the exact 0-100% progress length from a polynomial bitset.
 * If all 6 bits are set (0b111111 = 63), returns 100%.
 */
export function calculateBitsetProgress(bitset: number): number {
  if (bitset <= 0) return 0;
  if ((bitset & ERROR_FIX_BITS.VERIFIED) !== 0) return 100;
  if ((bitset & ERROR_FIX_BITS.STAGED) !== 0) return 95;
  if ((bitset & ERROR_FIX_BITS.PROPOSED) !== 0) return 80;
  if ((bitset & ERROR_FIX_BITS.GROUNDED) !== 0) return 60;
  if ((bitset & ERROR_FIX_BITS.SCOUTED) !== 0) return 35;
  if ((bitset & ERROR_FIX_BITS.DETECTED) !== 0) return 15;
  return 0;
}

/** Total cumulative EXP gained from a bitset state */
export function calculateCumulativeExp(bitset: number): number {
  let total = 0;
  for (const stage of ERROR_FIX_STAGES) {
    if ((bitset & stage.bit) === stage.bit) {
      total += stage.expAward;
    }
  }
  return total;
}

/**
 * Generates pure CSS inline styles for zero-JS progress animation.
 * The browser's GPU compositor interpolates `--progress` and width smoothly.
 */
export function getCssVariablesForBitset(bitset: number): {
  '--progress': string;
  '--bitset': string;
  '--stage-count': number;
} {
  const progress = calculateBitsetProgress(bitset);
  return {
    '--progress': `${progress}%`,
    '--bitset': `0b${(bitset >>> 0).toString(2).padStart(6, '0')}`,
    '--stage-count': (bitset.toString(2).match(/1/g) || []).length,
  };
}

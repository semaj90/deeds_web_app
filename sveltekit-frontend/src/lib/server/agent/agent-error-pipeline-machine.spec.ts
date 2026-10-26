import { describe, it, expect } from 'vitest';
import {
  ERROR_FIX_BITS,
  hasStageBit,
  addStageBit,
  calculateBitsetProgress,
  calculateCumulativeExp,
  getCssVariablesForBitset,
} from './agent-error-pipeline-machine.js';

describe('AgentErrorPipelineMachine Polynomial Bitset & 0-100% Progress', () => {
  it('correctly sets and checks stage bits using binary bitwise operations', () => {
    let bitset = 0;
    expect(hasStageBit(bitset, ERROR_FIX_BITS.DETECTED)).toBe(false);

    bitset = addStageBit(bitset, ERROR_FIX_BITS.DETECTED);
    expect(hasStageBit(bitset, ERROR_FIX_BITS.DETECTED)).toBe(true);
    expect(hasStageBit(bitset, ERROR_FIX_BITS.SCOUTED)).toBe(false);

    bitset = addStageBit(bitset, ERROR_FIX_BITS.SCOUTED);
    expect(hasStageBit(bitset, ERROR_FIX_BITS.SCOUTED)).toBe(true);
    expect(bitset).toBe(0b000011); // 3
  });

  it('determines deterministic 0-100% bar lengths from bitset stages', () => {
    expect(calculateBitsetProgress(0)).toBe(0);
    expect(calculateBitsetProgress(ERROR_FIX_BITS.DETECTED)).toBe(15);
    expect(calculateBitsetProgress(ERROR_FIX_BITS.DETECTED | ERROR_FIX_BITS.SCOUTED)).toBe(35);
    expect(calculateBitsetProgress(ERROR_FIX_BITS.DETECTED | ERROR_FIX_BITS.SCOUTED | ERROR_FIX_BITS.GROUNDED)).toBe(60);
    expect(
      calculateBitsetProgress(
        ERROR_FIX_BITS.DETECTED | ERROR_FIX_BITS.SCOUTED | ERROR_FIX_BITS.GROUNDED | ERROR_FIX_BITS.PROPOSED
      )
    ).toBe(80);
    expect(
      calculateBitsetProgress(
        ERROR_FIX_BITS.DETECTED | ERROR_FIX_BITS.SCOUTED | ERROR_FIX_BITS.GROUNDED | ERROR_FIX_BITS.PROPOSED | ERROR_FIX_BITS.STAGED
      )
    ).toBe(95);
    expect(
      calculateBitsetProgress(
        ERROR_FIX_BITS.DETECTED | ERROR_FIX_BITS.SCOUTED | ERROR_FIX_BITS.GROUNDED | ERROR_FIX_BITS.PROPOSED | ERROR_FIX_BITS.STAGED | ERROR_FIX_BITS.VERIFIED
      )
    ).toBe(100);
  });

  it('computes cumulative EXP for completed stages', () => {
    const fullBitset = 0b111111; // all 6 stages complete
    const totalExp = calculateCumulativeExp(fullBitset);
    // 10 + 25 + 40 + 100 + 50 + 250 = 475 EXP
    expect(totalExp).toBe(475);
  });

  it('generates pure CSS custom properties for zero-JS HTML5 rendering', () => {
    const cssVars = getCssVariablesForBitset(0b000111); // Stage 3 (60% progress)
    expect(cssVars['--progress']).toBe('60%');
    expect(cssVars['--bitset']).toBe('0b000111');
    expect(cssVars['--stage-count']).toBe(3);
  });
});

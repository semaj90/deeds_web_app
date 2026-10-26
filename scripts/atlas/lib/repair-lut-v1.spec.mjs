import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchDiagnosticToRepair,
  REPAIR_LUT_RULES,
} from './repair-lut-v1.mjs';

describe('RepairLUTV1 Diagnostic Router', () => {
  test('blocks repair when chunk is historical', () => {
    const decision = dispatchDiagnosticToRepair({
      diagnosticCode: 'TS2304',
      sourceQualified: true,
      isHistoricalChunk: true,
      ruleId: 'RULE_IMPORT_01',
    });
    assert.equal(decision.kind, 'BLOCKED');
    assert.ok(decision.reason.includes('HISTORICAL_CHUNK_MISMATCH'));
  });

  test('demands evidence when source is not qualified', () => {
    const decision = dispatchDiagnosticToRepair({
      diagnosticCode: 'TS2307',
      sourceQualified: false,
      isHistoricalChunk: false,
    });
    assert.equal(decision.kind, 'NEEDS_EVIDENCE');
    assert.ok(decision.missing.includes('CURRENT_SOURCE_QUALIFICATION'));
    assert.deepEqual(decision.requiredTools, ['rg', 'lsp_definitions', 'tsconfig_check']);
  });

  test('proposes deterministic patch when source is qualified and rule exists', () => {
    const decision = dispatchDiagnosticToRepair({
      diagnosticCode: 'TS2304',
      sourceQualified: true,
      isHistoricalChunk: false,
      ruleId: 'RULE_IMPORT_ADD_01',
      targetFile: 'src/lib/foo.ts',
    });
    assert.equal(decision.kind, 'DETERMINISTIC_PATCH');
    assert.equal(decision.ruleId, 'RULE_IMPORT_ADD_01');
    assert.equal(decision.targetFile, 'src/lib/foo.ts');
  });

  test('escalates to model proposal when diagnostic is recognized TS code without deterministic rule', () => {
    const decision = dispatchDiagnosticToRepair({
      diagnosticCode: 'TS2345',
      sourceQualified: true,
      isHistoricalChunk: false,
      ruleId: null,
    });
    assert.equal(decision.kind, 'MODEL_PROPOSAL');
    assert.equal(decision.capability, 'typescript_diagnostic_repair');
  });

  test('abstains and blocks on missing source binding', () => {
    const decision = dispatchDiagnosticToRepair({
      diagnosticCode: 'MISSING_SOURCE_BINDING',
      sourceQualified: false,
      isHistoricalChunk: false,
    });
    assert.equal(decision.kind, 'BLOCKED');
    assert.ok(decision.reason.includes('ABSTAIN'));
  });
});

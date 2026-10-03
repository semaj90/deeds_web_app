import { describe, expect, it } from 'vitest';
import { aggregateValidationBarrier } from './validation-barrier.js';
const obs=(validator:string,status:'PASS'|'FAIL'|'WARN')=>({schema:'atlas.validation-observation.v1' as const,validator,status,evidenceRefs:[],durationMs:1,producerRevision:'v'});
describe('validation barrier',()=>{
  it('fails when a required validator is absent',()=>{expect(aggregateValidationBarrier({mutationId:'m',requiredValidators:['tree-sitter','typecheck'],observations:[obs('tree-sitter','PASS')]}).status).toBe('FAIL');});
  it('passes only when every required validator passes',()=>{
    const result = aggregateValidationBarrier({
      mutationId:'m',
      requiredValidators:['tree-sitter','typecheck','test'],
      observations:[obs('test','PASS'),obs('typecheck','PASS'),obs('tree-sitter','PASS')],
    });
    expect(result.status).toBe('PASS');
    expect(result.requiredValidators).toEqual(['test','tree-sitter','typecheck']);
    expect(result.checksum).toHaveLength(64);
  });
  it('does not accept warnings unless explicitly admitted',()=>{
    const observation = obs('typecheck','WARN');
    expect(aggregateValidationBarrier({mutationId:'m',requiredValidators:['typecheck'],observations:[observation]}).status).toBe('FAIL');
    expect(aggregateValidationBarrier({mutationId:'m',requiredValidators:['typecheck'],observations:[observation],warnAccepted:['typecheck']}).status).toBe('PASS');
  });
  it('replays deterministically regardless of observation order',()=>{
    const input = { mutationId:'m', requiredValidators:['tree-sitter','typecheck'], observations:[obs('typecheck','PASS'),obs('tree-sitter','PASS')] };
    const reversed = { ...input, observations:[...input.observations].reverse() };
    expect(aggregateValidationBarrier(input)).toEqual(aggregateValidationBarrier(reversed));
  });
  it('fails closed when a validator is observed more than once',()=>{
    const result = aggregateValidationBarrier({
      mutationId:'m',
      requiredValidators:['typecheck'],
      observations:[obs('typecheck','PASS'),obs('typecheck','FAIL')],
    });
    expect(result.status).toBe('FAIL');
  });
});

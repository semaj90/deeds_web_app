import { describe, expect, it } from 'vitest';
import { aggregateValidationBarrier } from './validation-barrier.js';
const obs=(validator:string,status:'PASS'|'FAIL'|'WARN')=>({schema:'atlas.validation-observation.v1' as const,validator,status,evidenceRefs:[],durationMs:1,producerRevision:'v'});
describe('validation barrier',()=>{it('fails when a required validator is absent',()=>{expect(aggregateValidationBarrier({mutationId:'m',requiredValidators:['tree-sitter','typecheck'],observations:[obs('tree-sitter','PASS')]}).status).toBe('FAIL');});});

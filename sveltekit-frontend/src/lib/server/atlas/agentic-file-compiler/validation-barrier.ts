import { sha256Stable } from './contracts.js';
export type ValidationStatus = 'PASS' | 'FAIL' | 'WARN';
export interface ValidationObservationV1 { schema:'atlas.validation-observation.v1'; validator:string; status:ValidationStatus; command?:string|null; exitCode?:number|null; stdoutDigest?:string|null; stderrDigest?:string|null; evidenceRefs:string[]; durationMs:number; producerRevision:string; }
export interface ValidationBarrierResultV1 { schema:'atlas.validation-barrier-result.v1'; mutationId:string; requiredValidators:string[]; observations:ValidationObservationV1[]; status:'PASS'|'FAIL'; checksum:string; }
export function aggregateValidationBarrier(input:{ mutationId:string; requiredValidators:string[]; observations:ValidationObservationV1[]; warnAccepted?:string[] }):ValidationBarrierResultV1 {
  const byValidator = new Map(input.observations.map((o)=>[o.validator,o])); const warnAccepted = new Set(input.warnAccepted ?? []);
  const pass = input.requiredValidators.every((name)=>{ const o=byValidator.get(name); return !!o && (o.status==='PASS' || (o.status==='WARN' && warnAccepted.has(name))); });
  const body={ schema:'atlas.validation-barrier-result.v1' as const, mutationId:input.mutationId, requiredValidators:[...new Set(input.requiredValidators)].sort(), observations:[...input.observations].sort((a,b)=>a.validator.localeCompare(b.validator)), status:(pass?'PASS':'FAIL') as 'PASS'|'FAIL' };
  return {...body, checksum:sha256Stable(body)};
}

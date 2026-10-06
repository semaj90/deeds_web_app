import { sha256Stable } from './contracts.js';

export type ValidationStatus = 'PASS' | 'FAIL' | 'WARN';

export interface ValidationObservationV1 {
  schema:'atlas.validation-observation.v1';
  validator:string;
  status:ValidationStatus;
  command?:string|null;
  exitCode?:number|null;
  stdoutDigest?:string|null;
  stderrDigest?:string|null;
  evidenceRefs:string[];
  durationMs:number;
  producerRevision:string;
}

export interface ValidationBarrierResultV1 {
  schema:'atlas.validation-barrier-result.v1';
  mutationId:string;
  requiredValidators:string[];
  observations:ValidationObservationV1[];
  status:'PASS'|'FAIL';
  checksum:string;
}

function hasExecutionEvidence(observation: ValidationObservationV1): boolean {
  return Boolean(
    observation.command &&
    observation.exitCode !== undefined &&
    observation.exitCode !== null &&
    observation.stdoutDigest &&
    observation.stderrDigest &&
    observation.evidenceRefs.length > 0 &&
    observation.producerRevision
  );
}

function observationPasses(
  observation: ValidationObservationV1,
  warnAccepted: Set<string>,
): boolean {
  if (!hasExecutionEvidence(observation)) return false;
  if (observation.status === 'PASS') return observation.exitCode === 0;
  if (observation.status === 'WARN') return observation.exitCode === 0 && warnAccepted.has(observation.validator);
  return false;
}

export function aggregateValidationBarrier(input:{
  mutationId:string;
  requiredValidators:string[];
  observations:ValidationObservationV1[];
  warnAccepted?:string[];
}):ValidationBarrierResultV1 {
  const byValidator = new Map<string, ValidationObservationV1>();
  let duplicateValidator = false;

  for (const observation of input.observations) {
    if (byValidator.has(observation.validator)) duplicateValidator = true;
    byValidator.set(observation.validator, observation);
  }

  const warnAccepted = new Set(input.warnAccepted ?? []);
  const required = [...new Set(input.requiredValidators)].sort();
  const pass =
    !duplicateValidator &&
    required.length > 0 &&
    required.every((name) => {
      const observation = byValidator.get(name);
      return Boolean(observation && observationPasses(observation, warnAccepted));
    });

  const body = {
    schema:'atlas.validation-barrier-result.v1' as const,
    mutationId:input.mutationId,
    requiredValidators:required,
    observations:[...input.observations].sort((a,b)=>a.validator.localeCompare(b.validator)),
    status:(pass?'PASS':'FAIL') as 'PASS'|'FAIL',
  };

  return {...body, checksum:sha256Stable(body)};
}

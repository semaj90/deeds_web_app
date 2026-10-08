import { describe, expect, it } from 'vitest';
import { commitDagAttemptTransitionV1, prepareDagAttemptTransitionV1, type DagAttemptRowV1 } from './dag-attempt-cas-v1.js';
const row: DagAttemptRowV1 = { status: 'READY', version: 1, identity: {
 runId:'run',stepId:'step',attemptId:'attempt',dagRevision:'dag',sourceRevision:'source',
 workspaceRevision:'workspace',graphRevision:'graph',representationRevision:'representation',
 modelRevision:'model',featureRevision:'feature',leaseId:'lease',generation:1,
}};
describe('DAG attempt transactional contract',()=>{
 it('prepares guarded READY to RUNNING',()=>{
  const transition=prepareDagAttemptTransitionV1({before:row,nextStatus:'RUNNING',evidenceDigest:'sha',idempotencyKey:'run:step:1'});
  expect(transition.after.version).toBe(2);
  expect(transition.after.status).toBe('RUNNING');
 });
 it('rejects READY directly to SUCCEEDED',()=>{
  expect(()=>prepareDagAttemptTransitionV1({before:row,nextStatus:'SUCCEEDED',evidenceDigest:'sha',idempotencyKey:'key'})).toThrow('DAG_ATTEMPT_TRANSITION_INVALID');
 });
 it('rejects stale zero-row commit',async()=>{
  const transition=prepareDagAttemptTransitionV1({before:row,nextStatus:'RUNNING',evidenceDigest:'sha',idempotencyKey:'key'});
  await expect(commitDagAttemptTransitionV1({compareAndCommit:async()=>null},transition)).rejects.toThrow('DAG_ATTEMPT_STALE_OR_UNVERIFIED');
 });
 it('accepts a verified response from a transactional port mock',async()=>{
  const transition=prepareDagAttemptTransitionV1({before:row,nextStatus:'RUNNING',evidenceDigest:'sha',idempotencyKey:'key'});
  await expect(commitDagAttemptTransitionV1({compareAndCommit:async()=>transition.after},transition)).resolves.toEqual(transition.after);
 });
});
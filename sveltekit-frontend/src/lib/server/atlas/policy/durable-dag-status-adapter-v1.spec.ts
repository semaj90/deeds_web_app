import {describe,it,expect} from 'vitest';
import {journalToAttemptStatusV1,attemptToJournalStatusV1,canActivateJournalDagClaimsV1} from './durable-dag-status-adapter-v1.js';

describe('existing durable journal compatibility',()=>{
 it('keeps pending distinct from ready and maps terminal/running states without promotion',()=>{
  expect(journalToAttemptStatusV1('PENDING')).toBeNull();
  expect(journalToAttemptStatusV1('EXECUTING')).toBe('RUNNING');
  expect(journalToAttemptStatusV1('SUCCESS')).toBe('SUCCEEDED');
  expect(journalToAttemptStatusV1('FAILED')).toBe('FAILED');
  expect(journalToAttemptStatusV1('SKIPPED')).toBeNull();

  expect(attemptToJournalStatusV1('READY')).toBe('PENDING');
  expect(attemptToJournalStatusV1('RUNNING')).toBe('EXECUTING');
  expect(attemptToJournalStatusV1('SUCCEEDED')).toBe('SUCCESS');
  expect(attemptToJournalStatusV1('FAILED')).toBe('FAILED');
  expect(attemptToJournalStatusV1('SUPERSEDED')).toBeNull();
 });

 it('rejects incomplete deployment/lease/dependency proof',()=>{
  const c={schemaDeployed:true,leaseOwnershipVerified:true,fencingGenerationVerified:false,
    transactionalReceiptVerified:true,dependencyClaimVerified:true};
  expect(canActivateJournalDagClaimsV1(c)).toBe(false);
  expect(canActivateJournalDagClaimsV1({...c,fencingGenerationVerified:true})).toBe(true);
  expect(canActivateJournalDagClaimsV1({...c,fencingGenerationVerified:true,dependencyClaimVerified:false})).toBe(false);
 });
});

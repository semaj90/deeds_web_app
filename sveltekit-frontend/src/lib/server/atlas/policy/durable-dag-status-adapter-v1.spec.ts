import {describe,it,expect} from 'vitest';
import {journalToAttemptStatusV1,attemptToJournalStatusV1,canActivateJournalDagClaimsV1} from './durable-dag-status-adapter-v1.js';
describe('existing durable journal compatibility',()=>{
 it('maps actual journal states without conflating skipped or superseded',()=>{
  expect(journalToAttemptStatusV1('PENDING')).toBeNull();
  expect(journalToAttemptStatusV1('EXECUTING')).toBe('RUNNING');
  expect(journalToAttemptStatusV1('SUCCESS')).toBe('SUCCEEDED');
  expect(journalToAttemptStatusV1('SKIPPED')).toBeNull();
  expect(attemptToJournalStatusV1('SUPERSEDED')).toBeNull();
 });
 it('rejects incomplete deployment/lease proof',()=>{
  const c={schemaDeployed:true,leaseOwnershipVerified:true,fencingGenerationVerified:false,
    transactionalReceiptVerified:true,dependencyClaimVerified:true};
  expect(canActivateJournalDagClaimsV1(c)).toBe(false);
  expect(canActivateJournalDagClaimsV1({...c,fencingGenerationVerified:true})).toBe(false);
});
});

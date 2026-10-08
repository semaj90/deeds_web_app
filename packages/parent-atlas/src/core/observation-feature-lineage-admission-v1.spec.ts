import { describe, expect, it } from 'vitest';
import { admitObservationFeatureLineageV1 } from './observation-feature-lineage-admission-v1.js';
const member = {packetKey:'packet',sourceRef:'src/f.ts',sourceRevision:'s1',workspaceRevision:'w1',sourceDigest:'digest'};
const feature = {packetKey:'packet',sourceRef:'src/f.ts',sourceRevision:'s1',workspaceRevision:'w1',
  featureRevision:'f1',registryRevision:'r1',inputDigest:'input',evidenceRefs:['ev']};
const proven = {membershipProven:true,featureStoreProven:true};
describe('feature lineage admission',()=>{
 it('admits only fully bound rows',()=>expect(admitObservationFeatureLineageV1(member,feature,proven).accepted).toBe(true));
 it('rejects absent feature revision',()=>expect(admitObservationFeatureLineageV1(member,{...feature,featureRevision:null},proven).reason).toBe('FEATURE_REVISION_MISSING'));
 it('rejects absent workspace revision',()=>expect(admitObservationFeatureLineageV1(member,{...feature,workspaceRevision:null},proven).reason).toBe('FEATURE_WORKSPACE_REVISION_MISSING'));
 it('rejects unverified feature store',()=>expect(admitObservationFeatureLineageV1(member,feature,{...proven,featureStoreProven:false}).accepted).toBe(false));
 it('rejects source drift',()=>expect(admitObservationFeatureLineageV1(member,{...feature,sourceRevision:'s2'},proven).reason).toBe('FEATURE_SOURCE_REVISION_MISMATCH'));
});

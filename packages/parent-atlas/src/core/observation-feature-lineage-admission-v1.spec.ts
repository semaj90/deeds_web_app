import { describe, expect, it } from 'vitest';
import { admitObservationFeatureLineageV1 } from './observation-feature-lineage-admission-v1.js';
const member={packetKey:'p',sourceRef:'src/a.ts',sourceRevision:'s',workspaceRevision:'w',sourceDigest:'digest'};
const row={packetKey:'p',sourceRef:'src/a.ts',sourceRevision:'s',workspaceRevision:null,
 featureRevision:'f',registryRevision:'r',inputDigest:'input',evidenceRefs:['ev'],dependencyScope:'SOURCE' as const};
const proof={membershipProven:true,featureStoreProven:true,sourceEvidenceProven:true,
 sourceDigest:'digest',featureDefinitionProven:true,registryRevision:'r',
 snapshotOrdinalProven:true,snapshotWorkspaceRevision:'w'};
describe('source-bound and snapshot-bound ORF admission',()=>{
 it('accepts source-bound evidence independently of per-row workspace',()=>{
  expect(admitObservationFeatureLineageV1(member,row,proof,'SOURCE_BOUND').accepted).toBe(true);
 });
 it('accepts snapshot-bound evidence with separately verified ordinal map',()=>{
  expect(admitObservationFeatureLineageV1(member,row,proof,'SNAPSHOT_BOUND').accepted).toBe(true);
 });
 it('does not allow source-only admission for graph features',()=>{
  expect(admitObservationFeatureLineageV1(member,{...row,dependencyScope:'GRAPH'},proof,'SOURCE_BOUND').reason).toBe('FEATURE_CONTEXT_REQUIRES_SNAPSHOT');
 });
 it('requires graph proof when graph feature is snapshot bound',()=>{
  expect(admitObservationFeatureLineageV1(member,{...row,dependencyScope:'GRAPH'},proof,'SNAPSHOT_BOUND').reason).toBe('FEATURE_GRAPH_CONTEXT_UNPROVEN');
 });
 it('rejects unmatched snapshot workspace',()=>{
  expect(admitObservationFeatureLineageV1(member,row,{...proof,snapshotWorkspaceRevision:'old'},'SNAPSHOT_BOUND').accepted).toBe(false);
 });
 it('rejects missing feature revision',()=>{
  expect(admitObservationFeatureLineageV1(member,{...row,featureRevision:null},proof,'SOURCE_BOUND').reason).toBe('FEATURE_REVISION_MISSING');
 });
 it('rejects unverified source digest',()=>{
  expect(admitObservationFeatureLineageV1(member,row,{...proof,sourceDigest:'other'},'SOURCE_BOUND').accepted).toBe(false);
 });
 it('rejects unresolved feature definition',()=>{
  expect(admitObservationFeatureLineageV1(member,row,{...proof,featureDefinitionProven:false},'SOURCE_BOUND').accepted).toBe(false);
 });
 it('rejects historical feature lacking source evidence proof',()=>{
  expect(admitObservationFeatureLineageV1(member,row,{membershipProven:true,featureStoreProven:true},'SOURCE_BOUND').accepted).toBe(false);
 });
});

/** Proposal-only crosswalk check: never converts labels/coordinates into canonical facts. */
import { createHash } from 'node:crypto';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function string(x,label){if(typeof x!=='string'||!x.trim())throw Error('MISSING_'+label);return x.trim();}
export function reviewObservationDomainBindingV1(input){
 const observation=input?.observation??{};
 const sourceRef=string(observation.source_ref,'SOURCE_REF');
 const sourceRevision=string(observation.source_revision,'SOURCE_REVISION');
 if(sourceRevision==='workspace:0'||sourceRevision.endsWith('_PENDING'))throw Error('UNQUALIFIED_SOURCE_REVISION');
 if(!Number.isSafeInteger(observation.byte_start)||!Number.isSafeInteger(observation.byte_end)||
 observation.byte_start<0||observation.byte_end<=observation.byte_start)throw Error('INVALID_BYTE_SPAN');
 const observedKind=string(observation.observation_kind,'OBSERVATION_KIND');
 const definitions=input?.definitions;
 if(!Array.isArray(definitions))throw Error('DEFINITIONS_REQUIRED');
 const featureId='ast.'+observedKind.toLowerCase();
 const proposed=definitions.find(d=>d?.feature_id===featureId);
 if(!proposed)throw Error('UNMAPPED_AST_OBSERVATION:'+featureId);
 if(proposed.family!=='AST_BINARY'||proposed.value_kind!=='BINARY')throw Error('FEATURE_KIND_MISMATCH');
 const rawDomain=string(input.domainLabel,'DOMAIN_LABEL');
 const knownGroups=Array.isArray(input.ontologyGroupIds)?input.ontologyGroupIds:[];
 const exactGroups=knownGroups.filter(group=>group===rawDomain);
 const state=exactGroups.length===1?'EXACT_STRING_CANDIDATE':'UNRESOLVED';
 const body={schema:'atlas.orf-domain-admission-boundary.v1',sourceRef,sourceRevision,
  byteStart:observation.byte_start,byteEnd:observation.byte_end,
  observationId:string(observation.observation_id,'OBSERVATION_ID'),
  producerRevision:string(observation.extractor_revision,'PRODUCER_REVISION'),
  featureId,featureReviewState:'PROPOSED_ONLY',rawDomain,
  ontologyGroupId:state==='EXACT_STRING_CANDIDATE'?rawDomain:null,
  domainResolutionState:state,ontologyAdmitted:false,orfApproved:false,
  topologyAdmitted:false,relationAdmitted:false,writesPerformed:false};
 return {...body,receiptChecksum:sha(body)};
}

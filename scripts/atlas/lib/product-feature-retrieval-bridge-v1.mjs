/** Read-only bridge. Canonical retrieval owns lane fusion, ranking and packet identity. */
const value = x => typeof x === 'string' && x.trim().length > 0;
const blocked = (gate, reason) => ({schema:'atlas.product-feature-retrieval-bridge.v1',status:'BLOCKED',gate,reason,files:[],tasks:[],admission:false,writesPerformed:false});
export async function retrieveFeatureFilesV1({decomposition, search, verifyOrdinalMap, verifySource, maxFiles=10}) {
 if(decomposition?.schema !== 'atlas.product-feature-decomposition.v1' || decomposition.status !== 'PROPOSAL_ONLY') return blocked('FEATURE_PROPOSAL','MISSING_FEATURE_PROPOSAL');
 if(typeof search !== 'function') return blocked('RETRIEVAL','CANONICAL_SEARCH_OWNER_NOT_CONFIGURED');
 if(typeof verifyOrdinalMap !== 'function') return blocked('RETRIEVAL','ORDINAL_MAP_VERIFIER_NOT_CONFIGURED');
 if(typeof verifySource !== 'function') return blocked('SOURCE','CANONICAL_SOURCE_READBACK_NOT_CONFIGURED');
 if(!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>50)return blocked('LIMITS','INVALID_MAXFILES');
 let result;
 try {result=await search({requestId:decomposition.requestId,query:decomposition.query,featureIds:decomposition.features.map(f=>f.id),topK:maxFiles});}
 catch{return blocked('RETRIEVAL','SEARCH_OWNER_FAILED');}
 if(!result || result.requestId!==decomposition.requestId|| !value(result.workspaceRevision)|| !value(result.candidateSnapshotRevision)||!value(result.ordinalMapChecksum)||!result.ordinalMap||!Array.isArray(result.candidates))return blocked('RETRIEVAL','CANONICAL_SNAPSHOT_MISSING');
 let ordinalMapReceipt;
 try { ordinalMapReceipt=await verifyOrdinalMap({requestId:result.requestId,workspaceRevision:result.workspaceRevision,candidateSnapshotRevision:result.candidateSnapshotRevision,ordinalMapChecksum:result.ordinalMapChecksum,ordinalMap:result.ordinalMap,candidates:result.candidates}); }
 catch { return blocked('RETRIEVAL','ORDINAL_MAP_VERIFICATION_FAILED'); }
 if(ordinalMapReceipt?.status!=='MATCH'||ordinalMapReceipt.requestId!==result.requestId||ordinalMapReceipt.workspaceRevision!==result.workspaceRevision||ordinalMapReceipt.candidateSnapshotRevision!==result.candidateSnapshotRevision||ordinalMapReceipt.ordinalMapChecksum!==result.ordinalMapChecksum)return blocked('RETRIEVAL','ORDINAL_MAP_VERIFICATION_FAILED');
 if(result.candidates.length>maxFiles)return blocked('LIMITS','SEARCH_RETURNED_OVER_LIMIT');
 const files=[],seen=new Set();
 for(const candidate of result.candidates){
  if(![candidate.packetKey,candidate.sourceRef,candidate.sourceRevision,candidate.canonicalCandidateId].every(value))return blocked('IDENTITY','CANDIDATE_IDENTITY_MISSING');
  if(seen.has(candidate.canonicalCandidateId))return blocked('IDENTITY','DUPLICATE_CANDIDATE');
  seen.add(candidate.canonicalCandidateId);
  let receipt;
  try{receipt=await verifySource({candidate,workspaceRevision:result.workspaceRevision,candidateSnapshotRevision:result.candidateSnapshotRevision});}
  catch{return blocked('SOURCE','SOURCE_READBACK_FAILED');}
  // Claim-only flags cannot grant source admission. Receipt has to be issued by configured authority;
  // this adapter never labels the result LIVE_PROVEN or ADMITTED.
  if(receipt?.status!=='SOURCE_VERIFIED_NOT_ADMITTED'||receipt.packetKey!==candidate.packetKey||receipt.sourceRef!==candidate.sourceRef||receipt.sourceRevision!==candidate.sourceRevision)return blocked('SOURCE','SOURCE_RECEIPT_MISSING_OR_MISMATCHED');
  files.push({canonicalCandidateId:candidate.canonicalCandidateId,packetKey:candidate.packetKey,sourceRef:candidate.sourceRef,sourceRevision:candidate.sourceRevision,sourceReceiptId:receipt.receiptId??null,rank:files.length+1});
 }
 return {schema:'atlas.product-feature-retrieval-bridge.v1',status:'SOURCE_VERIFIED_NOT_ADMITTED',gate:null,reason:null,requestId:result.requestId,workspaceRevision:result.workspaceRevision,candidateSnapshotRevision:result.candidateSnapshotRevision,ordinalMapChecksum:result.ordinalMapChecksum,features:decomposition.features.map(f=>({featureId:f.id,featureLabel:f.featureLabel,ontologyId:null,admission:'PROPOSAL_ONLY'})),files,admission:false,writesPerformed:false};
}
/** Task plan is non-executable and not a canonical PromptPlanV1. */
export function proposeFeatureTasksV1(bridge) {
 if(bridge?.status!=='SOURCE_VERIFIED_NOT_ADMITTED')return {schema:'atlas.feature-task-proposal.v1',status:'BLOCKED',tasks:[],reason:'SOURCE_EVIDENCE_NOT_VERIFIED',writesPerformed:false};
 const tasks=bridge.features.map(feature=>({taskKey:`feature:${feature.featureId}`,title:`Inspect ${feature.featureLabel} implementation`,kind:'INSPECT',dependencies:[],sourceRefs:bridge.files.map(f=>f.sourceRef),mutationAuthorized:false,ontologyId:null}));
 return {schema:'atlas.feature-task-proposal.v1',status:'PROPOSAL_ONLY',tasks,contextManifest:null,promptPlan:null,mutationAuthorized:false,writesPerformed:false};
}

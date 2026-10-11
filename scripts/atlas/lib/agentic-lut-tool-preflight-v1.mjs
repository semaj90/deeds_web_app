import {createHash} from 'node:crypto';
const hash=(v)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const digest=/^sha256:[a-f0-9]{64}$/;
const phases=['DISCOVER','INSPECT','EXPAND','VALIDATE','SYNTHESIZE'];
/** Pure offline tool routing proposal; consumes registry-owner supplied descriptors.
 * Never discovers MCP tools, calls models, invokes tools, or creates authority. */
export function proposeReadOnlyToolLookupV1(input){
 if(!input||typeof input!=='object')throw Error('LUT_INPUT_REQUIRED');
 const {query,workspaceRevision,evidenceChecksum,registryRevision,profiles}=input;
 if(typeof query!=='string'||!query.trim()||query.length>8192)throw Error('LUT_QUERY_INVALID');
 if(!digest.test(workspaceRevision??''))throw Error('LUT_WORKSPACE_REVISION_UNRESOLVED');
 if(!digest.test(evidenceChecksum??''))throw Error('LUT_EVIDENCE_CHECKSUM_INVALID');
 if(typeof registryRevision!=='string'||!registryRevision.trim())throw Error('LUT_REGISTRY_REVISION_REQUIRED');
 if(!Array.isArray(profiles)||profiles.length>128)throw Error('LUT_PROFILE_LIST_INVALID');
 const seen=new Set();
 const eligible=[];
 const tokens=new Set((query.toLowerCase().match(/[a-z0-9_]+/g)??[]).filter(x=>x.length>2));
 for(const p of profiles){
  const id=p?.serverAuthorityId+'::'+p?.toolName;
  if(typeof p?.serverAuthorityId!=='string'||!p.serverAuthorityId.trim()||typeof p.toolName!=='string'||!p.toolName.trim())throw Error('LUT_TOOL_ID_INVALID');
  if(seen.has(id))throw Error('LUT_DUPLICATE_TOOL:'+id);
  seen.add(id);
  if(!digest.test(p.toolSchemaDigest??''))throw Error('LUT_TOOL_SCHEMA_DIGEST_INVALID:'+id);
  if(!Array.isArray(p.capabilities)||!p.capabilities.every(x=>typeof x==='string'))throw Error('LUT_CAPABILITIES_INVALID:'+id);
  if(p.readOnly!==true||p.registryAllowed!==true||p.operatorGated===true)continue;
  const overlap=p.capabilities.filter(x=>tokens.has(x.toLowerCase())).length;
  eligible.push({id,toolSchemaDigest:p.toolSchemaDigest,score:overlap,capabilities:p.capabilities});
 }
 eligible.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const body={schema:'atlas.agentic-lut-tool-preflight.v1',inputChecksum:hash(query),
 workspaceRevision,evidenceChecksum,registryRevision,phase:phases[0],
 toolCandidates:eligible.slice(0,8).map(({id,toolSchemaDigest,score})=>({id,toolSchemaDigest,score})),
 status:eligible.length?'READ_ONLY_TOOL_PROPOSAL':'NO_ELIGIBLE_TOOLS',
 executionAuthorized:false,canonicalAuthority:false,writesPerformed:false,
 viterbiExecuted:false,registryRuntimeVerified:false};
 return {...body,receiptChecksum:hash(body)};
}

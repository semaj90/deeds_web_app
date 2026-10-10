import { createHash } from 'node:crypto';

// Proposal vocabulary; never maps directly to canonical ontology identity.
export const PRODUCT_FEATURES_V1 = Object.freeze([
  { id:'auth.login', name:'Sign in', surfaces:['website','webapp','mobile'], domains:['auth','ui'], tokens:['login','log in','sign in','authentication','oauth','sso'] },
  { id:'auth.signup', name:'Registration', surfaces:['website','webapp','mobile'], domains:['auth','ui'], tokens:['register','registration','sign up','onboarding'] },
  { id:'content.search', name:'Search and filtering', surfaces:['website','webapp','mobile'], domains:['retrieval','ui'], tokens:['search','filter','faceted','query','lookup'] },
  { id:'content.cms', name:'Content publishing', surfaces:['website','webapp'], domains:['ui','database'], tokens:['cms','blog','article','publish','editor'] },
  { id:'commerce.catalog', name:'Product catalog', surfaces:['website','webapp','mobile'], domains:['ui','database'], tokens:['products','product catalog','browse items','inventory'] },
  { id:'commerce.checkout', name:'Checkout', surfaces:['website','webapp','mobile'], domains:['ui','database'], tokens:['checkout','cart','purchase','payment'] },
  { id:'account.profile', name:'Account settings', surfaces:['webapp','mobile'], domains:['auth','ui'], tokens:['profile','preferences','account settings','settings'] },
  { id:'collaboration.messaging', name:'Messaging', surfaces:['webapp','mobile'], domains:['network','ui'], tokens:['chat','messaging','inbox','messages'] },
  { id:'collaboration.notifications', name:'Notifications', surfaces:['webapp','mobile'], domains:['network','ui'], tokens:['push notification','notifications','alerts'] },
  { id:'analytics.dashboard', name:'Analytics dashboard', surfaces:['webapp','mobile'], domains:['ui','database'], tokens:['dashboard','analytics','kpi','charts','metrics'] },
  { id:'maps.location', name:'Maps and location', surfaces:['website','webapp','mobile'], domains:['network','ui'], tokens:['map','location','gps','geolocation','directions'] },
  { id:'agent.workflow', name:'Agent automation', surfaces:['webapp','mobile'], domains:['agent','graph'], tokens:['agent','workflow','automation','task execution','tool calling'] },
  { id:'offline.sync', name:'Offline synchronization', surfaces:['mobile','webapp'], domains:['cache','network'], tokens:['offline','sync','background sync','local cache'] },
  { id:'admin.roles', name:'Administration and roles', surfaces:['webapp'], domains:['auth','database'], tokens:['admin','roles','permission','rbac'] },
]);
const normalize = s=>s.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const hash = x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const includeToken = (query, token) => (` ${query} `).includes(` ${normalize(token)} `);
/** Deterministic proposal ranking, NOT semantic retrieval or evidence admission. */
export function decomposeProductRequestV1({requestId, query, surface, topK=5, sources=[]}) {
 if(typeof requestId!=='string'||!requestId.trim()||typeof query!=='string'||!query.trim()) throw new Error('REQUEST_REQUIRED');
 if(!['website','webapp','mobile'].includes(surface)) throw new Error('INVALID_SURFACE');
 if(!Number.isSafeInteger(topK)||topK<1||topK>50) throw new Error('INVALID_TOPK');
 if(!Array.isArray(sources)||sources.some(x=>typeof x?.sourceRef!=='string'||typeof x?.sourceRevision!=='string')) throw new Error('INVALID_SOURCES');
 const q=normalize(query);
 const scored=PRODUCT_FEATURES_V1.filter(f=>f.surfaces.includes(surface)).map(f=>{
   const matches=f.tokens.filter(t=>includeToken(q,t));
   return {...f,score:matches.length,matchedTerms:matches};
 }).filter(f=>f.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id,'en'));
 const features=scored.slice(0,topK).map(({tokens,surfaces,...rest})=>({
   ...rest,featureLabel:rest.name,ontologyId:null,admission:'PROPOSAL_ONLY',
   evidenceRefs:[], sourceCandidates:[]
 }));
 const base={schema:'atlas.product-feature-decomposition.v1',requestId,surface,query,features,
   unresolvedDomains:[...new Set(features.flatMap(f=>f.domains))].filter(x=>x==='network'||x==='agent'),
   sourceHints:sources.map(x=>({sourceRef:x.sourceRef,sourceRevision:x.sourceRevision})),
   retrievalRequest:{lexical:true,ast:true,semantic:true,graph:true,topFiles:topK},
   status:'PROPOSAL_ONLY',ontologyAdmission:false,writePerformed:false};
 return {...base, checksum:hash(base)};
}

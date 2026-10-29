/** Deterministic, serializable courtroom story runtime. No GPU/DOM/network dependencies. */
import { STATION_IDS } from '../courtroom-floorplan-v1.js';
export type Mood = 'neutral' | 'confident' | 'nervous' | 'angry' | 'relieved';
export type Phase = 'lobby' | 'opening' | 'testimony' | 'cross' | 'verdict' | 'closed';
export type DialogueIntent = 'answer' | 'decline' | 'ask_clarification';
export type CueKind = 'dialogue' | 'emotion' | 'animation' | 'evidence' | 'phase' | 'move';
export type Role = 'judge' | 'prosecutor' | 'defense' | 'witness' | 'jester';
export interface ActorSpec { id: string; role: Role; name: string; asset: string; clips: Record<string,string>; personality: { patience: number; honesty: number }; }
export interface Cue { id: string; tick: number; actorId: string; kind: CueKind; value: string; requiredEvidence?: string; waitForArrival?: { actorId: string; station: string }; }
export interface Story { version: 1; id: string; title: string; actors: ActorSpec[]; cues: Cue[]; }
export interface State { tick: number; phase: Phase; mood: Record<string,Mood>; evidence: string[]; fired: string[]; transcript: {tick:number; actorId:string; text:string; intent?:DialogueIntent}[]; animations: Record<string,string>; /** Where each actor is meant to be (a station id from the floor plan); the scene walks them there. */ positions: Record<string,string>; moveOutcomes: Record<string,{station:string;outcome:'finished'|'interrupted'|'timeout'|'unavailable'}>; }
export type Input = { type:'TICK'; steps?:number } | {type:'SUBMIT_EVIDENCE'; id:string} | {type:'QUESTION'; actorId:string; topic:string} | {type:'MOVE_SETTLED'; actorId:string; station:string; outcome:State['moveOutcomes'][string]['outcome']} | {type:'SCENE_ANIMATION'; actorId:string; animation:string} | {type:'ACCEPT_DIALOGUE_PROPOSAL'; actorId:string; expectedPhase:Phase; expectedEvidenceIds:string[]; text:string; intent:DialogueIntent} | {type:'RESET'};
export function initialState(story: Story): State { return {tick:0,phase:'lobby',mood:Object.fromEntries(story.actors.map(a=>[a.id,'neutral' as Mood])),evidence:[],fired:[],transcript:[],animations:{},positions:{},moveOutcomes:{}}; }
const phases:Phase[]=['lobby','opening','testimony','cross','verdict','closed'];
const moods:Mood[]=['neutral','confident','nervous','angry','relieved'];
const safeText = (s:string) => s.slice(0,500);
export function step(story: Story, old: State, input:Input): State {
 if(input.type==='RESET') return initialState(story);
 const s:State=structuredClone(old);
 s.positions??={};
 s.moveOutcomes??={};
 if(input.type==='SUBMIT_EVIDENCE') {if(!s.evidence.includes(input.id)) s.evidence.push(input.id);return s;}
 if(input.type==='MOVE_SETTLED') {
   if(story.actors.some(actor=>actor.id===input.actorId) && STATION_IDS.includes(input.station) && s.positions[input.actorId]===input.station) {
     s.moveOutcomes[input.actorId]={station:input.station,outcome:input.outcome};
     applyDueCues(story,s);
   }
   return s;
 }
 if(input.type==='SCENE_ANIMATION') {
   if(story.actors.some(actor=>actor.id===input.actorId) && typeof input.animation==='string' && input.animation.length>0 && input.animation.length<=64) s.animations[input.actorId]=input.animation;
   return s;
 }
 if(input.type==='ACCEPT_DIALOGUE_PROPOSAL') {
   const evidenceMatches=input.expectedEvidenceIds.length<=64&&input.expectedEvidenceIds.length===s.evidence.length&&input.expectedEvidenceIds.every((id,index)=>typeof id==='string'&&id.length<=200&&id===s.evidence[index]);
   if(story.actors.some(actor=>actor.id===input.actorId)&&input.expectedPhase===s.phase&&evidenceMatches&&
      ['answer','decline','ask_clarification'].includes(input.intent)&&typeof input.text==='string'&&input.text.trim().length>0&&input.text.length<=500) {
     s.transcript.push({tick:s.tick,actorId:input.actorId,text:safeText(input.text.trim()),intent:input.intent});
   }
   return s;
 }
 if(input.type==='QUESTION') {
   const actor=story.actors.find(a=>a.id===input.actorId); if(!actor) return s;
   const hasEvidence=s.evidence.length>0;
   // Deterministic decision tree: no LLM can modify the evidence or phase.
   const reply= !hasEvidence ? `${actor.name}: Please establish the facts first.` :
    actor.personality.honesty>=70 ? `${actor.name}: I will answer about ${safeText(input.topic)} based on the admitted evidence.` :
    `${actor.name}: I need time to consider the question about ${safeText(input.topic)}.`;
   s.transcript.push({tick:s.tick,actorId:actor.id,text:reply}); return s;
 }
 for(let i=0;i<Math.min(300,Math.max(1,input.steps??1));i++) {
   const nextTick=s.tick+1;
   const waiting=story.cues.some(c=>c.tick<=nextTick&&!s.fired.includes(c.id)&&c.waitForArrival&&
     s.moveOutcomes[c.waitForArrival.actorId]?.station!==c.waitForArrival.station);
   if(waiting) break;
   s.tick++;
   applyDueCues(story,s);
 }
 return s;
}
function applyDueCues(story: Story, s: State): void {
 for(const cue of story.cues) {
   if(cue.tick>s.tick || s.fired.includes(cue.id) || (cue.requiredEvidence&&!s.evidence.includes(cue.requiredEvidence))) continue;
   if(cue.waitForArrival && s.moveOutcomes[cue.waitForArrival.actorId]?.station!==cue.waitForArrival.station) continue;
   s.fired.push(cue.id);
   if(cue.kind==='dialogue') s.transcript.push({tick:s.tick,actorId:cue.actorId,text:safeText(cue.value)});
   if(cue.kind==='animation') s.animations[cue.actorId]=cue.value;
   if(cue.kind==='emotion' && moods.includes(cue.value as Mood)) s.mood[cue.actorId]=cue.value as Mood;
   if(cue.kind==='evidence'&&!s.evidence.includes(cue.value)) s.evidence.push(cue.value);
   if(cue.kind==='phase'&&phases.includes(cue.value as Phase)) s.phase=cue.value as Phase;
   if(cue.kind==='move'&&STATION_IDS.includes(cue.value)) { s.positions[cue.actorId]=cue.value; delete s.moveOutcomes[cue.actorId]; }
 }
}
const ROLES: readonly Role[] = ['judge', 'prosecutor', 'defense', 'witness', 'jester'];
const CUE_KINDS: readonly CueKind[] = ['dialogue', 'emotion', 'animation', 'evidence', 'phase', 'move'];
const ACTOR_ID = /^[a-z0-9_-]{1,64}$/i;
/** Structural check for an imported story (untrusted JSON). Also enforces unique ids and that cues name real actors. */
export function validateStory(value: unknown): value is Story {
 if(!value || typeof value!=='object')return false;
 const s=value as Partial<Story>;
 if(!(s.version===1 && typeof s.id==='string' && typeof s.title==='string' && Array.isArray(s.actors)&&s.actors.length<=64 && Array.isArray(s.cues)&&s.cues.length<=5000)) return false;
 const actorIds=new Set<string>();
 for(const a of s.actors){
  if(!a||typeof a!=='object'||typeof a.id!=='string'||!ACTOR_ID.test(a.id)||actorIds.has(a.id)) return false;
  if(typeof a.name!=='string'||typeof a.asset!=='string'||!ROLES.includes(a.role)) return false;
  // assets must be same-origin absolute paths (no scheme, no protocol-relative, no traversal)
  if(!/^\/[a-zA-Z0-9_./-]+$/.test(a.asset)||a.asset.includes('..')||a.asset.startsWith('//')) return false;
  actorIds.add(a.id);
 }
 const cueIds=new Set<string>();
 for(const c of s.cues){
  if(!c||typeof c!=='object'||typeof c.id!=='string'||cueIds.has(c.id)) return false;
  if(!(Number.isInteger(c.tick)&&c.tick>=0&&c.tick<=108000&&typeof c.actorId==='string'&&actorIds.has(c.actorId)&&typeof c.value==='string'&&c.value.length<=500&&CUE_KINDS.includes(c.kind))) return false;
  if(c.kind==='move'&&!STATION_IDS.includes(c.value)) return false; // a move cue must name a real station
  if(c.waitForArrival!==undefined&&(!c.waitForArrival||typeof c.waitForArrival.actorId!=='string'||!actorIds.has(c.waitForArrival.actorId)||!STATION_IDS.includes(c.waitForArrival.station))) return false;
  if(c.requiredEvidence!==undefined&&(typeof c.requiredEvidence!=='string'||c.requiredEvidence.length>200)) return false;
  cueIds.add(c.id);
 }
 return true;
}
export const sampleStory:Story={version:1,id:'demo-fictional-001',title:'The Missing Ledger',actors:[
 {id:'alice',role:'defense',name:'Alice',asset:'/models/courtroom/character_alice_skinned.glb',clips:{idle:'idle',talk:'talk',gesture:'gesture'},personality:{patience:75,honesty:90}},
 {id:'jester',role:'jester',name:'Jester',asset:'/models/courtroom/character_alice_skinned.glb',clips:{idle:'idle',talk:'talk'},personality:{patience:40,honesty:55}}
],cues:[
 {id:'opening',tick:1,actorId:'alice',kind:'phase',value:'opening'},
 {id:'alice-idle',tick:1,actorId:'alice',kind:'animation',value:'idle'},
 {id:'welcome',tick:15,actorId:'alice',kind:'dialogue',value:'The court calls the fictional case of the missing ledger.'},
 {id:'start-testimony',tick:120,actorId:'alice',kind:'phase',value:'testimony'},
 {id:'jester-nerves',tick:130,actorId:'jester',kind:'emotion',value:'nervous'},
 {id:'jester-speaks',tick:155,actorId:'jester',kind:'dialogue',value:'I saw the ledger near the south door.'},
 {id:'new-evidence',tick:180,actorId:'alice',kind:'evidence',value:'ledger-photo'},
 {id:'jester-takes-stand',tick:200,actorId:'jester',kind:'move',value:'witness'},
 {id:'cross',tick:240,actorId:'alice',kind:'phase',value:'cross',waitForArrival:{actorId:'jester',station:'witness'}},
 {id:'closing',tick:450,actorId:'alice',kind:'phase',value:'verdict',requiredEvidence:'ledger-photo'}
]};

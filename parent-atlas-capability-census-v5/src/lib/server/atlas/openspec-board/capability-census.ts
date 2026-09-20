export type CapabilityState = 'PROVEN'|'PRESENT_CONTRACT'|'WAITING'|'UNPROVEN'|'OPTIONAL_DEFERRED';
export type CapabilityCriticality = 'P10_CRITICAL'|'UTILITY_REQUIRED'|'CHALLENGER_OPTIONAL'|'OPTIONAL_DEFERRED';
export interface ParentAtlasCapabilityV1 { id:string; group:string; label:string; state:CapabilityState; criticality:CapabilityCriticality; matchingFiles:string[]; qualifyingReports:string[]; }
export interface ParentAtlasCapabilityCensusV1 { schema:'atlas.parent-capability-census.v1'; generatedAt:string; semanticChecksum:string; summary:Record<string,number>; capabilities:ParentAtlasCapabilityV1[]; writesPerformed:false; }
export function p10Missing(c:ParentAtlasCapabilityCensusV1){ return c.capabilities.filter(x=>x.criticality==='P10_CRITICAL' && x.state!=='PROVEN'); }
export function utilityMissing(c:ParentAtlasCapabilityCensusV1){ return c.capabilities.filter(x=>x.criticality==='UTILITY_REQUIRED' && x.state!=='PROVEN'); }

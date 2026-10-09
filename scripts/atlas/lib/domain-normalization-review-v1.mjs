/** Domain label diagnostic; exact matching is not ontology admission.
 * TODO: use reviewed taxonomy/version alias adapter and Oaklib ID resolver.
 */
export function reviewDomainLabelV1({label,domains=[],ontologyGroups=[],aliases=[]}={}) {
 if(typeof label!=='string'||!label.trim())return {state:'UNKNOWN',admitted:false};
 const canonical=domains.includes(label)?label:null;
 const exact=ontologyGroups.includes(label)?label:null;
 const targets=[...new Set(aliases.filter(x=>x.from===label&&x.reviewed===true&&ontologyGroups.includes(x.to)).map(x=>x.to))];
 const state=exact?'EXACT':targets.length>1?'AMBIGUOUS':targets.length===1?'ALIAS_PROPOSED':canonical?'UNMAPPED_CLASSIFIER_LABEL':'UNKNOWN';
 return {schema:'atlas.domain-label-review.v1',rawLabel:label,canonicalDomain:canonical,ontologyGroupId:exact,
 proposedOntologyGroupId:state==='ALIAS_PROPOSED'?targets[0]:null,state,admitted:false};
}

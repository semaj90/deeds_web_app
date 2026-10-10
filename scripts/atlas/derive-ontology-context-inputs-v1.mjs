/** Diagnostic input derivation; no canonical admission, I/O, or side effects. */
const present = x => typeof x === 'string' && x.trim().length > 0;
export function planOntologyContextInputsV1({candidate, relation, tuple, manifest, cacheHint} = {}) {
  const gates = [];
  const add = (name, pass, reason) => gates.push({name, status: pass ? 'IDENTITY_CLAIMS_MATCH' : 'BLOCKED', reason: pass ? null : reason});
  const candidateOK = present(candidate?.packetKey) && present(candidate?.sourceRef) &&
    present(candidate?.sourceRevision) && present(candidate?.workspaceRevision) &&
    present(candidate?.ordinalMapChecksum) && candidate?.ordinalMapIntegrityVerified === true;
  add('CANONICAL_CANDIDATE', candidateOK, 'CURRENT_ORDINAL_MAP_OR_SOURCE_IDENTITY_MISSING');
  const relationOK = candidateOK && relation?.kind === 'RELATION' &&
    relation?.packetKey === candidate.packetKey && relation?.sourceRef === candidate.sourceRef &&
    relation?.sourceRevision === candidate.sourceRevision && relation?.spanVerified === true &&
    relation?.participantRolesVerified === true && present(relation?.evidenceRef);
  add('GROUNDED_RELATION', relationOK, 'SOURCE_GROUNDED_TYPED_RELATION_MISSING');
  const tupleOK = relationOK && tuple?.packetKey === candidate.packetKey &&
    tuple?.sourceRef === candidate.sourceRef && tuple?.provenance?.sourceRevision === candidate.sourceRevision &&
    tuple?.evidenceRefs?.includes(relation.evidenceRef) && present(tuple?.tupleId) &&
    present(tuple?.provenance?.ontologyRevision) && tuple?.admissionReadbackVerified === true;
  add('ONTOLOGY_TUPLE_READBACK', tupleOK, 'CANONICAL_ADMITTED_TUPLE_NOT_READ_BACK');
  const manifestOK = tupleOK && manifest?.identityChecksumVerified === true &&
    manifest?.sourceRefs?.includes(candidate.sourceRef) &&
    manifest?.admittedTupleIds?.includes(tuple.tupleId) &&
    manifest?.sourceRevision === candidate.sourceRevision &&
    manifest?.ontologyRevision === tuple.provenance.ontologyRevision;
  add('CONTEXT_MANIFEST_READBACK', manifestOK, 'MANIFEST_OR_REVISION_READBACK_MISSING');
  return {schema: 'atlas.ontology-context-input-plan.v1', gates,
    cacheHintStatus: cacheHint ? 'ROUTING_HINT_ONLY' : 'NOT_SUPPLIED',
    nextRequiredOwner: gates.find(x => x.status === 'BLOCKED')?.name ?? null,
    verifiedFactAdmission: false, liveProven: false, writesPerformed: false};
}
// TODO: Replace caller-supplied verification booleans with authoritative owner readbacks.
// TODO: Use existing OntologyLinkedTupleV1 and ContextManifestV2 validators and canonical hash.

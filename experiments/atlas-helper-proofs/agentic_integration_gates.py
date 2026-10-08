"""Fail-closed integration handoff contracts; NO production service calls.

TODO(real owner): attach real SourceExecution, SymbolRegistry, OaK, SearchRuntime,
ContextManifest and durable DAG adapters only after tests and approvals.
"""
from hashlib import sha256
import json

def _digest(value):
    return "sha256:"+sha256(json.dumps(value,sort_keys=True,separators=(",",":"),allow_nan=False).encode()).hexdigest()

def lineage_handoff(membership, parser_state, ast_match):
    if membership.get("status")!="EXACT_SNAPSHOT_MEMBERSHIP":
        return {"status":"BLOCKED_LINEAGE","reason":"NO_EXACT_SYMBOL_MEMBERSHIP","authorized":False}
    if parser_state!="EXECUTED" or ast_match!="EXACT_SYNTAX_SPAN":
        return {"status":"BLOCKED_AST","reason":"PARSER_PARITY_NOT_PROVEN","authorized":False}
    return {"status":"SNAPSHOT_PROPOSAL","packet_key":membership["packet_key"],
            "symbol_version_id":membership["symbol_version_id"],
            "source_revision":membership["source_revision"],
            "authorized":False,
            "todo":"TODO: read back source-execution lineage against live registry + admitted receipts"}

def ontology_handoff(lineage, taxonomy_revision, tuple_candidates, admitted_evidence_refs=()):
    if lineage.get("status")!="LIVE_ADMITTED_LINEAGE":
        return {"status":"BLOCKED_ONTOLOGY","reason":"LINEAGE_NOT_ADMITTED","authorized":False}
    if not taxonomy_revision or not tuple_candidates or not admitted_evidence_refs:
        return {"status":"UNKNOWN","reason":"ONTOLOGY_OR_EVIDENCE_UNRESOLVED","authorized":False}
    return {"status":"ONTOLOGY_PROPOSAL","tuples":tuple_candidates,"taxonomy_revision":taxonomy_revision,
            "authorized":False,
            "todo":"TODO: invoke existing oaklib resolver and Pydantic contract with ontology revision + evidence readback"}

def retrieval_handoff(ordinal_map, candidate_profiles, context_checksum):
    if not ordinal_map or not candidate_profiles or not context_checksum:
        return {"status":"BLOCKED_RETRIEVAL","reason":"ADMITTED_ORDINAL_MAP_OR_CONTEXT_MISSING","authorized":False}
    return {"status":"RETRIEVAL_CALLER_UNVERIFIED","reason":"NO_LIVE_SEARCHRUNTIME_READBACK","authorized":False,
            "todo":"TODO: use existing CandidateOrdinalMapV1 validator and ContextManifest owner; compare independent checksum"}

def execution_handoff(lineage, ontology, retrieval, approval_receipt):
    reasons=[]
    if lineage.get("status")!="LIVE_ADMITTED_LINEAGE": reasons.append("LINEAGE_NOT_ADMITTED")
    if ontology.get("status")!="LIVE_ADMITTED_ONTOLOGY": reasons.append("ONTOLOGY_NOT_ADMITTED")
    if retrieval.get("status")!="LIVE_VERIFIED_CONTEXT": reasons.append("CONTEXT_NOT_VERIFIED")
    if not approval_receipt: reasons.append("APPROVAL_MISSING")
    # Even full caller-supplied flags cannot activate a journal transaction.
    return {"status":"EXECUTION_BLOCKED","reasons":reasons or ["TRANSACTIONAL_OWNER_NOT_CONNECTED"],
            "authorized":False,"writes_performed":False,
            "todo":"TODO: bind deployed transactional adapter, CAS, approved tool identity and immutable terminal attempt receipt"}

def proof_manifest(handoffs):
    body={"schema":"atlas.agentic-integration-proof.v1","handoffs":handoffs,
          "canonical_authority":False,"production_caller_proven":False,"writes_performed":False}
    return {**body,"digest":_digest(body)}

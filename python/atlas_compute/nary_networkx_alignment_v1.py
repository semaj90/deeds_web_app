"""Revision-pinned N-ary incidence projection and bounded NetworkX CPU oracle.
Read-only. Requires preverified evidence envelopes; this module is not a DB verifier.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Mapping, Sequence
import hashlib
import json
from pathlib import Path
import yaml
from yaml.constructor import ConstructorError


class _UniqueKeyLoader(yaml.SafeLoader):
    def construct_mapping(self, node, deep=False):
        self.flatten_mapping(node)
        mapping = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in mapping:
                raise ConstructorError("while constructing a mapping", node.start_mark, "duplicate key", key_node.start_mark)
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def _canonical_json(value: object) -> str:
    if value is None or isinstance(value, (str, int, float, bool)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(_canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        entries = sorted(value.items(), key=lambda item: item[0].encode("utf-8"))
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + _canonical_json(item)
            for key, item in entries
        ) + "}"
    raise ValueError("NARY_PROPOSAL_VALUE_NOT_CANONICALIZABLE")


def _verify_admitted_proposal(proposal: Mapping[str, object], graph_revision: str) -> None:
    required = {
        "schema", "sourceRef", "sourceRevision", "workspaceRevision", "packetKey",
        "graphRevision", "producerRevision", "predicate", "participants",
        "predicatePolicy", "evidenceRefs", "proposalChecksum", "canonicalAuthority", "admission",
    }
    allowed = required | {"ontologyRevision"}
    if required - proposal.keys() or proposal.keys() - allowed:
        raise ValueError("NARY_PROPOSAL_FIELDS_INVALID")
    if proposal.get("schema") != "atlas.nary-fact-proposal.v1":
        raise ValueError("NARY_PROPOSAL_SCHEMA_UNSUPPORTED")
    if proposal.get("admission") != "ADMITTED" or proposal.get("canonicalAuthority") is not False:
        raise ValueError("NARY_PROPOSAL_NOT_ADMITTED_PROJECTION_ONLY")
    if proposal.get("graphRevision") != graph_revision:
        raise ValueError("NARY_PROPOSAL_GRAPH_REVISION_MISMATCH")
    for field in ("sourceRef", "sourceRevision", "workspaceRevision", "packetKey", "producerRevision"):
        value = proposal.get(field)
        if not isinstance(value, str) or not value.strip():
            raise ValueError("NARY_PROPOSAL_LINEAGE_INCOMPLETE:" + field)
    checksum = proposal.get("proposalChecksum")
    if not isinstance(checksum, str) or len(checksum) != 64 or any(char not in "0123456789abcdef" for char in checksum):
        raise ValueError("NARY_PROPOSAL_CHECKSUM_INVALID")
    body = {key: value for key, value in proposal.items() if key != "proposalChecksum"}
    actual = hashlib.sha256(_canonical_json(body).encode("utf-8")).hexdigest()
    if actual != checksum:
        raise ValueError("NARY_PROPOSAL_CHECKSUM_MISMATCH")
    _verify_predicate_policy_ref(proposal, proposal.get("predicatePolicy"))


def _verify_predicate_policy_ref(proposal: Mapping[str, object], policy_ref: object) -> None:
    if not isinstance(policy_ref, Mapping) or set(policy_ref) != {
        "schema", "registryDocumentSha256", "registrySchemaSha256"
    }:
        raise ValueError("NARY_PREDICATE_POLICY_REF_INVALID")
    if policy_ref.get("schema") != "atlas.okf.predicate-policy-ref.v1":
        raise ValueError("NARY_PREDICATE_POLICY_SCHEMA_UNSUPPORTED")
    repository_root = Path(__file__).resolve().parents[2]
    document_bytes = (repository_root / ".okf" / "predicates" / "feature-relationships.yaml").read_bytes()
    schema_bytes = (repository_root / ".okf" / "schemas" / "feature-relationships-v1.schema.json").read_bytes()
    if hashlib.sha256(document_bytes).hexdigest() != policy_ref.get("registryDocumentSha256"):
        raise ValueError("NARY_PREDICATE_REGISTRY_DIGEST_MISMATCH")
    if hashlib.sha256(schema_bytes).hexdigest() != policy_ref.get("registrySchemaSha256"):
        raise ValueError("NARY_PREDICATE_SCHEMA_DIGEST_MISMATCH")
    try:
        registry = yaml.load(document_bytes, Loader=_UniqueKeyLoader)
        json.loads(schema_bytes)
    except (UnicodeDecodeError, json.JSONDecodeError, yaml.YAMLError) as error:
        raise ValueError("NARY_PREDICATE_REGISTRY_PARSE_FAILED") from error
    if not isinstance(registry, Mapping):
        raise ValueError("NARY_PREDICATE_REGISTRY_INVALID")
    predicate = proposal.get("predicate")
    predicates = registry.get("predicates")
    policy = predicates.get(predicate) if isinstance(predicates, Mapping) and isinstance(predicate, str) else None
    if not isinstance(policy, Mapping) or policy.get("traversal_eligible") is not True:
        raise ValueError("NARY_PREDICATE_NOT_TRAVERSAL_ELIGIBLE")
    participants = proposal.get("participants")
    if not isinstance(participants, list):
        raise ValueError("NARY_PREDICATE_PARTICIPANTS_INVALID")
    entity_types = {
        row.get("entityType") for row in participants
        if isinstance(row, Mapping) and isinstance(row.get("entityType"), str)
    }
    degree = "nary" if len(entity_types) >= 4 else {1: "unary", 2: "binary", 3: "ternary"}.get(len(entity_types))
    allowed_degrees = policy.get("allowed_degree")
    if degree is None or not isinstance(allowed_degrees, list) or degree not in allowed_degrees:
        raise ValueError("NARY_PREDICATE_DEGREE_NOT_ALLOWED")


def build_snapshot_from_admitted_proposals(
    proposals: Sequence[Mapping[str, object]], *, graph_revision: str
) -> GraphSnapshot:
    """Project admitted TS n-ary proposals into role-labeled incidence.

    Proposal checksums bind the TS contract; the resulting graph remains a
    non-authoritative analysis projection and does not verify canonical owners.
    """
    facts = []
    for proposal in proposals:
        if not isinstance(proposal, Mapping):
            raise ValueError("NARY_PROPOSAL_ROW_INVALID")
        _verify_admitted_proposal(proposal, graph_revision)
        participants = proposal.get("participants")
        evidence_refs = proposal.get("evidenceRefs")
        if not isinstance(participants, list) or not 3 <= len(participants) <= 64:
            raise ValueError("NARY_PROPOSAL_PARTICIPANTS_INVALID")
        if not isinstance(evidence_refs, list) or not evidence_refs:
            raise ValueError("NARY_PROPOSAL_EVIDENCE_REQUIRED")
        participant_ids = []
        participant_node_keys = []
        participant_roles = []
        for participant in participants:
            if not isinstance(participant, Mapping):
                raise ValueError("NARY_PROPOSAL_PARTICIPANT_INVALID")
            allowed_fields = {"canonicalId", "role", "entityType", "ordinal", "entityRevision", "sourceRef"}
            required_fields = {"canonicalId", "role", "entityType"}
            if required_fields - participant.keys() or participant.keys() - allowed_fields:
                raise ValueError("NARY_PROPOSAL_PARTICIPANT_FIELDS_INVALID")
            canonical_id = participant.get("canonicalId")
            entity_type = participant.get("entityType")
            role = participant.get("role")
            if not all(isinstance(value, str) and value.strip() for value in (canonical_id, entity_type, role)):
                raise ValueError("NARY_PROPOSAL_PARTICIPANT_IDENTITY_INCOMPLETE")
            participant_ids.append(canonical_id.strip())
            participant_node_keys.append(entity_type.strip().lower() + ":" + canonical_id.strip())
            participant_roles.append(role.strip())
        facts.append({
            "fact_id": proposal["proposalChecksum"],
            "graph_revision": graph_revision,
            "checksum": proposal["proposalChecksum"],
            "evidence_refs": evidence_refs,
            "predicate": proposal["predicate"],
            "predicate_policy": proposal.get("predicatePolicy"),
            "participant_ids": participant_ids,
            "participant_node_keys": participant_node_keys,
            "participant_roles": participant_roles,
        })
    return build_snapshot(facts, graph_revision=graph_revision)


def build_role_incidence_csr_v1(snapshot: GraphSnapshot) -> dict[str, object]:
    _verify_graph_snapshot(snapshot)
    entity_nodes = tuple(sorted(set(snapshot.nodes) - set(snapshot.fact_nodes)))
    fact_nodes = tuple(sorted(snapshot.fact_nodes))
    entity_ordinals = {node: ordinal for ordinal, node in enumerate(entity_nodes)}
    fact_ordinals = {node: ordinal for ordinal, node in enumerate(fact_nodes)}
    role_pairs: dict[str, set[tuple[int, int]]] = {}
    for source, target, role in snapshot.edges:
        if (source not in fact_ordinals or target not in entity_ordinals
                or not isinstance(role, str) or not role.strip()):
            raise ValueError("GRAPH_INCIDENCE_EDGE_INVALID")
        role_pairs.setdefault(role, set()).add((entity_ordinals[target], fact_ordinals[source]))

    matrices = {}
    for role in sorted(role_pairs):
        pairs = sorted(role_pairs[role])
        row_entries: list[list[int]] = [[] for _ in entity_nodes]
        for row, column in pairs:
            row_entries[row].append(column)
        indptr = [0]
        indices = []
        for columns in row_entries:
            indices.extend(sorted(set(columns)))
            indptr.append(len(indices))
        matrices[role] = {
            "shape": [len(entity_nodes), len(fact_nodes)],
            "indptr": indptr,
            "indices": indices,
            "data": [1] * len(indices),
        }

    body = {
        "schema": "atlas.nary-incidence-csr.v1",
        "graphRevision": snapshot.graph_revision,
        "sourceSnapshotChecksum": snapshot.checksum,
        "entityOrdinals": list(entity_nodes),
        "factOrdinals": list(fact_nodes),
        "roles": matrices,
        "canonicalAuthority": False,
    }
    checksum = hashlib.sha256(
        json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {**body, "matrixChecksum": checksum}


def _verify_graph_snapshot(snapshot: GraphSnapshot) -> None:
    if not isinstance(snapshot.graph_revision, str) or not snapshot.graph_revision.strip():
        raise ValueError("GRAPH_SNAPSHOT_IDENTITY_INCOMPLETE")
    if (tuple(sorted(set(snapshot.nodes))) != snapshot.nodes
            or tuple(sorted(set(snapshot.edges))) != snapshot.edges
            or tuple(sorted(set(snapshot.fact_nodes))) != snapshot.fact_nodes
            or tuple(sorted(set(snapshot.fact_evidence))) != snapshot.fact_evidence
            or tuple(sorted(set(snapshot.fact_predicates))) != snapshot.fact_predicates):
        raise ValueError("GRAPH_SNAPSHOT_ROWS_NOT_CANONICAL")
    node_set = set(snapshot.nodes)
    fact_set = set(snapshot.fact_nodes)
    if not fact_set.issubset(node_set):
        raise ValueError("GRAPH_SNAPSHOT_FACT_NODE_MISSING")
    evidence_facts = {fact_node for fact_node, _, _ in snapshot.fact_evidence}
    predicate_facts = {fact_node for fact_node, _, _, _ in snapshot.fact_predicates}
    if not predicate_facts.issubset(fact_set):
        raise ValueError("GRAPH_SNAPSHOT_PREDICATE_FACT_MISSING")
    if evidence_facts != fact_set or any(source not in fact_set or target not in node_set - fact_set
                                         for source, target, _ in snapshot.edges):
        raise ValueError("GRAPH_SNAPSHOT_INCIDENCE_INVALID")
    payload = {
        "revision": snapshot.graph_revision,
        "nodes": snapshot.nodes,
        "edges": snapshot.edges,
        "fact_evidence": snapshot.fact_evidence,
        "fact_predicates": snapshot.fact_predicates,
    }
    actual = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if actual != snapshot.checksum:
        raise ValueError("GRAPH_SNAPSHOT_CHECKSUM_MISMATCH")

@dataclass(frozen=True)
class GraphSnapshot:
    graph_revision: str
    nodes: tuple[str,...]
    edges: tuple[tuple[str,str,str],...]
    fact_nodes: tuple[str,...]
    fact_evidence: tuple[tuple[str,str,tuple[str,...]],...]
    fact_predicates: tuple[tuple[str, str, str | None, str | None], ...]
    checksum: str

def build_snapshot(facts: Sequence[Mapping[str,object]], *, graph_revision: str) -> GraphSnapshot:
    if not graph_revision.strip(): raise ValueError("GRAPH_REVISION_REQUIRED")
    nodes=set(); edges=set(); fact_nodes=set(); ids=set(); fact_evidence=[]; fact_predicates=[]
    for fact in facts:
        fid=str(fact.get("fact_id") or "")
        if not fid or fid in ids: raise ValueError("GRAPH_FACT_ID_DUPLICATE_OR_MISSING")
        ids.add(fid)
        if fact.get("graph_revision")!=graph_revision: raise ValueError("GRAPH_FACT_REVISION_MISMATCH")
        fact_checksum=fact.get("checksum")
        evidence_refs=fact.get("evidence_refs")
        if not isinstance(fact_checksum,str) or not fact_checksum.strip():
            raise ValueError("GRAPH_FACT_CHECKSUM_REQUIRED")
        if not isinstance(evidence_refs,(tuple,list)) or not evidence_refs:
            raise ValueError("GRAPH_FACT_EVIDENCE_REQUIRED")
        if any(not isinstance(ref,str) or not ref.strip() for ref in evidence_refs):
            raise ValueError("GRAPH_FACT_EVIDENCE_INVALID")
        canonical_refs=tuple(sorted(set(evidence_refs)))
        participants=fact.get("participant_ids")
        roles=fact.get("participant_roles")
        if not isinstance(participants,(tuple,list)) or not isinstance(roles,(tuple,list)) or len(participants)<2 or len(roles)!=len(participants):
            raise ValueError("GRAPH_FACT_ROLES_MISMATCH")
        participant_node_keys=fact.get("participant_node_keys")
        if participant_node_keys is not None and (
            not isinstance(participant_node_keys,(tuple,list)) or len(participant_node_keys)!=len(participants)
        ):
            raise ValueError("GRAPH_FACT_NODE_KEYS_MISMATCH")
        fact_node="fact:"+fid
        fact_nodes.add(fact_node); nodes.add(fact_node)
        fact_evidence.append((fact_node,fact_checksum.strip(),canonical_refs))
        predicate = fact.get("predicate")
        if predicate is not None:
            if not isinstance(predicate, str) or not predicate.strip():
                raise ValueError("GRAPH_FACT_PREDICATE_INVALID")
            policy_ref = fact.get("predicate_policy")
            registry_digest = policy_ref.get("registryDocumentSha256") if isinstance(policy_ref, Mapping) else None
            schema_digest = policy_ref.get("registrySchemaSha256") if isinstance(policy_ref, Mapping) else None
            fact_predicates.append((fact_node, predicate.strip(), registry_digest, schema_digest))
        for index,(participant,role) in enumerate(zip(participants,roles)):
            if not isinstance(participant,str) or not participant.strip() or not isinstance(role,str) or not role.strip():
                raise ValueError("GRAPH_FACT_PARTICIPANT_INVALID")
            node=participant_node_keys[index] if participant_node_keys is not None else "packet:"+participant
            if not isinstance(node,str) or not node.strip(): raise ValueError("GRAPH_FACT_NODE_KEY_INVALID")
            nodes.add(node); edges.add((fact_node,node,role))
    ordered_nodes=tuple(sorted(nodes))
    ordered_edges=tuple(sorted(edges))
    ordered_fact_evidence=tuple(sorted(fact_evidence))
    ordered_fact_predicates=tuple(sorted(fact_predicates))
    payload=dict(revision=graph_revision,nodes=ordered_nodes,edges=ordered_edges,fact_evidence=ordered_fact_evidence,fact_predicates=ordered_fact_predicates)
    checksum=hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    return GraphSnapshot(graph_revision,ordered_nodes,ordered_edges,tuple(sorted(fact_nodes)),ordered_fact_evidence,ordered_fact_predicates,checksum)

def bounded_neighbors(snapshot: GraphSnapshot, *, packet_key: str, max_hops:int=2, max_nodes:int=128) -> tuple[str,...]:
    import networkx as nx
    if not 0<=max_hops<=4 or not 1<=max_nodes<=4096: raise ValueError("GRAPH_BUDGET_INVALID")
    origin="packet:"+packet_key
    if origin not in snapshot.nodes: return ()
    graph=nx.Graph()
    graph.add_nodes_from(snapshot.nodes)
    graph.add_edges_from((a,b) for a,b,_ in snapshot.edges)
    distances=nx.single_source_shortest_path_length(graph, origin, cutoff=max_hops)
    return tuple(x for x in sorted(distances,key=lambda n:(distances[n],n))[:max_nodes] if x!=origin)

def bounded_multi_source_neighbors(
    snapshot: GraphSnapshot,
    *,
    packet_keys: Sequence[str],
    max_hops: int = 2,
    max_nodes: int = 128,
) -> tuple[tuple[str, int], ...]:
    import networkx as nx
    if not 0 <= max_hops <= 4 or not 1 <= max_nodes <= 4096:
        raise ValueError("GRAPH_BUDGET_INVALID")
    if not packet_keys or any(not isinstance(key, str) or not key.strip() for key in packet_keys):
        raise ValueError("GRAPH_SEEDS_INVALID")
    if len(set(packet_keys)) != len(packet_keys):
        raise ValueError("GRAPH_SEEDS_DUPLICATE")
    origins = tuple("packet:" + key for key in packet_keys)
    missing = tuple(origin for origin in origins if origin not in snapshot.nodes)
    if missing:
        raise ValueError("GRAPH_SEED_UNRESOLVED")
    graph = nx.Graph()
    graph.add_nodes_from(snapshot.nodes)
    graph.add_edges_from((source, target) for source, target, _ in snapshot.edges)
    distances = nx.multi_source_dijkstra_path_length(
        graph,
        origins,
        cutoff=max_hops,
        weight=None,
    )
    excluded = set(origins)
    ordered = sorted(
        ((node, distance) for node, distance in distances.items() if node not in excluded),
        key=lambda item: (item[1], item[0]),
    )
    return tuple(ordered[:max_nodes])

def pagerank_cpu(snapshot: GraphSnapshot, *, alpha:float=.85)->dict[str,float]:
    import networkx as nx
    graph=nx.DiGraph()
    graph.add_nodes_from(snapshot.nodes)
    # Preserve the canonical tuple -> participant direction. This incidence
    # projection is still not a canonical typed code edge or an admitted fact.
    graph.add_edges_from((a,b) for a,b,_ in snapshot.edges)
    return dict(nx.pagerank(graph,alpha=alpha)) if snapshot.nodes else {}

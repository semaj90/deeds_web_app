"""Strict offline source-to-symbol membership proof. JSON input is a snapshot, not DB authority."""
from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path

@dataclass(frozen=True)
class SymbolMembership:
    packet_key: str
    symbol_version_id: str
    tree_node_id: str
    source_ref: str
    source_revision: str
    workspace_revision: str
    start_byte: int
    end_byte: int
    content_sha256: str
    execution_id: str

def verify_membership(source: bytes, source_ref: str, expected_workspace_revision: str,
                      start_byte: int, end_byte: int, records: list[dict]):
    if not isinstance(source, bytes) or not source_ref or not expected_workspace_revision:
        raise ValueError("INVALID_SOURCE_INPUT")
    if type(start_byte) is not int or type(end_byte) is not int or not (0 <= start_byte < end_byte <= len(source)):
        raise ValueError("INVALID_SOURCE_SPAN")
    revision="sha256:"+sha256(source).hexdigest()
    slice_digest="sha256:"+sha256(source[start_byte:end_byte]).hexdigest()
    matches=[]
    for value in records:
        try:
            record=SymbolMembership(**value)
        except (TypeError, ValueError) as exc:
            raise ValueError("MALFORMED_MEMBERSHIP_RECORD") from exc
        if record.source_ref==source_ref and record.source_revision==revision and record.workspace_revision==expected_workspace_revision and record.start_byte==start_byte and record.end_byte==end_byte:
            matches.append(record)
    if not matches:
        return {"status":"NO_EXACT_MEMBERSHIP","source_revision":revision,"canonical_authority":False}
    if len(matches)!=1:
        return {"status":"AMBIGUOUS_MEMBERSHIP","source_revision":revision,"canonical_authority":False}
    match=matches[0]
    mandatory=(match.packet_key,match.symbol_version_id,match.tree_node_id,match.execution_id)
    if any(not isinstance(x,str) or not x.strip() for x in mandatory) or match.content_sha256!=slice_digest:
        return {"status":"UNQUALIFIED_MEMBERSHIP","source_revision":revision,"canonical_authority":False}
    return {"status":"EXACT_SNAPSHOT_MEMBERSHIP","source_revision":revision,
            "packet_key":match.packet_key,"symbol_version_id":match.symbol_version_id,
            "tree_node_id":match.tree_node_id,"execution_id":match.execution_id,
            "workspace_revision":match.workspace_revision,
            "content_sha256":slice_digest,
            "canonical_authority":False,
            "todo":"TODO: independent live DB readback and admitted EvidenceCard still required"}

def load_snapshot(path: Path, size_limit=2_000_000):
    if not path.is_file() or path.stat().st_size>size_limit:
        raise ValueError("INVALID_MEMBERSHIP_SNAPSHOT")
    value=json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value,dict) or value.get("schema")!="atlas.symbol-membership-snapshot.v1" or not isinstance(value.get("records"),list):
        raise ValueError("INVALID_MEMBERSHIP_SCHEMA")
    return value["records"]

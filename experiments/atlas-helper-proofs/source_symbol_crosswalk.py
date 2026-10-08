"""Read-only exact source/chunk/symbol join. Never synthesizes packet keys."""
from dataclasses import dataclass
from typing import Iterable

@dataclass(frozen=True)
class SourceMember:
    packet_key: str
    source_ref: str
    source_revision: str
    workspace_revision: str
    start_byte: int
    end_byte: int
    symbol_version_id: str

def join_spans(spans: Iterable, members: Iterable[SourceMember]):
    members = tuple(members)
    results = []
    for span in spans:
        matched = [m for m in members if m.source_ref == span.source_ref
                   and m.source_revision == span.source_revision
                   and m.start_byte == span.start_byte and m.end_byte == span.end_byte]
        if len(matched) != 1:
            results.append({"status": "NO_EXACT_MEMBERSHIP" if not matched else "AMBIGUOUS_MEMBERSHIP",
                            "span": span, "member": None})
            continue
        m = matched[0]
        if not m.packet_key or not m.symbol_version_id or not m.workspace_revision:
            results.append({"status": "UNQUALIFIED_MEMBERSHIP", "span": span, "member": None})
        else:
            results.append({"status": "EXACT_MEMBER_PROPOSAL", "span": span, "member": m})
    return results

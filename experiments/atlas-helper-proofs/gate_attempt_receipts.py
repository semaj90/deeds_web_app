"""Immutable, content-addressed attempt receipts. Proposal-only, no authorization."""
from dataclasses import dataclass, asdict
from hashlib import sha256
import json
from pathlib import Path

TERMINAL = frozenset({"COMPLETED", "FAILED", "SUPERSEDED", "CANCELLED"})

@dataclass(frozen=True)
class AttemptReceipt:
    request_id: str
    attempt_id: str
    plan_revision: str
    outcome: str
    reason: str
    previous_receipt_digest: str | None = None
    superseded_by_attempt_id: str | None = None
    hmm_predicted_state: str | None = None

def canonical(receipt):
    return json.dumps(asdict(receipt), sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()

def seal(receipt: AttemptReceipt):
    if any(not isinstance(s, str) or not s.strip() for s in
           (receipt.request_id, receipt.attempt_id, receipt.plan_revision, receipt.reason)):
        raise ValueError("RECEIPT_IDENTITY_OR_REASON_MISSING")
    if receipt.outcome not in TERMINAL:
        raise ValueError("NONTERMINAL_OUTCOME")
    if receipt.outcome == "SUPERSEDED" and not receipt.superseded_by_attempt_id:
        raise ValueError("SUPERSESSION_TARGET_REQUIRED")
    if receipt.outcome != "SUPERSEDED" and receipt.superseded_by_attempt_id is not None:
        raise ValueError("INVALID_SUPERSESSION")
    if receipt.superseded_by_attempt_id == receipt.attempt_id:
        raise ValueError("SELF_SUPERSESSION")
    if receipt.previous_receipt_digest is not None and (
        not receipt.previous_receipt_digest.startswith("sha256:") or
        len(receipt.previous_receipt_digest) != 71):
        raise ValueError("INVALID_PREVIOUS_DIGEST")
    body = asdict(receipt)
    return {"schema":"atlas.attempt-terminal-receipt.v1","receipt":body,
            "receipt_digest":"sha256:"+sha256(canonical(receipt)).hexdigest(),
            "authorization":False,"writes_performed":False}

def write_once(path: Path, document: dict):
    """Atomic exclusive creation; existing receipts are never edited or superseded in-place."""
    path = Path(path)
    if path.is_symlink():
        raise ValueError("SYMLINK_NOT_ALLOWED")
    with path.open("x",encoding="utf-8") as handle:
        json.dump(document,handle,sort_keys=True,separators=(",",":"))
    actual=json.loads(path.read_text(encoding="utf-8"))
    if actual != document or actual["receipt_digest"] != (
        "sha256:"+sha256(canonical(AttemptReceipt(**actual["receipt"]))).hexdigest()):
        raise ValueError("RECEIPT_READBACK_MISMATCH")
    return actual

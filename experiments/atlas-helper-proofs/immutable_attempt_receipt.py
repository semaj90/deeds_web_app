"""Append-only attempt receipts; supersession terminates old attempt, never authorizes actions."""
from dataclasses import asdict, dataclass
from hashlib import sha256
from pathlib import Path
import json, os

TERMINAL = frozenset(("COMPLETED", "FAILED", "SUPERSEDED", "CANCELLED"))

@dataclass(frozen=True)
class AttemptReceipt:
    request_id: str
    attempt_id: str
    plan_revision: str
    outcome: str
    reason: str
    superseded_by: str | None = None
    hmm_predicted_state: str | None = None
    authorization_ref: str | None = None

def receipt_payload(r: AttemptReceipt) -> dict:
    if not all((r.request_id, r.attempt_id, r.plan_revision, r.reason)):
        raise ValueError("INCOMPLETE_ATTEMPT")
    if r.outcome not in TERMINAL:
        raise ValueError("NON_TERMINAL_OUTCOME")
    if (r.outcome == "SUPERSEDED") != bool(r.superseded_by):
        raise ValueError("INVALID_SUPERSESSION")
    if r.superseded_by == r.attempt_id:
        raise ValueError("SELF_SUPERSESSION")
    body = {"schema":"atlas.attempt-terminal-receipt.v1", **asdict(r),
            "canonical_authority":False, "writes_performed":False}
    body["digest"] = "sha256:" + sha256(json.dumps(body,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    return body

def write_once(directory: Path, r: AttemptReceipt) -> Path:
    """Exclusive create, never replace. Caller must supply an approved scratch directory."""
    directory=Path(directory).resolve()
    if not directory.is_dir():
        raise ValueError("RECEIPT_DIRECTORY_MISSING")
    if not r.attempt_id.isascii() or not all(c.isalnum() or c in "_-" for c in r.attempt_id):
        raise ValueError("UNSAFE_ATTEMPT_ID")
    target=directory/(r.attempt_id+".json")
    fd=os.open(target, os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as out:
            json.dump(receipt_payload(r),out,sort_keys=True)
            out.write("\n")
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    return target

def validate_readback(path: Path) -> dict:
    saved=json.loads(Path(path).read_text())
    digest=saved.pop("digest")
    if "sha256:"+sha256(json.dumps(saved,sort_keys=True,separators=(",",":")).encode()).hexdigest()!=digest:
        raise ValueError("RECEIPT_DIGEST_MISMATCH")
    saved["digest"]=digest
    return saved

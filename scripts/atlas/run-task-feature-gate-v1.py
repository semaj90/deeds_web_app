"""Run task_feature_gate_v1.py against real OpenSpec tasks.md files, taxonomy-crosswalk-v1, and live tournament/Arrow receipts.

Read-only / non-canonical (`canonicalAuthority=False`, `writesPerformed=False`).
Writes `docs/reports/task-feature-gate-receipt-v1.json`.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

from atlas_graph_runtime.task_feature_gate_v1 import (
    build_idempotent_queue_proposals_v1,
    build_task_domain_csr_v1,
    build_task_keyword_csr_v1,
    evaluate_tournament_promotion_gate_v1,
)

TASK_FILES = [
    "openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md",
    "openspec/changes/parent-atlas-workstation-domain-classifier/tasks.md",
    "openspec/changes/parent-atlas-versioned-doc-intelligence/tasks.md",
    "openspec/changes/parent-atlas-tensor-residency-integration/tasks.md",
]
ALLOWED_DOMAINS = [
    "api", "auth", "cache", "compiler", "database", "devops", "error-handling",
    "frontend", "gpu", "graph", "machine-learning", "retrieval", "test",
    "database.postgresql", "devops.env-config", "devops.process-mgmt", "frontend.sveltekit",
]
_OPEN_TASK_RE = re.compile(r"^\s*-\s+\[\s\]\s+(.+)$")


def _extract_open_tasks(limit_per_file: int = 10) -> list[dict]:
    tasks: list[dict] = []
    for rel in TASK_FILES:
        abs_path = REPO_ROOT / rel
        if not abs_path.is_file():
            continue
        raw_bytes = abs_path.read_bytes()
        file_sha = f"sha256:{hashlib.sha256(raw_bytes).hexdigest()}"
        text = raw_bytes.decode("utf-8", errors="replace")
        change_name = abs_path.parent.name
        count = 0
        for line_no, line in enumerate(text.splitlines(), start=1):
            m = _OPEN_TASK_RE.match(line)
            if not m:
                continue
            count += 1
            body = m.group(1).strip()
            lowered = body.lower()
            proposed = []
            for dom in ("retrieval", "graph", "gpu", "cache", "database.postgresql", "machine-learning", "compiler"):
                if dom.split(".")[0] in lowered:
                    proposed.append(dom)
            tasks.append({
                "taskId": f"{change_name}:L{line_no}",
                "taskRevision": f"line:{line_no}:{file_sha[:19]}",
                "scope": "repo:deeds",
                "sourceRef": rel,
                "sourceSha256": file_sha,
                "text": body[:240],
                "proposedDomains": proposed,
            })
            if count >= limit_per_file:
                break
    return tasks


def main() -> int:
    tasks = _extract_open_tasks(limit_per_file=10)
    kw_csr = build_task_keyword_csr_v1(tasks)
    dom_csr = build_task_domain_csr_v1(tasks, allowed_domains=ALLOWED_DOMAINS)
    queue_proposals = build_idempotent_queue_proposals_v1(tasks)

    tourney = json.loads(
        (REPO_ROOT / "docs" / "reports" / "cpu-challenger-tournament-v1.json").read_text(encoding="utf-8")
    )
    feat_receipt = json.loads(
        (REPO_ROOT / "docs" / "reports" / "feature-matrix-5-receipt-v1.json").read_text(encoding="utf-8")
    )
    gate = evaluate_tournament_promotion_gate_v1(tourney, feat_receipt, min_eval_rows=30)

    out = {
        "schema": "atlas.task-feature-gate-receipt.v1",
        "taskCount": len(tasks),
        "keywordCsr": {
            "shape": kw_csr["shape"],
            "nnz": kw_csr["nnz"],
            "csrChecksum": kw_csr["csrChecksum"],
        },
        "domainCsr": {
            "shape": dom_csr["shape"],
            "nnz": dom_csr["nnz"],
            "csrChecksum": dom_csr["csrChecksum"],
            "proposalOnly": True,
        },
        "queueProposalCount": len(queue_proposals),
        "sampleQueueProposal": queue_proposals[0] if queue_proposals else None,
        "tournamentPromotionGate": gate,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }

    out_path = REPO_ROOT / "docs" / "reports" / "task-feature-gate-receipt-v1.json"
    out_path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**out, "reportPath": str(out_path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
